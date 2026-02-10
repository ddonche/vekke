import { GameState, Player, Token } from "./state"
import { Coord, toSq } from "./coords"
import { Route, traceByRoute, stepFlank } from "./move"
import { Direction } from "./directions"

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function other(p: Player): Player {
  return p === "W" ? "B" : "W"
}

function drawTop(state: GameState): Route {
  // Cycle deck forever
  const r = state.deck.shift()
  if (!r) throw new Error("Deck empty unexpectedly. (Should not happen if cycling.)")
  return r
}

function putBottom(state: GameState, r: Route) {
  state.deck.push(r)
}

function tokenAt(state: GameState, x: number, y: number): Token | null {
  return state.tokens.find((t) => t.in === "BOARD" && t.pos.x === x && t.pos.y === y) ?? null
}

function samePos(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y
}

function canTokenUseRoute(state: GameState, p: Player, token: Token, route: Route): boolean {
  if (token.in !== "BOARD") return false
  if (token.owner !== p) return false

  // Siege lock: a token adjacent-surrounded on 4–7 sides cannot move.
  if (isTokenLockedBySiege(state, token)) return false

  const from = token.pos
  const steps = traceByRoute(from, route) // assumed: excludes origin, includes each step
  if (steps.length === 0) return false

  // Must actually leave origin at some point (rules: token must move out of original space)
  const leftOrigin = steps.some((c) => !samePos(c, from))
  if (!leftOrigin) return false

  const to = steps[steps.length - 1]

  const occ = tokenAt(state, to.x, to.y)
  if (occ && occ.owner === p && occ.id !== token.id) return false // friendly occupied by OTHER token

  return true
}

function checkWinner(state: GameState) {
  const wOnBoard = state.tokens.some((t) => t.in === "BOARD" && t.owner === "W")
  const bOnBoard = state.tokens.some((t) => t.in === "BOARD" && t.owner === "B")
  if (!wOnBoard && state.reserves["W"] === 0) state.gameOver = { winner: "B", reason: "elimination" }
  if (!bOnBoard && state.reserves["B"] === 0) state.gameOver = { winner: "W", reason: "elimination" }
}

// ------------------------------------------------------------
// End turn bookkeeping (shared)
// ------------------------------------------------------------
function endTurnCommon(state: GameState, reasonLog: string) {
  const p = state.player

  state.log.unshift(reasonLog)

  // end turn bookkeeping
  state.turn += 1
  const next = other(p)

  // Tournament: escalation after each ROUND (after Blue finishes), capped at 5 routes
  if (p === "B") {
    state.round += 1

    if (state.routes.W.length < 4) {
      const wNew = drawTop(state)
      state.routes.W.push(wNew)
      state.log.unshift(`== Round ${state.round}: escalation +1 route to W (${wNew.id}) ==`)
    }

    if (state.routes.B.length < 4) {
      const bNew = drawTop(state)
      state.routes.B.push(bNew)
      state.log.unshift(`== Round ${state.round}: escalation +1 route to B (${bNew.id}) ==`)
    }
  }

  state.player = next
  state.phase = "ACTION"
  state.usedRoutes = []
  state.turnInvades[next] = 0
  state.pendingSwap = { handRouteId: null, queueIndex: null }

  // IMPORTANT: reset early-swap and reinforcement flags for the new turn
  state.earlySwapArmed = false
  state.earlySwapUsedThisTurn = false
  state.extraReinforcementBoughtThisTurn = false
}

function endTurnNoSwap(state: GameState) {
  const p = state.player
  endTurnCommon(state, `== ${p} ends turn (end-of-turn swap skipped: early swap used) ==`)
}

// ------------------------------------------------------------
// Siege (adjacent-8)
// New rules:
// - 4–7 adjacent enemy tokens: token is LOCKED (cannot move), not captured.
// - 8 adjacent enemy tokens: token is CAPTURED.
// - No reinforcement bonuses from siege.
// ------------------------------------------------------------
const ADJ8_DIRS: Array<{ dx: number; dy: number }> = [
  { dx: 0, dy: 1 }, // N
  { dx: 1, dy: 1 }, // NE
  { dx: 1, dy: 0 }, // E
  { dx: 1, dy: -1 }, // SE
  { dx: 0, dy: -1 }, // S
  { dx: -1, dy: -1 }, // SW
  { dx: -1, dy: 0 }, // W
  { dx: -1, dy: 1 }, // NW
]

