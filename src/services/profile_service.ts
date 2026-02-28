// src/services/profile_service.ts
import type { SupabaseClient } from "@supabase/supabase-js"

export type ProfileRow = {
  id: string
  username: string
  avatar_url: string | null
  country_code: string | null
  country_name: string | null
  created_at: string | null
  updated_at: string | null
  account_tier: string | null
  referred_by: string | null
  order_id: string | null
  order_joined_at: string | null
}

export type PlayerStatsRow = {
  user_id: string
  elo: number | null
  wins_active: number | null
  losses_active: number | null
  losses_timeout: number | null
  resignations: number | null
  wins_by_opponent_resign: number | null
  games_played: number | null
  last_game_at: string | null

  elo_blitz: number | null
  elo_rapid: number | null
  elo_standard: number | null
  elo_daily: number | null

  games_blitz: number | null
  wins_blitz: number | null
  losses_blitz: number | null

  games_rapid: number | null
  wins_rapid: number | null
  losses_rapid: number | null

  games_standard: number | null
  wins_standard: number | null
  losses_standard: number | null

  games_daily: number | null
  wins_daily: number | null
  losses_daily: number | null
}

export async function fetchProfileByUsername(
  supabase: SupabaseClient,
  username: string
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle()

  if (error) throw error
  return (data as ProfileRow) ?? null
}

export async function fetchPlayerStatsByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<PlayerStatsRow | null> {
  const { data, error } = await supabase
    .from("player_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error
  return (data as PlayerStatsRow) ?? null
}