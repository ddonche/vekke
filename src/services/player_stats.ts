// src/services/player_stats.ts
import { supabase } from "./supabase"

const SELECT_COLS =
  "user_id, elo, elo_blitz, elo_rapid, elo_standard, elo_daily, wins_active, losses_active, losses_timeout, resignations, wins_by_opponent_resign, games_played, last_game_at, games_blitz, wins_blitz, losses_blitz, games_rapid, wins_rapid, losses_rapid, games_standard, wins_standard, losses_standard, games_daily, wins_daily, losses_daily"

export async function ensurePlayerStatsRow(userId: string): Promise<any> {
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