// Count adjacent tokens owned by `owner` around a target square (max 8)
function adj8OwnedBy(state: GameState, owner: Player, x: number, y: number): number {
  let n = 0
  for (const d of ADJ8_DIRS) {
    const nx = x + d.dx
    const ny = y + d.dy
    const t = tokenAt(state, nx, ny)
    if (t && t.owner === owner) n += 1
  }
  return n
}

// NOTE: exported so UI can show/disable with the same rule the engine uses.
export function isTokenLockedBySiege(state: GameState, token: Token): boolean {
  if (token.in !== "BOARD") return false
  const enemy = other(token.owner)
  const sides = adj8OwnedBy(state, enemy, token.pos.x, token.pos.y)
  return sides >= 4 && sides < 8
}

function siegeSidesAgainst(state: GameState, token: Token): number {
  if (token.in !== "BOARD") return 0
  const enemy = other(token.owner)
  return adj8OwnedBy(state, enemy, token.pos.x, token.pos.y)
}

function lockedIdsByOwner(state: GameState, owner: Player): Set<string> {
  const s = new Set<string>()
  for (const t of state.tokens) {
    if (t.in !== "BOARD") continue
    if (t.owner !== owner) continue
    const sides = siegeSidesAgainst(state, t)
    if (sides >= 4 && sides < 8) s.add(t.id)
  }
  return s
}

function logLockTransitions(state: GameState, actor: Player, beforeW: Set<string>, beforeB: Set<string>) {
  const afterW = lockedIdsByOwner(state, "W")
  const afterB = lockedIdsByOwner(state, "B")

  const logDiff = (before: Set<string>, after: Set<string>) => {
    for (const id of after) {
      if (!before.has(id)) {
        const tok = state.tokens.find((t) => t.in === "BOARD" && t.id === id)
        const sides = tok ? siegeSidesAgainst(state, tok) : 0
        state.log.unshift(`${actor} put ${id} under siege (${sides}-sided): LOCKED (cannot move).`)
      }
    }
    for (const id of before) {
      if (!after.has(id)) {
        state.log.unshift(`${actor} broke siege on ${id}: UNLOCKED.`)
      }
    }
  }

  // Actor's move can lock/unlock either side, so we track both.
  logDiff(beforeW, afterW)
  logDiff(beforeB, afterB)
}

// Captures enemy tokens that are FULLY sieged (8-sided) by `siegers`.
function resolveFullSieges(state: GameState, siegers: Player): number {
  const victim = other(siegers)

  const fullySieged = state.tokens
    .filter((t) => t.in === "BOARD" && t.owner === victim)
    .map((t) => ({ t, sides: adj8OwnedBy(state, siegers, t.pos.x, t.pos.y) }))
    .filter((x) => x.sides === 8)

  for (const s of fullySieged) {
    s.t.in = "CAPTIVE"
    state.captives[siegers] += 1
    state.stats.captures[siegers] += 1
    state.stats.sieges[siegers] += 1 // counts full-siege captures
  }

  return fullySieged.length
}

// ------------------------------------------------------------
// ACTION completion -> REINFORCE or SWAP or END (skip swap)
// ------------------------------------------------------------

function hasAnyLegalMove(state: GameState, p: Player): boolean {
  // Check if player p would have any legal moves on their next turn.
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === p)

  if (tokens.length === 0) {
    // No tokens on board — legal if they can reinforce
    return state.reserves[p] > 0
  }

  const routes = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))

  // If all tokens are sieged, only escape is reinforcement
  const allSieged = tokens.every((t) => isTokenLockedBySiege(state, t))
  if (allSieged) return state.reserves[p] > 0

  for (const t of tokens) {
    for (const r of routes) {
      if (canTokenUseRoute(state, p, t, r)) return true
    }
  }

  return false
}

