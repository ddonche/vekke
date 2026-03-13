// supabase/functions/finalize_game.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type EndReason = "timeout" | "resign" | "collapse" | "siegemate" | "elimination"
type Format = "blitz" | "rapid" | "standard" | "daily"
type Scope = "season" | "all_time"
type AggFormat = Format | "all"

type Body = {
  gameId: string
  winner: "W" | "B"
  reason: string
  vgn?: string | null
  logs?: string[] | null
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ALL_TIME_SEASON_ID = "00000000-0000-0000-0000-000000000000"

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

function normalizeFormat(fmt: unknown): Format {
  const f = String(fmt ?? "standard").trim().toLowerCase()
  if (f === "blitz" || f === "rapid" || f === "standard" || f === "daily") return f
  return "standard"
}

function normalizeEndReason(reason: unknown): EndReason {
  const r = String(reason ?? "").trim().toLowerCase()

  if (r === "timeout") return "timeout"
  if (r === "resign") return "resign"
  if (r === "collapse") return "collapse"
  if (r === "siegemate") return "siegemate"
  if (r === "elimination") return "elimination"

  if (r.startsWith("timeout")) return "timeout"
  if (r === "resignation" || r.startsWith("resign")) return "resign"

  return "elimination"
}

// Real AI profile IDs
const AI_IDS = new Set<string>([
  "29b6ad2a-4bfc-4041-938d-9077c6743cc2", // Scarecrow (rookie)
  "d90c1ec7-a586-4594-85ad-702beca6af45", // Glen
  "9d6503a7-1b18-46d4-878d-09367d6ac833", // Priya
  "69174323-2b15-4b83-b1d7-96a324bce0a4", // Vladimir
  "bb5802a3-1f76-43f8-9bf3-2ac65d618cfe", // Yui
  "92c903e8-aa7d-4571-9905-0611b4a07a1d", // Haoran
  "492a8702-9470-4f43-85e0-d6b44ec5c562", // Chioma
])

type PlayerStatsAggRow = {
  user_id: string
  scope: Scope
  season_id: string | null
  format: AggFormat

  games_played: number | null
  wins: number | null
  losses: number | null

  elo: number | null
  peak_elo: number | null

  wins_timeout: number | null
  wins_resign: number | null
  wins_collapse: number | null
  wins_siegemate: number | null
  wins_elimination: number | null

  losses_timeout: number | null
  losses_resign: number | null
  losses_collapse: number | null
  losses_siegemate: number | null
  losses_elimination: number | null

  updated_at: string | null
}

function winKeyForReason(reason: EndReason): keyof PlayerStatsAggRow {
  switch (reason) {
    case "timeout":
      return "wins_timeout"
    case "resign":
      return "wins_resign"
    case "collapse":
      return "wins_collapse"
    case "siegemate":
      return "wins_siegemate"
    case "elimination":
      return "wins_elimination"
  }
}

function lossKeyForReason(reason: EndReason): keyof PlayerStatsAggRow {
  switch (reason) {
    case "timeout":
      return "losses_timeout"
    case "resign":
      return "losses_resign"
    case "collapse":
      return "losses_collapse"
    case "siegemate":
      return "losses_siegemate"
    case "elimination":
      return "losses_elimination"
  }
}

async function getAggRow(
  admin: any,
  userId: string,
  scope: Scope,
  seasonId: string | null,
  format: AggFormat
): Promise<PlayerStatsAggRow | null> {
  const effectiveSeasonId =
    scope === "season" ? seasonId : ALL_TIME_SEASON_ID

  const { data, error } = await admin
    .from("player_stats_agg")
    .select("*")
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("season_id", effectiveSeasonId)
    .eq("format", format)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as PlayerStatsAggRow) ?? null
}

async function upsertAggRow(admin: any, patch: Record<string, any>) {
  const { error } = await admin
    .from("player_stats_agg")
    .upsert(patch, {
      onConflict: "user_id,scope,season_id,format",
    })

  if (error) throw new Error(error.message)
}

