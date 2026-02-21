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

// Default AI ratings (used only for Elo math; AI Elo itself never changes)
const AI_ELO_BY_LEVEL: Record<string, number> = {
  novice: 600,
  adept: 900,
  expert: 1200,
  master: 1500,
  senior_master: 1800,
  grandmaster: 2100,
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

    // Load game (include flags)
    const { data: g, error: gerr } = await admin
      .from("games")
      .select("id, wake_id, brake_id, status, rating_applied, winner_id, loser_id, is_vs_ai, ai_level")
      .eq("id", body.gameId)
      .single()

    if (gerr) return json(500, { error: gerr.message })
    if (!g) return json(404, { error: "Game not found" })

    if (String(g.wake_id) !== String(callerId) && String(g.brake_id) !== String(callerId)) {
      return json(403, { error: "Not a participant" })
    }

    const winnerId = body.winner === "W" ? g.wake_id : g.brake_id
    const loserId = body.winner === "W" ? g.brake_id : g.wake_id

    // If not ended yet, end it (idempotent)
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

    // Reload rating_applied (idempotent)
    const { data: g2, error: g2err } = await admin
      .from("games")
      .select("rating_applied, is_vs_ai, wake_id, brake_id")
      .eq("id", body.gameId)
      .single()

    if (g2err) return json(500, { error: g2err.message })
    if (g2?.rating_applied) return json(200, { ok: true, ratingAlreadyApplied: true })

    const wakeId = String(g2?.wake_id)
    const brakeId = String(g2?.brake_id)
    const wakeIsAi = AI_IDS.has(wakeId)
    const brakeIsAi = AI_IDS.has(brakeId)
    const involvesAi = !!g2?.is_vs_ai || wakeIsAi || brakeIsAi

    const now = new Date().toISOString()
    const timeout = isTimeout(body.reason)

    // Exactly one AI participant: update ONLY the human's Elo/stats. AI Elo never changes.
    if (involvesAi && wakeIsAi !== brakeIsAi) {
      const aiId = wakeIsAi ? wakeId : brakeId
      const humanId = wakeIsAi ? brakeId : wakeId
      const humanWon = String(winnerId) === humanId

      const { data: hs, error: hsErr } = await admin
        .from("player_stats")
        .select("*")
        .eq("user_id", humanId)
        .maybeSingle()
      if (hsErr) return json(500, { error: `human stats: ${hsErr.message}` })

      const hElo = hs?.elo ?? 1200

      // Reference AI rating for Elo math: prefer fixed by ai_level, fallback to any stored AI stats.
      const aiLevelKey = String((g as any)?.ai_level ?? "").toLowerCase()
      const aiEloFixed = AI_ELO_BY_LEVEL[aiLevelKey] ?? 1200

      const { data: ais, error: aisErr } = await admin
        .from("player_stats")
        .select("elo")
        .eq("user_id", aiId)
        .maybeSingle()
      if (aisErr) return json(500, { error: `ai stats: ${aisErr.message}` })

      const aiElo = typeof ais?.elo === "number" ? ais.elo : aiEloFixed

      // Compute full Elo result for the human (as player A). AI is just reference rB.
      const full = eloUpdate(hElo, aiElo, humanWon, 24)

      // Timeout policy: loser loses normal; winner gains reduced.
      let newHumanElo = full.newA
      if (timeout && humanWon) {
        const delta = full.newA - hElo
        newHumanElo = Math.round(hElo + delta * TIMEOUT_WIN_GAIN_MULTIPLIER)
      }

      const { error: upH } = await admin.from("player_stats").upsert({
        user_id: humanId,
        elo: clamp(newHumanElo, 100, 5000),
        games_played: (hs?.games_played ?? 0) + 1,
        wins: (hs?.wins ?? 0) + (humanWon ? 1 : 0),
        losses: (hs?.losses ?? 0) + (humanWon ? 0 : 1),
        updated_at: now,
      })
      if (upH) return json(500, { error: `upsert human: ${upH.message}` })

      const { error: markErr } = await admin
        .from("games")
        .update({ rating_applied: true })
        .eq("id", body.gameId)
      if (markErr) return json(500, { error: markErr.message })

      return json(200, {
        ok: true,
        winnerId,
        loserId,
        involvesAi,
        timeout,
        aiId,
        humanId,
        aiElo,
        oldHumanElo: hElo,
        newHumanElo,
      })
    }

    // PvP (no AI): update both players normally.
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

    const full = eloUpdate(wElo, lElo, true, 24)
    let newWinnerElo = full.newA
    const newLoserElo = full.newB // loser always takes full loss

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
      updated_at: now,
    })
    if (up1) return json(500, { error: `upsert winner: ${up1.message}` })

    const { error: up2 } = await admin.from("player_stats").upsert({
      user_id: loserId,
      elo: clamp(newLoserElo, 100, 5000),
      games_played: (ls?.games_played ?? 0) + 1,
      wins: ls?.wins ?? 0,
      losses: (ls?.losses ?? 0) + 1,
      updated_at: now,
    })
    if (up2) return json(500, { error: `upsert loser: ${up2.message}` })

    const { error: markErr } = await admin
      .from("games")
      .update({ rating_applied: true })
      .eq("id", body.gameId)

    if (markErr) return json(500, { error: markErr.message })

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
