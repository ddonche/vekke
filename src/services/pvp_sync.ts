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
  event_data?: any
  // new optional columns (if present in DB)
  season_id?: string | null
  format?: string | null
  turn_no?: number | null
  target_id?: string | null
  event_type?: string | null
  amount?: number | null
}

type NormalizedEventType =
  | "mulligan_used"
  | "invade"
  | "siege_applied"
  | "draft_reward"
  | "capture"
  | "defection_used"
  | "early_swap_used"
  | "extra_reinforcement_bought"
  | "ransom_used"
  | "collapse_tax_paid"
  | "collapse_loss"

type NormalizedEvent = {
  t: NormalizedEventType
  n: number
  // optional metadata (only present for machine-tagged events)
  p?: Player
  forced_by?: Player
  reason?: "collapse" | "siegemate"
}

function diffCount(next: number | undefined, prev: number | undefined): number {
  const a = Number(next ?? 0)
  const b = Number(prev ?? 0)
  const d = a - b
  return d > 0 ? d : 0
}

function parseEvtLine(line: string): NormalizedEvent | null {
  // Examples:
  // @evt collapse_tax_paid p=B n=3 forced_by=W
  // @evt collapse_loss p=B n=3 forced_by=W reason=collapse
  const s = String(line ?? "").trim()
  if (!s.startsWith("@evt ")) return null

  const parts = s.split(/\s+/g)
  if (parts.length < 3) return null

  // parts[0] = "@evt"
  const evt = parts[1] as NormalizedEventType

  if (evt !== "collapse_tax_paid" && evt !== "collapse_loss") return null

  const kv: Record<string, string> = {}
  for (let i = 2; i < parts.length; i++) {
    const p = parts[i]
    const eq = p.indexOf("=")
    if (eq <= 0) continue
    const k = p.slice(0, eq).trim()
    const v = p.slice(eq + 1).trim()
    if (k) kv[k] = v
  }

  const n = Number(kv.n ?? "0")
  if (!Number.isFinite(n) || n <= 0) return null

  const out: NormalizedEvent = { t: evt, n }

  const side = kv.p
  if (side === "W" || side === "B") out.p = side

  const forced = kv.forced_by
  if (forced === "W" || forced === "B") out.forced_by = forced

  const r = kv.reason
  if (r === "collapse" || r === "siegemate") out.reason = r

  return out
}

function extractMachineEvents(prev: GameState, next: GameState): NormalizedEvent[] {
  const prevLog = Array.isArray(prev.log) ? prev.log : []
  const nextLog = Array.isArray(next.log) ? next.log : []

  if (nextLog.length === 0) return []

  // New lines are usually unshifted to the front, but we do a set diff to be safe.
  const prevSet = new Set<string>(prevLog.map((x) => String(x)))
  const out: NormalizedEvent[] = []

  for (const line of nextLog) {
    const s = String(line ?? "")
    if (prevSet.has(s)) continue
    if (!s.startsWith("@evt ")) continue
    const evt = parseEvtLine(s)
    if (evt) out.push(evt)
  }

  return out
}

function buildEventsForActor(prev: GameState, next: GameState, actorSide: Player): NormalizedEvent[] {
  const out: NormalizedEvent[] = []

  // Counters inside state.stats are authoritative for board actions.
  const inv = diffCount(next.stats?.invades?.[actorSide], prev.stats?.invades?.[actorSide])
  if (inv) out.push({ t: "invade", n: inv })

  const sie = diffCount(next.stats?.sieges?.[actorSide], prev.stats?.sieges?.[actorSide])
  if (sie) out.push({ t: "siege_applied", n: sie })

  const dra = diffCount(next.stats?.drafts?.[actorSide], prev.stats?.drafts?.[actorSide])
  if (dra) out.push({ t: "draft_reward", n: dra })

  const cap = diffCount(next.stats?.captures?.[actorSide], prev.stats?.captures?.[actorSide])
  if (cap) out.push({ t: "capture", n: cap })

  const def = diffCount(next.stats?.defections?.[actorSide], prev.stats?.defections?.[actorSide])
  if (def) out.push({ t: "defection_used", n: def })

  // Mulligan count is explicit per player.
  const mul = diffCount(next.mulliganCount?.[actorSide], prev.mulliganCount?.[actorSide])
  if (mul) out.push({ t: "mulligan_used", n: mul })

  // These are “used this turn” booleans. We only record when they flip false -> true.
  if (!prev.earlySwapUsedThisTurn && next.earlySwapUsedThisTurn) out.push({ t: "early_swap_used", n: 1 })
  if (!prev.extraReinforcementBoughtThisTurn && next.extraReinforcementBoughtThisTurn)
    out.push({ t: "extra_reinforcement_bought", n: 1 })
  if (!prev.ransomUsedThisTurn && next.ransomUsedThisTurn) out.push({ t: "ransom_used", n: 1 })

  return out
}