async function applyAggUpdate(args: {
  admin: any
  userId: string
  scope: Scope
  seasonId: string | null
  format: AggFormat
  isWinner: boolean
  endReason: EndReason
  newElo: number | null
}) {
  const { admin, userId, scope, seasonId, format, isWinner, endReason, newElo } = args

  const row = await getAggRow(admin, userId, scope, seasonId, format)
  const now = new Date().toISOString()

  const patch: Record<string, any> = {
    user_id: userId,
    scope,
    season_id: scope === "season" ? seasonId : ALL_TIME_SEASON_ID,
    format,
    games_played: (row?.games_played ?? 0) + 1,
    wins: (row?.wins ?? 0) + (isWinner ? 1 : 0),
    losses: (row?.losses ?? 0) + (!isWinner ? 1 : 0),
    updated_at: now,
  }

  if (isWinner) {
    const k = winKeyForReason(endReason)
    patch[k] = ((row?.[k] as number | null) ?? 0) + 1
  } else {
    const k = lossKeyForReason(endReason)
    patch[k] = ((row?.[k] as number | null) ?? 0) + 1
  }

  if (newElo !== null) {
    const prevPeak = row?.peak_elo ?? null
    const nextPeak = prevPeak === null ? newElo : Math.max(prevPeak, newElo)
    patch.elo = clamp(newElo, 100, 5000)
    patch.peak_elo = clamp(nextPeak, 100, 5000)
  }

  await upsertAggRow(admin, patch)
}

async function gameLogExists(admin: any, gameId: string) {
  const { data, error } = await admin
    .from("game_logs")
    .select("game_id")
    .eq("game_id", gameId)
    .maybeSingle()

  if (error) throw new Error(`game_logs exists check: ${error.message}`)
  return !!data
}

