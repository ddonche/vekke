import { supabase } from "./supabase"

export type Profile = {
  id: string
  username: string
  avatar_url: string | null
  country_code: string | null
  country_name: string | null
}

export type PlayerStats = {
  user_id: string
  elo: number
  games: number
  wins: number
  losses: number
  draws: number
}

export type Identity = {
  profile: Profile
  stats: PlayerStats | null
}

export async function fetchIdentity(userId: string): Promise<Identity> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, country_code, country_name")
    .eq("id", userId)
    .single()

  if (pErr) throw pErr
  if (!profile) throw new Error("Profile missing")

  // Stats might not exist yet depending on your flow; keep it nullable.
  const { data: stats, error: sErr } = await supabase
    .from("player_stats")
    .select("user_id, elo, games, wins, losses, draws")
    .eq("user_id", userId)
    .maybeSingle()

  if (sErr) throw sErr

  return {
    profile: profile as Profile,
    stats: (stats as PlayerStats) ?? null,
  }
}
