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

    // Load game
    const { data: g, error: gerr } = await admin
      .from("games")
      .select("id, wake_id, brake_id, status, rating_applied, winner_id, loser_id")
      .eq("id", body.gameId)
      .single()
    if (gerr) return json(500, { error: gerr.message })
    if (!g) return json(404, { error: "Game not found" })

    if (String(g.wake_id) !== String(callerId) && String(g.brake_id) !== String(callerId)) {
      return json(403, { error: "Not a participant" })
    }

    const winnerId = body.winner === "W" ? g.wake_id : g.brake_id
    const loserId = body.winner === "W" ? g.brake_id : g.wake_id

    // If already ended, just return (idempotent)
    if (g.status === "ended" && g.winner_id && g.loser_id) {
      return json(200, { ok: true, alreadyEnded: true })
    }

    // End the game
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

    // Apply rating once
    const { data: g2, error: g2err } = await admin
      .from("games")
      .select("rating_applied")
      .eq("id", body.gameId)
      .single()
    if (g2err) return json(500, { error: g2err.message })

    if (g2.rating_applied) {
      return json(200, { ok: true, ratingAlreadyApplied: true })
    }

    // Get current ratings
    const { data: ws } = await admin.from("player_stats").select("*").eq("user_id", winnerId).maybeSingle()
    const { data: ls } = await admin.from("player_stats").select("*").eq("user_id", loserId).maybeSingle()

    const wElo = ws?.elo ?? 1200
    const lElo = ls?.elo ?? 1200

    const { newA: newWinnerElo, newB: newLoserElo } = eloUpdate(wElo, lElo, true, 24)

    // Upsert stats (increment GP/W/L)
    const now = new Date().toISOString()

    await admin.from("player_stats").upsert({
      user_id: winnerId,
      elo: clamp(newWinnerElo, 100, 5000),
      games_played: (ws?.games_played ?? 0) + 1,
      wins: (ws?.wins ?? 0) + 1,
      losses: ws?.losses ?? 0,
      updated_at: now,
    })

    await admin.from("player_stats").upsert({
      user_id: loserId,
      elo: clamp(newLoserElo, 100, 5000),
      games_played: (ls?.games_played ?? 0) + 1,
      wins: ls?.wins ?? 0,
      losses: (ls?.losses ?? 0) + 1,
      updated_at: now,
    })

    // Mark applied
    const { error: markErr } = await admin
      .from("games")
      .update({ rating_applied: true })
      .eq("id", body.gameId)

    if (markErr) return json(500, { error: markErr.message })

    return json(200, {
      ok: true,
      winnerId,
      loserId,
      newWinnerElo,
      newLoserElo,
    })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})