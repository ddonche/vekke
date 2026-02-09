import { GameState, Player, Token } from "./state"
import { Coord, toSq } from "./coords"
import { Route, traceByRoute } from "./move"

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
  if (!wOnBoard) state.gameOver = { winner: "B" }
  if (!bOnBoard) state.gameOver = { winner: "W" }
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
function finishActionIfDone(state: GameState) {
  const p = state.player

  if (state.usedRoutes.length !== state.routes[p].length) return

  // Resolve any FULL sieges (8-sided) created during ACTION
  const capturedByFullSiege = resolveFullSieges(state, p)
  if (capturedByFullSiege > 0) {
    state.log.unshift(`${p} captured ${capturedByFullSiege} token(s) by full siege (8-sided).`)
  }

  function hasAnyLegalMove(state: GameState, p: Player): boolean {
    if (state.phase !== "ACTION") return true // only matters on your turn

    const tokens = state.tokens.filter(
      (t) => t.in === "BOARD" && t.owner === p
    )

    if (tokens.length === 0) return false

    const routes = state.routes[p].filter(
      (r) => !state.usedRoutes.includes(r.id)
    )

    for (const t of tokens) {
      for (const r of routes) {
        if (canTokenUseRoute(state, p, t, r)) {
          return true
        }
      }
    }

    return false
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
    state.gameOver = { winner: p }
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

  // Log path
  const path = steps.map(toSq).join(" → ")
  state.log.unshift(`${p} ${token.id}: ${route.id}  ${toSq(from)} → ${path}`)

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