function finishActionIfDone(state: GameState) {
  const p = state.player

  if (state.usedRoutes.length !== state.routes[p].length) return

  // Resolve any FULL sieges (8-sided) created during ACTION
  const capturedByFullSiege = resolveFullSieges(state, p)
  if (capturedByFullSiege > 0) {
    state.log.unshift(`${p} captured ${capturedByFullSiege} token(s) by full siege (8-sided).`)
  }

  checkWinner(state)
  if (state.gameOver) {
    state.log.unshift(`== GAME OVER: ${state.gameOver.winner} wins ==`)
    return
  }

  if (state.turnInvades[p] >= 3 && state.void[p] > 0) {
    const refund = Math.min(2, state.void[p])
    state.void[p] -= refund
    state.reserves[p] += refund
    state.stats.drafts[p] += 1
    state.log.unshift(
      `${p} Draft: invaded 3+ this turn, returned ${refund} ${p} token(s) from Void to reserves.`
    )
  }

  // CHECKMATE: opponent has no legal moves
  const opp = other(p)
  if (!hasAnyLegalMove(state, opp)) {
    state.gameOver = { winner: p, reason: "siegemate" }
    state.log.unshift(
      `== SIEGEMATE: ${p} wins by complete siege (no legal moves) ==`
    )
    return
  }

  // Reinforcements: 1 automatic + (optional purchased), limited by reserves
  const extra = state.extraReinforcementBoughtThisTurn ? 1 : 0
  const totalToPlace = 1 + extra
  state.reinforcementsToPlace = Math.min(totalToPlace, state.reserves[p])

  if (state.reinforcementsToPlace > 0) {
    state.phase = "REINFORCE"
    state.log.unshift(`== ${p} place ${state.reinforcementsToPlace} reinforcement(s) ==`)
  } else {
    // If an early swap was purchased/confirmed this turn, the end-of-turn swap is skipped.
    if (state.earlySwapUsedThisTurn) {
      endTurnNoSwap(state)
    } else {
      state.phase = "SWAP"
      state.pendingSwap = { handRouteId: null, queueIndex: null }
      state.log.unshift(`== ${p} must swap 1 route (end of turn) ==`)
    }
  }
}

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------
export function finishOpeningAndDeal(state: GameState) {
  // Guard: if we've already dealt routes, don't do it again
  if (state.phase !== "OPENING") {
    console.warn("finishOpeningAndDeal called but phase is already", state.phase)
    return
  }

  // Deal 2 routes to each
  state.routes.B = [drawTop(state), drawTop(state)]
  state.routes.W = [drawTop(state), drawTop(state)]

  // Queue of 3, face-up (tournament)
  state.queue = [drawTop(state), drawTop(state), drawTop(state)]

  // White moves first after opening
  state.phase = "ACTION"
  state.player = "W"
  state.usedRoutes = []
  state.warning = null
  state.pendingSwap = { handRouteId: null, queueIndex: null }
  state.lastMove = null

  state.reinforcementsToPlace = 0
  state.gameOver = null

  state.log.unshift("== Opening complete. Dealt routes. White to move. ==")
}

// ------------------------------------------------------------
// Opening placement
// ------------------------------------------------------------
export function placeOpeningToken(state: GameState, coord: Coord) {
  if (state.phase !== "OPENING") {
    state.warning = "INVALID: Cannot place opening token — game already started."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }
  state.warning = null

  if (tokenAt(state, coord.x, coord.y)) {
    state.warning = `INVALID: ${toSq(coord)} is occupied.`
    return
  }

  const p = state.player
  if (state.openingPlaced[p] >= 3) {
    state.warning = `INVALID: ${p} already placed 3 opening tokens.`
    return
  }

  state.tokenSerial[p] += 1
  const id = `${p}${state.tokenSerial[p]}`
  state.tokens.push({ id, owner: p, pos: coord, in: "BOARD" })
  state.reserves[p] -= 1
  state.openingPlaced[p] += 1
  state.log.unshift(`${p} placed ${id} at ${toSq(coord)}`)

  // Alternate placement until 3 each
  const totalPlaced = state.openingPlaced.B + state.openingPlaced.W
  if (totalPlaced >= 6) {
    finishOpeningAndDeal(state)
    return
  }

  state.player = other(state.player)
}

