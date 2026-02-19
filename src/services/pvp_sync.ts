// src/services/pvp_sync.ts
import { supabase } from "./supabase"
import type { GameState, Player } from "../engine/state"

export type PvPGameData = {
  id: string
  wake_id: string
  brake_id: string
  status: string
  turn: Player
  vgn_version: string
  is_ranked: boolean
  initial_state: any
  current_state: any | null
  format: string
  last_move_at: string
  clocks_w_ms: number | null
  clocks_b_ms: number | null
  turn_started_at: string | null
}

export type GameEvent = {
  id: number
  game_id: string
  ply: number
  actor_id: string
  vgn_line: string
  created_at: string
}

/**
 * Fetch game data by ID
 */
export async function fetchGame(gameId: string): Promise<PvPGameData | null> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch game: ${error.message}`)
  return data
}

/**
 * Fetch all game events for a game, ordered by ply
 */
export async function fetchGameEvents(gameId: string): Promise<GameEvent[]> {
  const { data, error } = await supabase
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .order("ply", { ascending: true })

  if (error) throw new Error(`Failed to fetch game events: ${error.message}`)
  return data ?? []
}

/**
 * Insert a new game event (a single VGN line)
 */
export async function insertGameEvent(args: {
  gameId: string
  ply: number
  actorId: string
  vgnLine: string
}): Promise<void> {
  const { error } = await supabase.from("game_events").insert({
    game_id: args.gameId,
    ply: args.ply,
    actor_id: args.actorId,
    vgn_line: args.vgnLine,
  })

  if (error) throw new Error(`Failed to insert game event: ${error.message}`)
}

/**
 * Save a move - inserts to game_events AND updates games table
 * This gives us move history plus current state
 */
export async function saveMove(args: {
  gameId: string
  moveNumber: number
  player: Player
  state: GameState
  userId: string
}): Promise<void> {
  // IMPORTANT:
  // game_events has a unique constraint on (game_id, ply).
  // React/dev + network retries can cause the same ply to be attempted more than once.
  // Make this write idempotent so a duplicate insert doesn't break PvP.
  const ply = Number(args.moveNumber)

  if (!Number.isFinite(ply)) {
    throw new Error(`Failed to save move: moveNumber must be a number, got ${String(args.moveNumber)}`)
  }

  // Upsert the event row; if it already exists, ignore the duplicate.
  // (We do not want to overwrite an existing ply with a different payload.)
  const { error: eventError } = await supabase
    .from("game_events")
    .upsert(
      {
        game_id: args.gameId,
        ply,
        actor_id: args.userId,
        vgn_line: `move:${ply}`, // TODO: replace with actual VGN line
        event_data: args.state, // Store full state snapshot
      } as any,
      {
        onConflict: "game_id,ply",
        ignoreDuplicates: true,
      } as any
    )

  if (eventError) throw new Error(`Failed to insert game event: ${eventError.message}`)

  // Update the games table with the latest snapshot (this is safe to repeat).
  const { error: gameError } = await supabase
    .from("games")
    .update({
      // state.player is the side to act next in the engine.
      turn: args.state.player,
      last_move_at: new Date().toISOString(),
      current_state: args.state,
    })
    .eq("id", args.gameId)

  if (gameError) throw new Error(`Failed to update game: ${gameError.message}`)
}


/**
 * Update games table after a move (flip turn, update last_move_at, update current_state)
 */
export async function updateGameAfterMove(args: {
  gameId: string
  newTurn: Player
  currentState: GameState
}): Promise<void> {
  const { error } = await supabase
    .from("games")
    .update({
      turn: args.newTurn,
      last_move_at: new Date().toISOString(),
      current_state: args.currentState,
    })
    .eq("id", args.gameId)

  if (error) throw new Error(`Failed to update game: ${error.message}`)
}

/**
 * Subscribe to new game events for a specific game
 */
export function subscribeToGameEvents(
  gameId: string,
  onNewEvent: (event: GameEvent) => void
): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`game_events:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "game_events",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        onNewEvent(payload.new as GameEvent)
      }
    )
    .subscribe()

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel)
    },
  }
}

/**
 * End the game - update status, winner, loser, reason
 */
export async function endGame(args: {
  gameId: string
  winner: Player
  reason: string
}): Promise<void> {
  const game = await fetchGame(args.gameId)
  if (!game) throw new Error("Game not found")

  const winnerId = args.winner === "W" ? game.wake_id : game.brake_id
  const loserId = args.winner === "W" ? game.brake_id : game.wake_id

  const { error } = await supabase
    .from("games")
    .update({
      status: "completed",
      winner_id: winnerId,
      loser_id: loserId,
      end_reason: args.reason,
      ended_at: new Date().toISOString(),
    })
    .eq("id", args.gameId)

  if (error) throw new Error(`Failed to end game: ${error.message}`)
}
