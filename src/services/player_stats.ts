import { supabase } from "./supabase"
import type { Player } from "../engine/state"

type TimeControlId = "standard" | "rapid" | "blitz" | "daily"

function eloCol(format: TimeControlId): "elo_blitz" | "elo_rapid" | "elo_standard" | "elo_daily" {
  if (format === "blitz") return "elo_blitz"
  if (format === "rapid") return "elo_rapid"
  if (format === "daily") return "elo_daily"
  return "elo_standard"
}

function kFor(format: TimeControlId): number {
  if (format === "blitz") return 32
  if (format === "rapid") return 28
  if (format === "daily") return 20
  return 24
}

function eloNew(a: number, b: number, scoreA: 0 | 1, k: number): number {
  const expectedA = 1 / (1 + Math.pow(10, (b - a) / 400))
  return Math.round(a + k * (scoreA - expectedA))
}

const SELECT_COLS =
  "user_id, elo, elo_blitz, elo_rapid, elo_standard, elo_daily, wins_active, losses_active, losses_timeout, resignations, wins_by_opponent_resign, games_played, last_game_at, games_blitz, wins_blitz, losses_blitz, games_rapid, wins_rapid, losses_rapid, games_standard, wins_standard, losses_standard, games_daily, wins_daily, losses_daily"

async function ensurePlayerStatsRow(userId: string): Promise<any> {
  const { data: ps0, error: ps0Err } = await supabase
    .from("player_stats")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .maybeSingle()
  if (ps0Err) throw ps0Err
  if (ps0) return ps0

  const { data: inserted, error: insErr } = await supabase
    .from("player_stats")
    .insert({
      user_id: userId,
      elo: 600,
      elo_blitz: 600,
      elo_rapid: 600,
      elo_standard: 600,
      elo_daily: 600,
      wins_active: 0,
      losses_active: 0,
      losses_timeout: 0,
      resignations: 0,
      wins_by_opponent_resign: 0,
      games_played: 0,
      games_blitz: 0,
      wins_blitz: 0,
      losses_blitz: 0,
      games_rapid: 0,
      wins_rapid: 0,
      losses_rapid: 0,
      games_standard: 0,
      wins_standard: 0,
      losses_standard: 0,
      games_daily: 0,
      wins_daily: 0,
      losses_daily: 0,
    })
    .select(SELECT_COLS)
    .single()

  if (insErr) throw insErr
  if (!inserted) throw new Error("player_stats row missing and could not be created")
  return inserted
}

export async function reportVsAiEloAndStats(args: {
  userId: string
  timeControlId: TimeControlId
  aiRating: number
  humanPlayer: Player
  winner: Player | null
  reason: string
  endedAt: string
}) {
  const { userId, timeControlId, aiRating, humanPlayer, winner, reason, endedAt } = args

  const col = eloCol(timeControlId)
  const k = kFor(timeControlId)

  const ps = await ensurePlayerStatsRow(userId)

  const before = (ps as any)[col] ?? 1200
  const humanWon = winner === humanPlayer
  const score: 0 | 1 = humanWon ? 1 : 0
  const after = eloNew(before, aiRating, score, k)

  const isTimeoutLoss = !humanWon && reason === "timeout"
  const isResignLoss = !humanWon && reason === "resignation"
  const isOppResignWin = humanWon && reason === "resignation"

  const patch: any = {
    [col]: after,
    last_game_at: endedAt,
    games_played: (ps.games_played ?? 0) + 1,
    wins_active: (ps.wins_active ?? 0) + (humanWon && !isOppResignWin ? 1 : 0),
    losses_active: (ps.losses_active ?? 0) + (!humanWon && !isTimeoutLoss && !isResignLoss ? 1 : 0),
    losses_timeout: (ps.losses_timeout ?? 0) + (isTimeoutLoss ? 1 : 0),
    resignations: (ps.resignations ?? 0) + (isResignLoss ? 1 : 0),
    wins_by_opponent_resign: (ps.wins_by_opponent_resign ?? 0) + (isOppResignWin ? 1 : 0),
  }

  // Keep overall elo synced to the chosen format (matches your existing controller behavior).
  patch.elo = after

  if (timeControlId === "blitz") {
    patch.games_blitz = (ps.games_blitz ?? 0) + 1
    patch.wins_blitz = (ps.wins_blitz ?? 0) + (humanWon ? 1 : 0)
    patch.losses_blitz = (ps.losses_blitz ?? 0) + (!humanWon ? 1 : 0)
  } else if (timeControlId === "rapid") {
    patch.games_rapid = (ps.games_rapid ?? 0) + 1
    patch.wins_rapid = (ps.wins_rapid ?? 0) + (humanWon ? 1 : 0)
    patch.losses_rapid = (ps.losses_rapid ?? 0) + (!humanWon ? 1 : 0)
  } else if (timeControlId === "daily") {
    patch.games_daily = (ps.games_daily ?? 0) + 1
    patch.wins_daily = (ps.wins_daily ?? 0) + (humanWon ? 1 : 0)
    patch.losses_daily = (ps.losses_daily ?? 0) + (!humanWon ? 1 : 0)
  } else {
    patch.games_standard = (ps.games_standard ?? 0) + 1
    patch.wins_standard = (ps.wins_standard ?? 0) + (humanWon ? 1 : 0)
    patch.losses_standard = (ps.losses_standard ?? 0) + (!humanWon ? 1 : 0)
  }

  const { error: psUpErr } = await supabase.from("player_stats").update(patch).eq("user_id", userId)
  if (psUpErr) throw psUpErr
}
