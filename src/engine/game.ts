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

function isFriendlyOccupied(state: GameState, owner: Player, x: number, y: number): boolean {
  const t = tokenAt(state, x, y)
  return !!t && t.owner === owner
}

function samePos(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y
}

function canTokenUseRoute(state: GameState, p: Player, token: Token, route: Route): boolean {
  if (token.in !== "BOARD") return false
  if (token.owner !== p) return false

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

function finishActionIfDone(state: GameState) {
  const p = state.player

  if (state.usedRoutes.length !== state.routes[p].length) return

  // Resolve sieges created during ACTION (award bonus)
  const { captured, bonus } = resolveSieges(state, p, true)
  if (captured > 0) {
    state.log.unshift(`${p} captured ${captured} sieged token(s) before reinforcements (+${bonus} bonus).`)
  }

  checkWinner(state)
  if (state.gameOver) {
    state.log.unshift(`== GAME OVER: ${state.gameOver.winner} wins ==`)
    return
  }

  if (state.turnInvades[p] >= 3 && state.voidCount > 0) {
    state.voidCount -= 1
    state.reserves[p] += 1
    state.log.unshift(`${p} Draft: invaded 3+ this turn, returned 1 token from Void to reserves.`)
  }

  // Reinforcements: 1 automatic + bonus, limited by reserves
  const totalToPlace = 1 + bonus
  state.reinforcementsToPlace = Math.min(totalToPlace, state.reserves[p])

  if (state.reinforcementsToPlace > 0) {
    state.phase = "REINFORCE"
    state.log.unshift(`== ${p} place ${state.reinforcementsToPlace} reinforcement(s) ==`)
  } else {
    state.phase = "SWAP"
    state.pendingSwap = { handRouteId: null, queueIndex: null }
    state.log.unshift(`== ${p} must swap 1 route (end of turn) ==`)
  }
}

// ------------------------------------------------------------
// Siege (orthogonal sides)
// ------------------------------------------------------------
const ADJ8_DIRS: Array<{ dx: number; dy: number }> = [
  { dx: 0, dy: 1 },   // N
  { dx: 1, dy: 1 },   // NE
  { dx: 1, dy: 0 },   // E
  { dx: 1, dy: -1 },  // SE
  { dx: 0, dy: -1 },  // S
  { dx: -1, dy: -1 }, // SW
  { dx: -1, dy: 0 },  // W
  { dx: -1, dy: 1 },  // NW
]

// Count adjacent friendly tokens around a target token (max 8)
function siegeSides(state: GameState, ownerOfSiegers: Player, x: number, y: number): number {
  let sides = 0
  for (const d of ADJ8_DIRS) {
    const nx = x + d.dx
    const ny = y + d.dy
    const t = tokenAt(state, nx, ny)
    if (t && t.owner === ownerOfSiegers) sides += 1
  }
  return sides
}

function bonusForSides(sides: number): number {
  // Standard + allow 7/8 for tournament-late game
  if (sides <= 3) return 0
  if (sides === 4) return 1
  if (sides === 5) return 2
  if (sides === 6) return 3
  if (sides === 7) return 4
  return 5 // 8-sided
}

function checkWinner(state: GameState) {
  const wOnBoard = state.tokens.some((t) => t.in === "BOARD" && t.owner === "W")
  const bOnBoard = state.tokens.some((t) => t.in === "BOARD" && t.owner === "B")
  if (!wOnBoard) state.gameOver = { winner: "B" }
  if (!bOnBoard) state.gameOver = { winner: "W" }
}

// Captures enemy tokens that are under siege by `siegers`.
// If `awardBonus` is true, computes bonus reinforcements from siege strength.
function resolveSieges(state: GameState, siegers: Player, awardBonus: boolean): { captured: number; bonus: number } {
  const victim = other(siegers)

  const sieged = state.tokens
    .filter((t) => t.in === "BOARD" && t.owner === victim)
    .map((t) => ({ t, sides: siegeSides(state, siegers, t.pos.x, t.pos.y) }))
    .filter((x) => x.sides >= 4)

  let bonus = 0
  if (awardBonus) {
    for (const s of sieged) bonus += bonusForSides(s.sides)
  }

  for (const s of sieged) {
    s.t.in = "CAPTIVE"
    state.captives[siegers] += 1
  }

  return { captured: sieged.length, bonus }
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
  if (state.phase !== "OPENING") return
  if (state.gameOver) return
  state.warning = null

  if (tokenAt(state, coord.x, coord.y)) {
    state.warning = `NO-NO: ${toSq(coord)} is occupied.`
    return
  }

  const p = state.player
  if (state.openingPlaced[p] >= 3) {
    state.warning = `NO-NO: ${p} already placed 3 opening tokens.`
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
  if (state.phase !== "ACTION") return
  if (state.gameOver) return

  const p = state.player
  state.warning = null

  const route = state.routes[p].find((r) => r.id === routeId)
  if (!route) {
    state.warning = `NO-NO: Route ${routeId} not found.`
    return
  }
  if (state.usedRoutes.includes(routeId)) {
    state.warning = `NO-NO: Route ${routeId} already used this turn.`
    return
  }

  const token = state.tokens.find((t) => t.in === "BOARD" && t.id === tokenId)
  if (!token || token.owner !== p) {
    state.warning = `NO-NO: Select a friendly token.`
    return
  }

  const from = token.pos
  const steps = traceByRoute(from, route) // list of visited spaces (each step)
  if (steps.length === 0) {
    state.warning = `NO-NO: that route has no movement.`
    return
  }

  // Must actually leave origin at least once (even if you return to origin later)
  const leftOrigin = steps.some((c) => !samePos(c, from))
  if (!leftOrigin) {
    state.warning = `NO-NO: token must move out of its originating space.`
    return
  }

  const to = steps[steps.length - 1]

  // Friendly occupancy illegal ONLY if occupied by another friendly token
  const occ = tokenAt(state, to.x, to.y)
  if (occ && occ.owner === p && occ.id !== token.id) {
    state.warning = `NO-NO: ${toSq(to)} is occupied by your own token.`
    return
  }

  // Move
  state.lastMove = { by: p, tokenId: token.id, from, to, moveNumber: Date.now() }
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
    state.log.unshift(`${p} invaded and captured ${occ.id} at ${toSq(to)}`)
  }

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
  if (state.phase !== "ACTION") return
  if (state.gameOver) return

  const p = state.player
  state.warning = null

  // Remaining (unused) routes this turn
  const remaining = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  if (remaining.length === 0) {
    state.warning = "NO-NO: no remaining routes."
    return
  }

  // Only allowed if NONE of the remaining routes are usable by ANY friendly token
  const friendly = state.tokens.filter((t) => t.in === "BOARD" && t.owner === p)

  const anyRemainingRouteUsable = remaining.some((r) =>
    friendly.some((t) => canTokenUseRoute(state, p, t, r))
  )

  if (anyRemainingRouteUsable) {
    state.warning = "NO-NO: you still have usable routes."
    return
  }

  // Forced yield: 1 reserve token per remaining route that cannot be used
  const need = remaining.length
  const pay = Math.min(need, state.reserves[p])

  state.reserves[p] -= pay
  state.voidCount += pay

  // Burn all remaining routes
  for (const r of remaining) state.usedRoutes.push(r.id)

  state.log.unshift(
    `${p} has no usable routes; yielded ${pay}/${need} reserve token(s) to the Void and burned ${need} route(s).`
  )

  // This advances to REINFORCE or SWAP as normal
  finishActionIfDone(state)
}

// ------------------------------------------------------------
// Reinforcements
// ------------------------------------------------------------
export function placeReinforcement(state: GameState, coord: Coord) {
  if (state.phase !== "REINFORCE") return
  if (state.gameOver) return

  const p = state.player
  state.warning = null

  if (state.reinforcementsToPlace <= 0) {
    // Nothing to place, go to swap
    state.phase = "SWAP"
    state.pendingSwap = { handRouteId: null, queueIndex: null }
    state.log.unshift(`== ${p} must swap 1 route (end of turn) ==`)
    return
  }

  if (tokenAt(state, coord.x, coord.y)) {
    state.warning = `NO-NO: ${toSq(coord)} is occupied (reinforcements cannot invade).`
    return
  }

  if (state.reserves[p] <= 0) {
    state.warning = `NO-NO: no reserves.`
    state.reinforcementsToPlace = 0
  } else {
    state.tokenSerial[p] += 1
    const id = `${p}${state.tokenSerial[p]}`
    state.tokens.push({ id, owner: p, pos: coord, in: "BOARD" })
    state.reserves[p] -= 1
    state.reinforcementsToPlace -= 1
    state.log.unshift(`${p} reinforced ${id} at ${toSq(coord)}`)
  }

  // Segura: sieges caused by reinforcement placement are captured, no bonus
  const segura = resolveSieges(state, p, false)
  if (segura.captured > 0) {
    state.log.unshift(`${p} Segura captured ${segura.captured} token(s) (no bonus).`)
  }

  checkWinner(state)
  if (state.gameOver) {
    state.log.unshift(`== GAME OVER: ${state.gameOver.winner} wins ==`)
    return
  }

  // If done placing all reinforcements, proceed to swap
  if (state.reinforcementsToPlace <= 0) {
    state.phase = "SWAP"
    state.pendingSwap = { handRouteId: null, queueIndex: null }
    state.log.unshift(`== ${p} must swap 1 route (end of turn) ==`)
  }
}

// ------------------------------------------------------------
// Swap phase (mandatory)
// ------------------------------------------------------------
export function chooseSwapHandRoute(state: GameState, routeId: string) {
  if (state.phase !== "SWAP") return
  if (state.gameOver) return
  state.pendingSwap.handRouteId = routeId
  state.warning = null
}

export function chooseSwapQueueIndex(state: GameState, idx: number) {
  if (state.phase !== "SWAP") return
  if (state.gameOver) return
  if (idx < 0 || idx >= state.queue.length) return
  state.pendingSwap.queueIndex = idx
  state.warning = null
}

export function confirmSwapAndEndTurn(state: GameState) {
  if (state.phase !== "SWAP") return
  if (state.gameOver) return
  state.warning = null

  const p = state.player
  const handId = state.pendingSwap.handRouteId
  const qIdx = state.pendingSwap.queueIndex

  if (!handId || qIdx === null) {
    state.warning = "NO-NO: pick 1 route from hand and 1 from the queue."
    return
  }

  const handIndex = state.routes[p].findIndex((r) => r.id === handId)
  if (handIndex === -1) {
    state.warning = "NO-NO: that hand route isn’t in your set."
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
  state.turnInvades[state.player] = 0
  state.pendingSwap = { handRouteId: null, queueIndex: null }
}