async function insertGameLog(admin: any, row: Record<string, any>) {
  const exists = await gameLogExists(admin, row.game_id)
  if (exists) return

  const { error } = await admin.from("game_logs").insert(row)
  if (error) throw new Error(`game_logs insert: ${error.message}`)
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

    // Load the game row, including vgn + current_state.log + created_at for archival
    const { data: g, error: gerr } = await admin
      .from("games")
      .select(
        "id, created_at, current_state, wake_id, brake_id, status, winner_id, loser_id, is_vs_ai, format, rating_applied, season_id, vgn"
      )
      .eq("id", body.gameId)
      .single()

    if (gerr) return json(500, { error: gerr.message })
    if (!g) return json(404, { error: "Game not found" })

    if (String(g.wake_id) !== String(callerId) && String(g.brake_id) !== String(callerId)) {
      return json(403, { error: "Not a participant" })
    }

    if ((g as any).rating_applied === true) {
      return json(200, {
        ok: true,
        alreadyFinalized: true,
        winnerId: g.winner_id,
        loserId: g.loser_id,
      })
    }

    const winnerId = body.winner === "W" ? g.wake_id : g.brake_id
    const loserId = body.winner === "W" ? g.brake_id : g.wake_id

    const fmt: Format = normalizeFormat((g as any)?.format)
    const endReason: EndReason = normalizeEndReason(body.reason)

    // Snapshot orders at match end
    const { data: p1, error: p1e } = await admin
      .from("profiles")
      .select("id, order_id, account_tier")
      .eq("id", winnerId)
      .maybeSingle()
    if (p1e) return json(500, { error: `winner profile: ${p1e.message}` })

    const { data: p2, error: p2e } = await admin
      .from("profiles")
      .select("id, order_id, account_tier")
      .eq("id", loserId)
      .maybeSingle()
    if (p2e) return json(500, { error: `loser profile: ${p2e.message}` })

    const winnerOrderId = (p1 as any)?.order_id ?? null
    const loserOrderId = (p2 as any)?.order_id ?? null

    const seasonId = (g as any).season_id as string | null
    if (!seasonId) {
      return json(500, { error: "games.season_id is missing" })
    }

    const wakeId = String(g.wake_id)
    const brakeId = String(g.brake_id)
    const wakeIsAi = AI_IDS.has(wakeId)
    const brakeIsAi = AI_IDS.has(brakeId)
    const involvesAi = !!g?.is_vs_ai || wakeIsAi || brakeIsAi

    let humanProfile: any = null
    if (involvesAi) {
      const { data: hp, error: hpe } = await admin
        .from("profiles")
        .select("id, account_tier")
        .eq("id", callerId)
        .maybeSingle()
      if (hpe) return json(500, { error: `human profile: ${hpe.message}` })
      humanProfile = hp
    }

    // Archive decision:
    // - all PvP games
    // - AI games only if human player is Pro
    const shouldArchive =
      !involvesAi ||
      ((humanProfile as any)?.account_tier === "pro")

    const endedAt = new Date().toISOString()

    if (shouldArchive) {
      const payloadVgn =
        typeof body.vgn === "string" && body.vgn.trim()
          ? body.vgn
          : null

      const rowVgn =
        typeof (g as any).vgn === "string" && (g as any).vgn.trim()
          ? (g as any).vgn
          : null

      const vgnText = payloadVgn ?? rowVgn
      if (!vgnText) {
        return json(500, { error: "Missing VGN; cannot archive replay" })
      }

      const payloadLogs =
        Array.isArray(body.logs) ? body.logs : null

      const currentState = (g as any).current_state ?? null
      const rowLogs =
        currentState && typeof currentState === "object" && Array.isArray((currentState as any).log)
          ? (currentState as any).log
          : []

      const logs = payloadLogs ?? rowLogs

      await insertGameLog(admin, {
        game_id: g.id,
        created_at: (g as any).created_at,
        wake_id: g.wake_id,
        brake_id: g.brake_id,
        mode: involvesAi ? "ai" : "pvp",
        time_control: fmt,
        winner: body.winner,
        reason: endReason,
        vgn: vgnText,
        logs,
        ended_at: endedAt,
        winner_id: winnerId,
        loser_id: loserId,
        is_vs_ai: involvesAi,
      })
    }

    // Mark game ended + finalized
    const { error: endErr } = await admin
      .from("games")
      .update({
        status: "finished",
        winner_id: winnerId,
        loser_id: loserId,
        end_reason: endReason,
        ended_at: endedAt,
        rating_applied: true,
        winner_order_id: winnerOrderId,
        loser_order_id: loserOrderId,
      })
      .eq("id", body.gameId)

    if (endErr) return json(500, { error: endErr.message })

    // Elo updates are PvP-only
    let newWinnerElo: number | null = null
    let newLoserElo: number | null = null

    if (!involvesAi) {
      const wRow = await getAggRow(admin, String(winnerId), "season", seasonId, fmt)
      const lRow = await getAggRow(admin, String(loserId), "season", seasonId, fmt)

      const wElo = wRow?.elo ?? 1200
      const lElo = lRow?.elo ?? 1200

      const full = eloUpdate(wElo, lElo, true, 24)
      newWinnerElo = full.newA
      newLoserElo = full.newB

      if (endReason === "timeout") {
        const delta = full.newA - wElo
        newWinnerElo = Math.round(wElo + delta * TIMEOUT_WIN_GAIN_MULTIPLIER)
      }

      newWinnerElo = clamp(newWinnerElo, 100, 5000)
      newLoserElo = clamp(newLoserElo, 100, 5000)
    }

    const updates: Array<Promise<void>> = []

    updates.push(
      applyAggUpdate({
        admin,
        userId: String(winnerId),
        scope: "season",
        seasonId,
        format: fmt,
        isWinner: true,
        endReason,
        newElo: newWinnerElo,
      })
    )
    updates.push(
      applyAggUpdate({
        admin,
        userId: String(winnerId),
        scope: "season",
        seasonId,
        format: "all",
        isWinner: true,
        endReason,
        newElo: newWinnerElo,
      })
    )
    updates.push(
      applyAggUpdate({
        admin,
        userId: String(winnerId),
        scope: "all_time",
        seasonId: ALL_TIME_SEASON_ID,
        format: fmt,
        isWinner: true,
        endReason,
        newElo: newWinnerElo,
      })
    )
    updates.push(
      applyAggUpdate({
        admin,
        userId: String(winnerId),
        scope: "all_time",
        seasonId: ALL_TIME_SEASON_ID,
        format: "all",
        isWinner: true,
        endReason,
        newElo: newWinnerElo,
      })
    )

    updates.push(
      applyAggUpdate({
        admin,
        userId: String(loserId),
        scope: "season",
        seasonId,
        format: fmt,
        isWinner: false,
        endReason,
        newElo: newLoserElo,
      })
    )
    updates.push(
      applyAggUpdate({
        admin,
        userId: String(loserId),
        scope: "season",
        seasonId,
        format: "all",
        isWinner: false,
        endReason,
        newElo: newLoserElo,
      })
    )
    updates.push(
      applyAggUpdate({
        admin,
        userId: String(loserId),
        scope: "all_time",
        seasonId: ALL_TIME_SEASON_ID,
        format: fmt,
        isWinner: false,
        endReason,
        newElo: newLoserElo,
      })
    )
    updates.push(
      applyAggUpdate({
        admin,
        userId: String(loserId),
        scope: "all_time",
        seasonId: ALL_TIME_SEASON_ID,
        format: "all",
        isWinner: false,
        endReason,
        newElo: newLoserElo,
      })
    )

    await Promise.all(updates)

    return json(200, {
      ok: true,
      winnerId,
      loserId,
      seasonId,
      involvesAi,
      format: fmt,
      endReason,
      newWinnerElo,
      newLoserElo,
      archived: shouldArchive,
    })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})