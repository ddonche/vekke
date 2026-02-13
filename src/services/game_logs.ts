// src/services/game_logs.ts
import { supabase } from "./supabase"

export type AccountTier = "regular" | "pro"
export type TimeControlId = "standard" | "rapid" | "blitz" | "daily"

export async function getAccountTier(userId: string): Promise<AccountTier> {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_tier")
    .eq("id", userId) // ✅ your profiles key column is id (uuid)
    .maybeSingle()

  if (error) throw error
  return (data?.account_tier as AccountTier) ?? "regular"
}

export async function saveGameLog(args: {
  gameId: string
  ownerId: string
  opponentId?: string | null
  mode: "ai" | "pvp"
  timeControlId: TimeControlId
  winner?: "W" | "B" | null
  reason?: string | null
  aiLevel?: string | null
  vgn: string
}) {
  const { error } = await supabase.from("game_logs").insert({
    game_id: args.gameId,
    owner_id: args.ownerId,
    opponent_id: args.opponentId ?? null,
    mode: args.mode,
    time_control: args.timeControlId,
    winner: args.winner ?? null,
    reason: args.reason ?? null,
    ai_level: args.aiLevel ?? null,
    vgn: args.vgn,
  })

  if (error) throw error
}
