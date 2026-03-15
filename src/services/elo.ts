// src/services/elo.ts
// Single source of truth for Elo reads — all reads go to player_stats_agg.

import { supabase } from "./supabase"

export type EloStats = {
  elo: number
  elo_standard: number
  elo_rapid: number
  elo_blitz: number
  elo_daily: number
  games_played: number
  games_standard: number
  games_rapid: number
  games_blitz: number
  games_daily: number
  wins_standard: number
  wins_rapid: number
  wins_blitz: number
  wins_daily: number
  losses_standard: number
  losses_rapid: number
  losses_blitz: number
  losses_daily: number
  wins_siegemate: number
  wins_elimination: number
  wins_collapse: number
  wins_timeout: number
  wins_resign: number
  losses_timeout: number
  losses_resign: number
  losses_siegemate: number
  losses_elimination: number
  losses_collapse: number
}

const DEFAULT_ELO = 600

function rowElo(row: any): number {
  return row?.elo ?? DEFAULT_ELO
}

let cachedSeasonId: string | null = null

export async function getActiveSeasonId(): Promise<string> {
  if (cachedSeasonId) return cachedSeasonId
  const { data } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .maybeSingle()
  cachedSeasonId = data?.id ?? null
  if (!cachedSeasonId) throw new Error("No active season found")
  return cachedSeasonId
}

// Fetch all format Elos for a single user and return in player_stats-compatible shape.
export async function getPlayerEloStats(userId: string): Promise<EloStats | null> {
  let seasonId: string
  try {
    seasonId = await getActiveSeasonId()
  } catch {
    return null
  }

  const { data, error } = await supabase
    .from("player_stats_agg")
    .select("format, elo, games_played, wins, losses, wins_siegemate, wins_elimination, wins_collapse, wins_timeout, wins_resign, losses_timeout, losses_resign, losses_siegemate, losses_elimination, losses_collapse")
    .eq("user_id", userId)
    .eq("scope", "season")
    .eq("season_id", seasonId)

  if (error || !data || data.length === 0) return null

  const byFormat = Object.fromEntries(data.map((r: any) => [r.format, r]))

  const std = byFormat["standard"]
  const rap = byFormat["rapid"]
  const bli = byFormat["blitz"]
  const dai = byFormat["daily"]
  const all = byFormat["all"]

  return {
    elo: rowElo(all),
    elo_standard: rowElo(std),
    elo_rapid: rowElo(rap),
    elo_blitz: rowElo(bli),
    elo_daily: rowElo(dai),
    games_played: all?.games_played ?? 0,
    games_standard: std?.games_played ?? 0,
    games_rapid: rap?.games_played ?? 0,
    games_blitz: bli?.games_played ?? 0,
    games_daily: dai?.games_played ?? 0,
    wins_standard: std?.wins ?? 0,
    wins_rapid: rap?.wins ?? 0,
    wins_blitz: bli?.wins ?? 0,
    wins_daily: dai?.wins ?? 0,
    losses_standard: std?.losses ?? 0,
    losses_rapid: rap?.losses ?? 0,
    losses_blitz: bli?.losses ?? 0,
    losses_daily: dai?.losses ?? 0,
    wins_siegemate: all?.wins_siegemate ?? 0,
    wins_elimination: all?.wins_elimination ?? 0,
    wins_collapse: all?.wins_collapse ?? 0,
    wins_timeout: all?.wins_timeout ?? 0,
    wins_resign: all?.wins_resign ?? 0,
    losses_timeout: all?.losses_timeout ?? 0,
    losses_resign: all?.losses_resign ?? 0,
    losses_siegemate: all?.losses_siegemate ?? 0,
    losses_elimination: all?.losses_elimination ?? 0,
    losses_collapse: all?.losses_collapse ?? 0,
  }
}

// Fetch just the Elo for a specific format for a single user (lightweight).
export async function getPlayerFormatElo(userId: string, format: string): Promise<number> {
  let seasonId: string
  try {
    seasonId = await getActiveSeasonId()
  } catch {
    return DEFAULT_ELO
  }

  const { data } = await supabase
    .from("player_stats_agg")
    .select("elo")
    .eq("user_id", userId)
    .eq("scope", "season")
    .eq("season_id", seasonId)
    .eq("format", format)
    .maybeSingle()

  return data?.elo ?? DEFAULT_ELO
}