/**
 * Fetch game data by ID
 */
export async function fetchGame(gameId: string): Promise<PvPGameData | null> {
  const { data, error } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle()
  if (error) throw new Error(`Failed to fetch game: ${error.message}`)
  return data
}

/**
 * Fetch all game events for a game, ordered by ply
 */
export async function fetchGameEvents(gameId: string): Promise<GameEvent[]> {
  const { data, error } = await supabase.from("game_events").select("*").eq("game_id", gameId).order("ply", {
    ascending: true,
  })
  if (error) throw new Error(`Failed to fetch game events: ${error.message}`)
  return data ?? []
}

/**
 * Insert a new game event (a single VGN line)
 */
export async function insertGameEvent(args: { gameId: string; ply: number; actorId: string; vgnLine: string }) {
  const { error } = await supabase.from("game_events").insert({
    game_id: args.gameId,
    ply: args.ply,
    actor_id: args.actorId,
    vgn_line: args.vgnLine,
  })
  if (error) throw new Error(`Failed to insert game event: ${error.message}`)
}

/**
 * Save a move - upserts to game_events AND updates games table.
 *
 * IMPORTANT: game_events has a unique constraint on (game_id, ply).
 * So we store a SINGLE row per ply, but event_data contains:
 *   { state: <full snapshot>, events: <normalized action list> }
 */
export async function saveMove(args: {
  gameId: string
  moveNumber: number
  player: Player
  prevState: GameState
  state: GameState
  userId: string
}): Promise<void> {
  const ply = Number(args.moveNumber)
  if (!Number.isFinite(ply)) {
    throw new Error(`Failed to save move: moveNumber must be a number, got ${String(args.moveNumber)}`)
  }

  const eventsFromDiff = buildEventsForActor(args.prevState, args.state, args.player)
  const eventsFromLog = extractMachineEvents(args.prevState, args.state)
  const events: NormalizedEvent[] = eventsFromDiff.concat(eventsFromLog)

  const payload: any = {
    game_id: args.gameId,
    ply,
    actor_id: args.userId,
    vgn_line: `move:${ply}`, // still placeholder until you generate real VGN lines
    turn_no: args.state.turn,
    event_type: events.length === 0 ? "move" : "compound",
    amount: 1,
    event_data: {
      state: args.state,
      events,
    },
  }

  const { error: eventError } = await supabase
    .from("game_events")
    .upsert(payload, {
      onConflict: "game_id,ply",
      ignoreDuplicates: true,
    } as any)

  if (eventError) throw new Error(`Failed to insert game event: ${eventError.message}`)

  const { error: gameError } = await supabase
    .from("games")
    .update({
      turn: args.state.player, // next to act
      last_move_at: new Date().toISOString(),
      current_state: args.state,
    })
    .eq("id", args.gameId)

  if (gameError) throw new Error(`Failed to update game: ${gameError.message}`)
}

/**
 * Update games table after a move (flip turn, update last_move_at, update current_state)
 */
export async function updateGameAfterMove(args: { gameId: string; newTurn: Player; currentState: GameState }): Promise<void> {
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
 * End the game - DEPRECATED.
 *
 * Do not update games directly from the client anymore.
 * Finalization must go through the edge function so:
 *  - end_reason is canonical (5 only)
 *  - rating_applied/idempotency is respected
 *  - stats_agg + order snapshots are updated server-side
 */
export async function endGame(_args: { gameId: string; winner: Player; reason: string }): Promise<void> {
  throw new Error("endGame() is deprecated. Finalize games via the server edge function.")
}