// ------------------------------------------------------------
// Action phase move
// ------------------------------------------------------------
export function applyRouteMove(state: GameState, tokenId: string, routeId: string) {
  if (state.phase !== "ACTION") {
    state.warning = "INVALID: Can only move during ACTION phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }

  const p = state.player
  state.warning = null

  // Snapshot lock state for logging transitions after this move.
  const beforeLockedW = lockedIdsByOwner(state, "W")
  const beforeLockedB = lockedIdsByOwner(state, "B")

  const route = state.routes[p].find((r) => r.id === routeId)
  if (!route) {
    state.warning = `INVALID: Route ${routeId} not found.`
    return
  }
  if (state.usedRoutes.includes(routeId)) {
    state.warning = `INVALID: Route ${routeId} already used this turn.`
    return
  }

  const token = state.tokens.find((t) => t.in === "BOARD" && t.id === tokenId)
  if (!token || token.owner !== p) {
    state.warning = "INVALID: Select a friendly token."
    return
  }

  // Siege lock: a token that is sieged on 4–7 sides cannot move.
  if (isTokenLockedBySiege(state, token)) {
    state.warning = `INVALID: ${token.id} is under siege and cannot move.`
    return
  }

  const from = token.pos
  const steps = traceByRoute(from, route) // list of visited spaces (each step)
  if (steps.length === 0) {
    state.warning = "INVALID: that route has no movement."
    return
  }

  // Must actually leave origin at least once (even if you return to origin later)
  const leftOrigin = steps.some((c) => !samePos(c, from))
  if (!leftOrigin) {
    state.warning = "INVALID: token must move out of its originating space."
    return
  }

  const to = steps[steps.length - 1]

  // Friendly occupancy illegal ONLY if occupied by another friendly token
  const occ = tokenAt(state, to.x, to.y)
  if (occ && occ.owner === p && occ.id !== token.id) {
    state.warning = `INVALID: ${toSq(to)} is occupied by your own token.`
    return
  }

  // Move
  state.lastMove = { by: p, tokenId: token.id, from, to, dir: route.dir, moveNumber: Date.now() }
  token.pos = to
  state.usedRoutes.push(routeId)

  // Log move: just show start and destination
  state.log.unshift(`${p} ${token.id}: ${route.id}  ${toSq(from)} → ${toSq(to)}`)

  // Invade capture if enemy there
  if (occ && occ.owner !== p) {
    occ.in = "CAPTIVE"
    state.captives[p] += 1
    state.turnInvades[p] += 1
    state.stats.captures[p] += 1
    state.stats.invades[p] += 1
    state.log.unshift(`${p} invaded and captured ${occ.id} at ${toSq(to)}`)
  }

  // Full siege capture (8-sided) can happen immediately after any move.
  const siegeCaptured = resolveFullSieges(state, p)
  if (siegeCaptured > 0) {
    state.log.unshift(`${p} captured ${siegeCaptured} token(s) by full siege (8-sided).`)
  }

  // Log any NEW locks / broken locks caused by this move.
  logLockTransitions(state, p, beforeLockedW, beforeLockedB)

  // Win?
  checkWinner(state)
  if (state.gameOver) {
    state.log.unshift(`== GAME OVER: ${state.gameOver.winner} wins ==`)
    return
  }

  // Immediate siegemate check — don't wait until end of turn
  const opp = other(p)
  if (!hasAnyLegalMove(state, opp)) {
    state.gameOver = { winner: p, reason: "siegemate" }
    state.log.unshift(`== SIEGEMATE: ${p} wins by complete siege (no legal moves) ==`)
    return
  }

  // End-of-action transition (sieges -> reinforcements -> swap)
  finishActionIfDone(state)
}

export function yieldForcedIfNoUsableRoutes(state: GameState) {
  if (state.phase !== "ACTION") {
    state.warning = "INVALID: Can only yield during ACTION phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }

  const p = state.player
  state.warning = null

  // Remaining (unused) routes this turn
  const remaining = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  if (remaining.length === 0) {
    state.warning = "INVALID: no remaining routes."
    return
  }

  // Only allowed if NONE of the remaining routes are usable by ANY friendly token
  const friendly = state.tokens.filter((t) => t.in === "BOARD" && t.owner === p)

  const anyRemainingRouteUsable = remaining.some((r) => friendly.some((t) => canTokenUseRoute(state, p, t, r)))

  if (anyRemainingRouteUsable) {
    state.warning = "INVALID: you still have usable routes."
    return
  }

  // Forced yield: 1 reserve token per remaining route that cannot be used
  const need = remaining.length
  const pay = Math.min(need, state.reserves[p])

  state.reserves[p] -= pay
  state.void[p] += pay

  // Burn all remaining routes
  for (const r of remaining) state.usedRoutes.push(r.id)

  state.log.unshift(`${p} has no usable routes; yielded ${pay}/${need} reserve token(s) to the Void and burned ${need} route(s).`)

  // This advances to REINFORCE or SWAP as normal
  finishActionIfDone(state)
}

// ------------------------------------------------------------
// Reinforcements
// ------------------------------------------------------------
export function placeReinforcement(state: GameState, coord: Coord) {
  if (state.phase !== "REINFORCE") {
    state.warning = "INVALID: Can only place reinforcements during REINFORCE phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }

  const p = state.player
  state.warning = null

  // Snapshot lock state for logging transitions after this placement.
  const beforeLockedW = lockedIdsByOwner(state, "W")
  const beforeLockedB = lockedIdsByOwner(state, "B")

  // If reinforcement phase is already done, advance correctly.
  if (state.reinforcementsToPlace <= 0) {
    if (state.earlySwapUsedThisTurn) {
      endTurnNoSwap(state)
    } else {
      state.phase = "SWAP"
      state.pendingSwap = { handRouteId: null, queueIndex: null }
      state.log.unshift(`== ${p} must swap 1 route (end of turn) ==`)
    }
    return
  }

  if (tokenAt(state, coord.x, coord.y)) {
    state.warning = `INVALID: ${toSq(coord)} is occupied (reinforcements cannot invade).`
    return
  }

  if (state.reserves[p] <= 0) {
    state.warning = "INVALID: no reserves."
    state.reinforcementsToPlace = 0
    return
  }

  state.tokenSerial[p] += 1
  const id = `${p}${state.tokenSerial[p]}`
  state.tokens.push({ id, owner: p, pos: coord, in: "BOARD" })
  state.reserves[p] -= 1
  state.reinforcementsToPlace -= 1
  state.log.unshift(`${p} reinforced ${id} at ${toSq(coord)}`)

  // Full siege capture (8-sided) can happen after reinforcement placement too.
  const siegeCaptured = resolveFullSieges(state, p)
  if (siegeCaptured > 0) {
    state.log.unshift(`${p} captured ${siegeCaptured} token(s) by full siege (8-sided).`)
  }

  // Log any NEW locks / broken locks caused by this placement.
  logLockTransitions(state, p, beforeLockedW, beforeLockedB)

  checkWinner(state)
  if (state.gameOver) {
    state.log.unshift(`== GAME OVER: ${state.gameOver.winner} wins ==`)
    return
  }

  // If done placing all reinforcements, advance correctly
  if (state.reinforcementsToPlace <= 0) {
    if (state.earlySwapUsedThisTurn) {
      endTurnNoSwap(state)
    } else {
      state.phase = "SWAP"
      state.pendingSwap = { handRouteId: null, queueIndex: null }
      state.log.unshift(`== ${p} must swap 1 route (end of turn) ==`)
    }
  }
}

// ------------------------------------------------------------
// Extra Reinforcement Buy
// ------------------------------------------------------------
export const EXTRA_REINFORCEMENT_COST = 3

export function buyExtraReinforcement(state: GameState) {
  if (state.phase !== "ACTION") {
    state.warning = "INVALID: Can only buy extra reinforcement during ACTION phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }

  const p = state.player
  state.warning = null

  if (state.extraReinforcementBoughtThisTurn) {
    state.warning = "INVALID: you already bought an extra reinforcement this turn."
    return
  }

  if (state.reserves[p] < EXTRA_REINFORCEMENT_COST) {
    state.warning = `INVALID: need ${EXTRA_REINFORCEMENT_COST} reserve token(s) to buy an extra reinforcement.`
    return
  }

  // Pay: move reserve tokens into your own Void
  state.reserves[p] -= EXTRA_REINFORCEMENT_COST
  state.void[p] += EXTRA_REINFORCEMENT_COST

  state.extraReinforcementBoughtThisTurn = true

  state.log.unshift(`${p} burned ${EXTRA_REINFORCEMENT_COST} reserve token(s) to Void to buy +1 reinforcement this turn.`)
}

// ------------------------------------------------------------
// Swap phase (mandatory) + Early swap (ACTION)
// ------------------------------------------------------------
export const EARLY_SWAP_COST = 3 // adjust if needed

export function armEarlySwap(state: GameState) {
  if (state.phase !== "ACTION") {
    state.warning = "INVALID: Early swap only available during ACTION phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }

  const p = state.player
  state.warning = null

  // Must still have unused routes to make this meaningful
  const remaining = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  if (remaining.length === 0) {
    state.warning = "INVALID: early swap disabled (no remaining routes)."
    return
  }

  if (state.earlySwapUsedThisTurn) {
    state.warning = "INVALID: you already swapped early this turn."
    return
  }

  if (state.captives[p] < EARLY_SWAP_COST) {
    state.warning = `INVALID: need ${EARLY_SWAP_COST} captured token(s) to early swap.`
    return
  }

  state.earlySwapArmed = true
  state.pendingSwap = { handRouteId: null, queueIndex: null }
  state.log.unshift(`== ${p} Early Swap armed (cost: ${EARLY_SWAP_COST} captive) ==`)
}

export function cancelEarlySwap(state: GameState) {
  if (state.phase !== "ACTION") return
  if (!state.earlySwapArmed) return
  state.earlySwapArmed = false
  state.pendingSwap = { handRouteId: null, queueIndex: null }
  state.warning = null
}

export function confirmEarlySwap(state: GameState) {
  if (state.phase !== "ACTION") {
    state.warning = "INVALID: Early swap only available during ACTION phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }
  if (!state.earlySwapArmed) {
    state.warning = "INVALID: Early swap is not armed."
    return
  }

  const p = state.player
  const handId = state.pendingSwap.handRouteId
  const qIdx = state.pendingSwap.queueIndex
  state.warning = null

  if (state.earlySwapUsedThisTurn) {
    state.warning = "INVALID: you already swapped early this turn."
    return
  }

  // Must still have unused routes (don’t waste material)
  const remaining = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  if (remaining.length === 0) {
    state.warning = "INVALID: early swap disabled (no remaining routes)."
    return
  }

  if (state.captives[p] < EARLY_SWAP_COST) {
    state.warning = `INVALID: need ${EARLY_SWAP_COST} captured token(s).`
    return
  }

  if (!handId || qIdx === null) {
    state.warning = "INVALID: pick 1 route from hand and 1 from the queue."
    return
  }

  const handIndex = state.routes[p].findIndex((r) => r.id === handId)
  if (handIndex === -1) {
    state.warning = "INVALID: that hand route isn’t in your set."
    return
  }

  // IMPORTANT: early swap must swap out an UNUSED hand route
  if (state.usedRoutes.includes(handId)) {
    state.warning = "INVALID: you can only early-swap an unused route."
    return
  }

  if (qIdx < 0 || qIdx >= state.queue.length) {
    state.warning = "INVALID: invalid queue selection."
    return
  }

  // Pay cost: spend CAPTURED ENEMY token → goes to VOID of enemy color
  const enemy = other(p)
  state.captives[p] -= EARLY_SWAP_COST
  state.void[enemy] += EARLY_SWAP_COST

  // Perform swap (same as end swap but WITHOUT ending the turn)
  const taken = state.queue[qIdx]
  const discarded = state.routes[p][handIndex]

  state.routes[p][handIndex] = taken
  putBottom(state, discarded)

  state.queue.splice(qIdx, 1)
  state.queue.push(drawTop(state))

  // Mark early swap as used; disarm; clear pending selection
  state.earlySwapUsedThisTurn = true
  state.earlySwapArmed = false
  state.pendingSwap = { handRouteId: null, queueIndex: null }

  state.log.unshift(`${p} EARLY swapped out ${discarded.id} and took ${taken.id} (paid ${EARLY_SWAP_COST} captive → ${enemy} Void).`)
}

export function chooseSwapHandRoute(state: GameState, routeId: string) {
  const ok = state.phase === "SWAP" || (state.phase === "ACTION" && state.earlySwapArmed)
  if (!ok) {
    state.warning = "INVALID: Cannot select swap route in current phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }
  state.pendingSwap.handRouteId = routeId
  state.warning = null
}

export function chooseSwapQueueIndex(state: GameState, idx: number) {
  const ok = state.phase === "SWAP" || (state.phase === "ACTION" && state.earlySwapArmed)
  if (!ok) {
    state.warning = "INVALID: Cannot select queue slot in current phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }
  if (idx < 0 || idx >= state.queue.length) {
    state.warning = "INVALID: Queue index out of range."
    return
  }
  state.pendingSwap.queueIndex = idx
  state.warning = null
}

export function confirmSwapAndEndTurn(state: GameState) {
  if (state.phase !== "SWAP") {
    state.warning = "INVALID: Can only confirm swap during SWAP phase."
    return
  }
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }
  state.warning = null

  const p = state.player
  const handId = state.pendingSwap.handRouteId
  const qIdx = state.pendingSwap.queueIndex

  if (!handId || qIdx === null) {
    state.warning = "INVALID: pick 1 route from hand and 1 from the queue."
    return
  }

  const handIndex = state.routes[p].findIndex((r) => r.id === handId)
  if (handIndex === -1) {
    state.warning = "INVALID: that hand route isn’t in your set."
    return
  }

  const taken = state.queue[qIdx]
  const discarded = state.routes[p][handIndex]

  // swap
  state.routes[p][handIndex] = taken
  putBottom(state, discarded)

  // remove from queue slot, draw new to refill
  state.queue.splice(qIdx, 1)
  state.queue.push(drawTop(state))

  state.log.unshift(`${p} swapped out ${discarded.id} and took ${taken.id} from queue.`)

  // End turn (common bookkeeping + resets)
  endTurnCommon(state, `== ${p} ends turn ==`)
}

// ------------------------------------------------------------
// Evasion (once per game defensive move during opponent's turn)
// ------------------------------------------------------------
export const EVASION_COST_CAPTIVES = 2
export const EVASION_COST_RESERVES = 2

export function armEvasion(state: GameState) {
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }
  
  // Evasion can only be used during opponent's ACTION phase
  if (state.phase !== "ACTION") {
    state.warning = "INVALID: Evasion only available during ACTION phase."
    return
  }
  
  const opponent = state.player
  const defender = other(opponent)
  
  // Check if defender already used evasion
  if (state.evasionUsed[defender]) {
    state.warning = "INVALID: You already used your evasion this game."
    return
  }
  
  // Check if defender has enough resources
  if (state.captives[defender] < EVASION_COST_CAPTIVES) {
    state.warning = `INVALID: need ${EVASION_COST_CAPTIVES} captured token(s) to evade.`
    return
  }
  if (state.reserves[defender] < EVASION_COST_RESERVES) {
    state.warning = `INVALID: need ${EVASION_COST_RESERVES} reserve token(s) to evade.`
    return
  }
  
  state.warning = null
  state.evasionArmed = true
  state.pendingEvasion = { tokenId: null, to: null }
  state.log.unshift(`== ${defender} Evasion armed (cost: ${EVASION_COST_CAPTIVES} captive + ${EVASION_COST_RESERVES} reserve) ==`)
}

export function cancelEvasion(state: GameState) {
  if (!state.evasionArmed) return
  state.evasionArmed = false
  state.pendingEvasion = { tokenId: null, to: null }
  state.warning = null
}

export function selectEvasionToken(state: GameState, tokenId: string) {
  if (!state.evasionArmed) {
    state.warning = "INVALID: Evasion not armed."
    return
  }
  
  const opponent = state.player
  const defender = other(opponent)
  
  const token = state.tokens.find((t) => t.id === tokenId)
  if (!token) {
    state.warning = "INVALID: Token not found."
    return
  }
  
  if (token.owner !== defender) {
    state.warning = "INVALID: You can only evade with your own tokens."
    return
  }
  
  // Token can be in BOARD or CAPTIVE
  if (token.in === "BOARD") {
    // If on board, cannot be sieged
    if (isTokenLockedBySiege(state, token)) {
      state.warning = "INVALID: Cannot evade with a sieged token."
      return
    }
  } else if (token.in === "CAPTIVE") {
    // If captured, must be the most recent capture to evade with it
    if (!state.lastMove || state.lastMove.tokenId !== tokenId) {
      state.warning = "INVALID: Can only evade with recently captured tokens."
      return
    }
  } else {
    state.warning = "INVALID: Cannot evade with a token in the void."
    return
  }
  
  state.warning = null
  state.pendingEvasion.tokenId = tokenId
}

export function selectEvasionDestination(state: GameState, to: Coord) {
  if (!state.evasionArmed) {
    state.warning = "INVALID: Evasion not armed."
    return
  }
  
  const tokenId = state.pendingEvasion.tokenId
  if (!tokenId) {
    state.warning = "INVALID: Select a token first."
    return
  }
  
  const token = state.tokens.find((t) => t.id === tokenId)
  if (!token) {
    state.warning = "INVALID: Token not found."
    return
  }
  
  // Get source position
  let from: Coord
  if (token.in === "BOARD") {
    from = token.pos
  } else if (token.in === "CAPTIVE") {
    // Must be last move's capture (validated in selectEvasionToken)
    if (state.lastMove && state.lastMove.tokenId === tokenId) {
      from = state.lastMove.to
    } else {
      state.warning = "INVALID: Cannot determine source position."
      return
    }
  } else {
    state.warning = "INVALID: Token is not in a valid location."
    return
  }
  
  // Validate destination is exactly 1 step away using flanking
  const validDests: Coord[] = []
  for (let dir = 1; dir <= 8; dir++) {
    const dest = stepFlank(from, dir as Direction)
    validDests.push(dest)
  }
  
  const isValid = validDests.some((d) => d.x === to.x && d.y === to.y)
  if (!isValid) {
    state.warning = "INVALID: Destination must be exactly 1 space away (including flanking)."
    return
  }
  
  // Destination must be empty (no capture allowed)
  const occupied = tokenAt(state, to.x, to.y)
  if (occupied) {
    state.warning = "INVALID: Cannot evade to an occupied square."
    return
  }
  
  state.warning = null
  state.pendingEvasion.to = to
}

export function confirmEvasion(state: GameState) {
  if (state.gameOver) {
    state.warning = "INVALID: Game is over."
    return
  }
  
  if (!state.evasionArmed) {
    state.warning = "INVALID: Evasion not armed."
    return
  }
  
  const tokenId = state.pendingEvasion.tokenId
  const to = state.pendingEvasion.to
  
  if (!tokenId || !to) {
    state.warning = "INVALID: Select a token and destination first."
    return
  }
  
  const opponent = state.player
  const defender = other(opponent)
  
  const token = state.tokens.find((t) => t.id === tokenId)
  if (!token) {
    state.warning = "INVALID: Token not found."
    return
  }
  
  // Pay the cost
  state.captives[defender] -= EVASION_COST_CAPTIVES
  state.reserves[defender] -= EVASION_COST_RESERVES
  state.void[defender] += EVASION_COST_CAPTIVES + EVASION_COST_RESERVES
  
  // Get source position for logging
  const from = token.in === "BOARD" ? token.pos : (state.lastMove?.to ?? { x: -1, y: -1 })
  
  // Move the token
  token.in = "BOARD"
  token.pos = to
  
  // Mark evasion as used
  state.evasionUsed[defender] = true
  state.evasionArmed = false
  state.pendingEvasion = { tokenId: null, to: null }
  
  const fromSq = from.x >= 0 ? toSq(from) : "CAPTIVE"
  state.log.unshift(`${defender} EVADED: moved ${tokenId} from ${fromSq} to ${toSq(to)} (paid ${EVASION_COST_CAPTIVES} captive + ${EVASION_COST_RESERVES} reserve → Void).`)
  state.warning = null
}
