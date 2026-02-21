import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = { gameId: string; winner: "W" | "B"; reason: string }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function eloUpdate(rA: number, rB: number, aWon: boolean, k = 24) {
  const EA = 1 / (1 + Math.pow(10, (rB - rA) / 400))
  const SA = aWon ? 1 : 0
  const newA = Math.round(rA + k * (SA - EA))
  const newB = Math.round(rB + k * ((1 - SA) - (1 - EA)))
  return { newA, newB }
}

// Rating policy: timeout wins are still wins, but award reduced Elo gain to the winner.
const TIMEOUT_WIN_GAIN_MULTIPLIER = 0.4

function isTimeout(reason: string) {
  return String(reason ?? "")
    .trim()
    .toLowerCase()
    .startsWith("timeout")
}

// ✅ Your real AI auth user IDs
const AI_IDS = new Set<string>([
  "d90c1ec7-a586-4594-85ad-702beca6af45", // Glen (novice)
  "9d6503a7-1b18-46d4-878d-09367d6ac833", // Priya (adept)
  "69174323-2b15-4b83-b1d7-96a324bce0a4", // Vladimir (expert)
  "bb5802a3-1f76-43f8-9bf3-2ac65d618cfe", // Yui (master)
  "92c903e8-aa7d-4571-9905-0611b4a07a1d", // Haoran (senior_master)
  "492a8702-9470-4f43-85e0-d6b44ec5c562", // Chioma (grandmaster)
])

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" })

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(401, { error: "Missing bearer token" })

    const URL = Deno.env.get("SUPABASE_URL")!
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
    const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    if (!URL || !ANON || !SRV) return json(500, { error: "Missing Supabase env vars" })

    // Verify caller
    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })
    const callerId = u.user.id

    const body = (await req.json()) as Body
    if (!body?.gameId) return json(400, { error: "gameId is required" })
    if (!body?.winner) return json(400, { error: "winner is required" })
    if (!body?.reason) return json(400, { error: "reason is required" })

    const admin = createClient(URL, SRV)

    // Load game — intentionally omit `rating_applied` (column may not exist in all envs)
    const { data: g, error: gerr } = await admin
      .from("games")
      .select("id, wake_id, brake_id, status, winner_id, loser_id, is_vs_ai, ai_level")
      .eq("id", body.gameId)
      .single()

    if (gerr) return json(500, { error: gerr.message })
    if (!g) return json(404, { error: "Game not found" })

    if (String(g.wake_id) !== String(callerId) && String(g.brake_id) !== String(callerId)) {
      return json(403, { error: "Not a participant" })
    }

    const winnerId = body.winner === "W" ? g.wake_id : g.brake_id
    const loserId = body.winner === "W" ? g.brake_id : g.wake_id

    // Update games row to ended (idempotent — skip if already done)
    if (!(g.status === "ended" && g.winner_id && g.loser_id)) {
      const endedAt = new Date().toISOString()
      const { error: endErr } = await admin
        .from("games")
        .update({
          status: "ended",
          winner_id: winnerId,
          loser_id: loserId,
          end_reason: body.reason,
          ended_at: endedAt,
        })
        .eq("id", body.gameId)

      if (endErr) return json(500, { error: endErr.message })
    }

    const wakeId = String(g.wake_id)
    const brakeId = String(g.brake_id)
    const wakeIsAi = AI_IDS.has(wakeId)
    const brakeIsAi = AI_IDS.has(brakeId)
    const involvesAi = !!g?.is_vs_ai || wakeIsAi || brakeIsAi

    // AI games: player stats are handled client-side by reportVsAiEloAndStats.
    // finalize_game only needs to mark the game row as ended (done above).
    if (involvesAi && wakeIsAi !== brakeIsAi) {
      return json(200, { ok: true, involvesAi: true, winnerId, loserId })
    }

    // PvP (no AI): update both players' stats.
    const { data: ws, error: wsErr } = await admin
      .from("player_stats")
      .select("*")
      .eq("user_id", winnerId)
      .maybeSingle()
    if (wsErr) return json(500, { error: `winner stats: ${wsErr.message}` })

    const { data: ls, error: lsErr } = await admin
      .from("player_stats")
      .select("*")
      .eq("user_id", loserId)
      .maybeSingle()
    if (lsErr) return json(500, { error: `loser stats: ${lsErr.message}` })

    const wElo = ws?.elo ?? 1200
    const lElo = ls?.elo ?? 1200
    const timeout = isTimeout(body.reason)

    const full = eloUpdate(wElo, lElo, true, 24)
    let newWinnerElo = full.newA
    const newLoserElo = full.newB

    if (timeout) {
      const delta = full.newA - wElo
      newWinnerElo = Math.round(wElo + delta * TIMEOUT_WIN_GAIN_MULTIPLIER)
    }

    const { error: up1 } = await admin.from("player_stats").upsert({
      user_id: winnerId,
      elo: clamp(newWinnerElo, 100, 5000),
      games_played: (ws?.games_played ?? 0) + 1,
      wins: (ws?.wins ?? 0) + 1,
      losses: ws?.losses ?? 0,
    })
    if (up1) return json(500, { error: `upsert winner: ${up1.message}` })

    const { error: up2 } = await admin.from("player_stats").upsert({
      user_id: loserId,
      elo: clamp(newLoserElo, 100, 5000),
      games_played: (ls?.games_played ?? 0) + 1,
      wins: ls?.wins ?? 0,
      losses: (ls?.losses ?? 0) + 1,
    })
    if (up2) return json(500, { error: `upsert loser: ${up2.message}` })

    return json(200, {
      ok: true,
      winnerId,
      loserId,
      involvesAi,
      timeout,
      newWinnerElo,
      newLoserElo,
    })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})