// Fetch leaderboard rows for a given format, ordered by Elo descending.
export async function getLeaderboard(format: string, limit = 100): Promise<any[]> {
  let seasonId: string
  try {
    seasonId = await getActiveSeasonId()
  } catch {
    return []
  }

  const { data, error } = await supabase
    .from("player_stats_agg")
    .select("user_id, elo, games_played, wins, losses, wins_siegemate, wins_elimination, wins_collapse, losses_timeout, wins_resign")
    .eq("scope", "season")
    .eq("season_id", seasonId)
    .eq("format", format === "all" ? "all" : format)
    .gt("elo", 0)
    .order("elo", { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data
}

// Fetch all format rows for all users and pivot into a flat per-user shape
// matching the old player_stats column layout.
export async function getLeaderboardFull(limit = 200): Promise<any[]> {
  let seasonId: string
  try {
    seasonId = await getActiveSeasonId()
  } catch {
    return []
  }

  const { data, error } = await supabase
    .from("player_stats_agg")
    .select("user_id, format, elo, games_played, wins, losses, wins_siegemate, wins_elimination, wins_collapse, wins_timeout, wins_resign, losses_timeout, losses_resign, losses_siegemate, losses_elimination, losses_collapse")
    .eq("scope", "season")
    .eq("season_id", seasonId)
    .limit(limit * 5) // fetch enough rows across all formats

  if (error || !data) return []

  // Pivot: group by user_id
  const byUser = new Map<string, any>()
  for (const row of data) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        elo: 0,
        elo_standard: 0,
        elo_rapid: 0,
        elo_blitz: 0,
        elo_daily: 0,
        games_played: 0,
        games_standard: 0,
        games_rapid: 0,
        games_blitz: 0,
        games_daily: 0,
        wins_standard: 0,
        wins_rapid: 0,
        wins_blitz: 0,
        wins_daily: 0,
        wins_total: 0,
        losses_standard: 0,
        losses_rapid: 0,
        losses_blitz: 0,
        losses_daily: 0,
        losses_total: 0,
        wins_siegemate: 0,
        wins_elimination: 0,
        wins_collapse: 0,
        losses_timeout: 0,
        wins_resign: 0,
        losses_resign: 0,
      })
    }
    const u = byUser.get(row.user_id)
    const fmt = row.format
    if (fmt === "all") {
      u.elo = row.elo ?? 0
      u.games_played = row.games_played ?? 0
      u.wins_total = row.wins ?? 0
      u.losses_total = row.losses ?? 0
      u.wins_siegemate = row.wins_siegemate ?? 0
      u.wins_elimination = row.wins_elimination ?? 0
      u.wins_collapse = row.wins_collapse ?? 0
      u.losses_timeout = row.losses_timeout ?? 0
      u.wins_resign = row.wins_resign ?? 0
    } else if (fmt === "standard") {
      u.elo_standard = row.elo ?? 0
      u.games_standard = row.games_played ?? 0
      u.wins_standard = row.wins ?? 0
      u.losses_standard = row.losses ?? 0
    } else if (fmt === "rapid") {
      u.elo_rapid = row.elo ?? 0
      u.games_rapid = row.games_played ?? 0
      u.wins_rapid = row.wins ?? 0
      u.losses_rapid = row.losses ?? 0
    } else if (fmt === "blitz") {
      u.elo_blitz = row.elo ?? 0
      u.games_blitz = row.games_played ?? 0
      u.wins_blitz = row.wins ?? 0
      u.losses_blitz = row.losses ?? 0
    } else if (fmt === "daily") {
      u.elo_daily = row.elo ?? 0
      u.games_daily = row.games_played ?? 0
      u.wins_daily = row.wins ?? 0
      u.losses_daily = row.losses ?? 0
    }
  }

  return Array.from(byUser.values())
}
