// src/engine/ai.ts
import type { GameState, Player, Token } from "./state"
import type { Coord } from "./coords"
import { SIZE } from "./coords"
import { traceByRoute } from "./move"
import {
  applyRouteMove,
  placeReinforcement,
  confirmSwapAndEndTurn,
  chooseSwapHandRoute,
  chooseSwapQueueIndex,
  placeOpeningToken,
  yieldForcedIfNoUsableRoutes,
  buyExtraReinforcement,
  armEarlySwap,
  confirmEarlySwap,
  cancelEarlySwap,
  useRansom,
  RANSOM_COST_CAPTIVES,
} from "./game"

export type AiLevel = "novice" | "adept" | "expert" | "master" | "senior_master" | "grandmaster"

// ------------------------------------------------------------
// Style system (config-driven personalities + strength)
// ------------------------------------------------------------
type AiStyle = {
  // Opening
  opening: "random" | "center" | "e4_mafia" | "adjacent_siege"

  // Action policy
  mistakeChance: number // used by greedyTopN picker
  earlySwapMode: "none" | "basic" | "brutal"
  actionPicker: "random" | "greedyTopN" | "tacticalGreedy" | "master2ply" | "seniorMasterSearch" | "gmSearch" // ACTION-move selector

  // Reinforcement / swap pickers (tier-appropriate)
  reinforcePicker: "random" | "safe" | "best"
  swapPicker: "random" | "best"

  // Economy preferences
  ransom: {
    mode: "random" | "tempo"
    resThreshold: number
    deadRouteBias: number
  }

  extraReinforcement: {
    mode: "heuristic" | "sim"
    simDelta: number
    minReserves: number
  }

  // Evaluation weights (“personality”)
  weights: {
    materialOnBoard: number
    reserves: number
    captives: number
    void: number

    siege3: number
    siegeLock: number // 4-6
    siege7: number
    siege8: number

    threatened3: number
    threatenedLock: number // 4-6
    threatened7: number
    threatened8: number

    mobility: number
    deadRoutes: number // positive = reward causing enemy dead routes; negative = punish own dead routes
  }
}

const AI_STYLE: Record<AiLevel, AiStyle> = {
  novice: {
    opening: "random",
    mistakeChance: 1.0,
    earlySwapMode: "none",
    actionPicker: "random",
    reinforcePicker: "random",
    swapPicker: "random",

    ransom: { mode: "random", resThreshold: 0, deadRouteBias: 0 },
    extraReinforcement: { mode: "heuristic", simDelta: 0, minReserves: 999 },

    weights: {
      materialOnBoard: 8,
      reserves: 1.0,
      captives: 0.8,
      void: 0.2,

      siege3: 3,
      siegeLock: 6,
      siege7: 10,
      siege8: 25,

      threatened3: -3,
      threatenedLock: -7,
      threatened7: -12,
      threatened8: -30,

      mobility: 0.10,
      deadRoutes: 8,
    },
  },

  adept: {
    opening: "center",
    mistakeChance: 0.45,
    earlySwapMode: "basic",
    actionPicker: "greedyTopN",
    reinforcePicker: "safe",
    swapPicker: "random",

    ransom: { mode: "random", resThreshold: 0, deadRouteBias: 0 },
    extraReinforcement: { mode: "heuristic", simDelta: 0, minReserves: 10 },

    weights: {
      materialOnBoard: 10,
      reserves: 2.0,
      captives: 1.2,
      void: 0.4,

      siege3: 6,
      siegeLock: 14,
      siege7: 22,
      siege8: 60,

      threatened3: -7,
      threatenedLock: -16,
      threatened7: -28,
      threatened8: -70,

      mobility: 0.18,
      deadRoutes: 18,
    },
  },

  expert: {
    // Vladimir-ish “Dragon/Serpent”: siege + tax denial + tempo economy
    opening: "e4_mafia",
    mistakeChance: 0.10,
    earlySwapMode: "brutal",
    actionPicker: "tacticalGreedy",
    reinforcePicker: "best",
    swapPicker: "best",

    ransom: { mode: "tempo", resThreshold: 2, deadRouteBias: 3 },
    extraReinforcement: { mode: "sim", simDelta: 10, minReserves: 4 },

    weights: {
      materialOnBoard: 10,
      reserves: 1.6,
      captives: 1.6,
      void: 0.7,

      siege3: 10,
      siegeLock: 24,
      siege7: 35,
      siege8: 80,

      threatened3: -8,
      threatenedLock: -18,
      threatened7: -32,
      threatened8: -75,

      mobility: 0.18,
      deadRoutes: 26,
    },
  },

  master: {
    opening: "center",
    mistakeChance: 0.02,
    earlySwapMode: "brutal",
    actionPicker: "master2ply",
    reinforcePicker: "best",
    swapPicker: "best",

    ransom: { mode: "tempo", resThreshold: 3, deadRouteBias: 3 },
    extraReinforcement: { mode: "sim", simDelta: 8, minReserves: 4 },

    weights: {
      materialOnBoard: 10,
      reserves: 2.4,
      captives: 2.0,
      void: 1.2,

      siege3: 14,
      siegeLock: 32,
      siege7: 50,
      siege8: 100,

      threatened3: -14,
      threatenedLock: -32,
      threatened7: -55,
      threatened8: -120,

      mobility: 0.20,
      deadRoutes: 30,
    },
  },

  senior_master: {
    opening: "center",
    mistakeChance: 0.01,
    earlySwapMode: "brutal",
    actionPicker: "seniorMasterSearch",
    reinforcePicker: "best",
    swapPicker: "best",

    ransom: { mode: "tempo", resThreshold: 3, deadRouteBias: 3 },
    extraReinforcement: { mode: "sim", simDelta: 6, minReserves: 4 },

    weights: {
      materialOnBoard: 10,
      reserves: 2.5,
      captives: 2.1,
      void: 1.4,

      siege3: 16,
      siegeLock: 38,
      siege7: 60,
      siege8: 120,

      threatened3: -16,
      threatenedLock: -38,
      threatened7: -65,
      threatened8: -140,

      mobility: 0.22,
      deadRoutes: 35,
    },
  },

  grandmaster: {
    opening: "center",
    mistakeChance: 0.0,
    earlySwapMode: "brutal",
    actionPicker: "gmSearch",
    reinforcePicker: "best",
    swapPicker: "best",

    ransom: { mode: "tempo", resThreshold: 4, deadRouteBias: 4 },
    extraReinforcement: { mode: "sim", simDelta: 4, minReserves: 4 },

    weights: {
      materialOnBoard: 12,
      reserves: 3.2,
      captives: 2.8,
      void: 2.0,

      siege3: 22,
      siegeLock: 55,
      siege7: 85,
      siege8: 180,

      threatened3: -22,
      threatenedLock: -55,
      threatened7: -95,
      threatened8: -220,

      mobility: 0.30,
      deadRoutes: 50,
    },
  },
}

// ------------------------------------------------------------
// Public entrypoint
// ------------------------------------------------------------
export function aiStep(state: GameState, aiPlayer: Player, level: AiLevel) {
  return aiStepWithStyle(state, aiPlayer, level, AI_STYLE[level])
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function other(p: Player): Player {
  return p === "W" ? "B" : "W"
}

function samePos(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y
}

function tokenAt(state: GameState, x: number, y: number): Token | null {
  return state.tokens.find((t) => t.in === "BOARD" && t.pos.x === x && t.pos.y === y) ?? null
}

function canTokenUseRoute(state: GameState, p: Player, token: Token, routeId: string): boolean {
  if (token.in !== "BOARD") return false
  if (token.owner !== p) return false

  const enemy = other(p)
  const lockSides = siegeSidesFor(state, enemy, token.pos.x, token.pos.y)
  if (lockSides >= 4 && lockSides < 8) return false

  const route = state.routes[p].find((r) => r.id === routeId)
  if (!route) return false

  const from = token.pos
  const steps = traceByRoute(from, route)
  if (steps.length === 0) return false

  const leftOrigin = steps.some((c) => !samePos(c, from))
  if (!leftOrigin) return false

  const to = steps[steps.length - 1]
  const occ = tokenAt(state, to.x, to.y)

  if (occ && occ.owner === p && occ.id !== token.id) return false

  return true
}

function randomInt(n: number): number {
  return Math.floor(Math.random() * n)
}

function allEmptySquares(state: GameState): Coord[] {
  const out: Coord[] = []
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!tokenAt(state, x, y)) out.push({ x, y })
    }
  }
  return out
}

function randomActionMove(state: GameState, me: Player): ActionMove | null {
  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) return null
  return moves[randomInt(moves.length)]
}

function randomReinforcementSquare(state: GameState): Coord | null {
  const empties = allEmptySquares(state)
  if (empties.length === 0) return null
  return empties[randomInt(empties.length)]
}

function randomSwapChoice(state: GameState, me: Player): { handId: string; qIdx: number } | null {
  const hand = state.routes[me]
  if (hand.length === 0) return null
  if (state.queue.length === 0) return null
  const h = hand[randomInt(hand.length)]
  const qIdx = randomInt(state.queue.length)
  return { handId: h.id, qIdx }
}


// “Dead routes” estimate (file-local, no external deps):
// Count remaining (unused) routes in hand that currently have 0 legal token users.
function countDeadRoutesEstimate(state: GameState, p: Player): number {
  if (state.phase !== "ACTION") return 0
  const unused = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  if (unused.length === 0) return 0
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === p)
  let dead = 0
  for (const r of unused) {
    let any = false
    for (const t of tokens) {
      if (canTokenUseRoute(state, p, t, r.id)) {
        any = true
        break
      }
    }
    if (!any) dead += 1
  }
  return dead
}

function shouldRansom(state: GameState, me: Player, style: AiStyle): boolean {
  if (state.phase !== "ACTION") return false
  if (state.ransomUsedThisTurn) return false
  if (state.captives[me] < RANSOM_COST_CAPTIVES) return false
  if (((state as any).void?.[me] ?? 0) < 1) return false

  const myRes = state.reserves[me]
  const myDead = countDeadRoutesEstimate(state, me)

  // PANIC: collapse imminent — must ransom to survive, regardless of style
  if (myRes === 0 && myDead > 0) return true
  if (myDead > 0 && myRes <= myDead) return true

  if (style.ransom.mode === "random") {
    return Math.random() < 0.4
  }

  // tempo mode
  if (myRes <= style.ransom.resThreshold) return true
  if (myDead > 0 && myRes <= style.ransom.resThreshold + style.ransom.deadRouteBias) return true
  return false
}

function isCaptureMove(state: GameState, me: Player, tokenId: string, routeId: string): boolean {
  const them = other(me)
  const theirOnBefore = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
  const myCapBefore = state.captives[me]

  const c: GameState = structuredClone(state)
  applyRouteMove(c, tokenId, routeId)

  const theirOnAfter = c.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
  const myCapAfter = c.captives[me]

  return theirOnAfter < theirOnBefore || myCapAfter > myCapBefore
}

function canEnemyInvadeSquareNextTurn(state: GameState, enemy: Player, target: Coord): boolean {
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === enemy)
  const enemyRoutes = state.routes[enemy]

  for (const r of enemyRoutes) {
    for (const t of enemyTokens) {
      if (!canTokenUseRoute(state, enemy, t, r.id)) continue
      const steps = traceByRoute(t.pos, r)
      if (steps.length === 0) continue
      const to = steps[steps.length - 1]
      if (to.x === target.x && to.y === target.y) return true
    }
  }

  return false
}

// ------------------------------------------------------------
// Adept AI — 1-ply greedy + tactical heuristics
// ------------------------------------------------------------
const ADJ8: Array<{ dx: number; dy: number }> = [
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: -1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: 1 },
]

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE
}

function siegeSidesFor(state: GameState, ownerOfSiegers: Player, x: number, y: number): number {
  let sides = 0
  for (const d of ADJ8) {
    const nx = x + d.dx
    const ny = y + d.dy
    if (!inBounds(nx, ny)) continue
    const t = tokenAt(state, nx, ny)
    if (t && t.owner === ownerOfSiegers) sides += 1
  }
  return sides
}

function feedingPenalty(state: GameState, me: Player, c: Coord): number {
  const enemy = other(me)

  // If we place at c, how many enemy tokens already surround it?
  const enemySides = siegeSidesFor(state, enemy, c.x, c.y)

  // Big “don’t do this” penalties at meaningful thresholds.
  // 3 = they’re one away from locking it. 4+ = it’s basically born locked.
  if (enemySides >= 7) return -1200
  if (enemySides >= 4) return -700
  if (enemySides === 3) return -350
  if (enemySides === 2) return -120
  return 0
}

function countUsableMoves(state: GameState, p: Player): number {
  if (state.phase !== "ACTION") return 0
  const remaining = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === p)
  let n = 0
  for (const r of remaining) {
    for (const t of tokens) {
      if (canTokenUseRoute(state, p, t, r.id)) n += 1
    }
  }
  return n
}

// Count tokens that have at least one legal route available (usable token count)
function countUsableTokens(state: GameState, p: Player): number {
  if (state.phase !== "ACTION") {
    return state.tokens.filter((t) => t.in === "BOARD" && t.owner === p).length
  }
  const remaining = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === p)
  const usable = new Set<string>()
  for (const r of remaining) {
    for (const t of tokens) {
      if (canTokenUseRoute(state, p, t, r.id)) usable.add(t.id)
    }
  }
  return usable.size
}

// Detect if a player will collapse next turn: dead routes > reserves (forced tax drains them out)
function collapseRisk(state: GameState, p: Player): boolean {
  const dead = countDeadRoutesEstimate(state, p)
  const res = state.reserves[p]
  return dead > 0 && res <= dead
}

// Siegemate: opponent has 0 usable tokens and 0 reserves
function isSiegemate(state: GameState, victim: Player): boolean {
  const usable = countUsableTokens(state, victim)
  return usable === 0 && state.reserves[victim] === 0
}

function evalState(state: GameState, me: Player, style: AiStyle): number {
  const them = other(me)

  if (state.gameOver) {
    return state.gameOver.winner === me ? 1_000_000 : -1_000_000
  }

  // Near-terminal: siegemate detection (treat as almost-won/lost)
  if (isSiegemate(state, them)) return 900_000
  if (isSiegemate(state, me)) return -900_000

  const myOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me).length
  const theirOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length

  const myRes = state.reserves[me]
  const theirRes = state.reserves[them]

  const myCap = state.captives[me]
  const theirCap = state.captives[them]

  const myVoid = (state as any).void?.[me] ?? 0
  const theirVoid = (state as any).void?.[them] ?? 0

  const w = style.weights
  let score = 0

  // --- Material ---
  score += w.materialOnBoard * myOnBoard
  score -= w.materialOnBoard * theirOnBoard

  score += w.reserves * myRes
  score -= w.reserves * theirRes

  score += w.captives * myCap
  score -= w.captives * theirCap

  // Void value only realizable if ransom is payable
  const myVoidValue = myCap >= RANSOM_COST_CAPTIVES ? w.void * myVoid : w.void * myVoid * 0.2
  const theirVoidValue = theirCap >= RANSOM_COST_CAPTIVES ? w.void * theirVoid : w.void * theirVoid * 0.2
  score += myVoidValue
  score -= theirVoidValue

  // --- Reserve pressure scaling ---
  // When opponent is low on reserves, siege/economy pressure is worth more
  const oppPressureScale = theirRes <= 3 ? 1.8 + (3 - theirRes) * 0.4 : 1.0
  const myPressureScale = myRes <= 3 ? 1.8 + (3 - myRes) * 0.4 : 1.0

  // --- Collapse risk as near-terminal ---
  // --- Closing amplification ---
  // When clearly ahead, amplify turn-denial terms to press the win
  // rather than trading back to even. Measures raw advantage before
  // siege/economy terms to avoid circular amplification.
  const rawAdvantage = (w.materialOnBoard * (myOnBoard - theirOnBoard))
    + (w.reserves * (myRes - theirRes))
  const isClosing = rawAdvantage >= 15  // clearly ahead on material + reserves
  const closingScale = isClosing ? 1.5 : 1.0

  // Dead route pressure gets amplified when closing
  if (state.phase === "ACTION") {
    const myDead = countDeadRoutesEstimate(state, me)
    const theirDead = countDeadRoutesEstimate(state, them)

    score -= w.deadRoutes * myDead * myPressureScale
    score += w.deadRoutes * theirDead * oppPressureScale * closingScale

    if (theirDead > 0 && theirRes === 0) score += 400 * oppPressureScale * closingScale
    if (theirDead > theirRes && theirRes <= 2) score += 200 * oppPressureScale * closingScale
    if (myDead > 0 && myRes === 0) score -= 400 * myPressureScale
    if (myDead > myRes && myRes <= 2) score -= 200 * myPressureScale

    const myUsable = countUsableTokens(state, me)
    const theirUsable = countUsableTokens(state, them)
    score += 15 * (myUsable - theirUsable) * Math.max(oppPressureScale, myPressureScale) * closingScale

    score += w.mobility * countUsableMoves(state, me)
    score -= w.mobility * countUsableMoves(state, them) * closingScale
  }

  // --- Draft value ---
  const myInv = state.turnInvades?.[me] ?? 0
  const theirInv = state.turnInvades?.[them] ?? 0
  if (myInv >= 3 && myVoid > 0) score += 80  // draft available: big deal
  if (myInv >= 2 && myVoid > 0) score += 30  // one move from draft
  if (theirInv >= 3 && theirVoid > 0) score -= 80
  if (theirInv >= 2 && theirVoid > 0) score -= 30

  // --- Siege scoring with pressure scaling ---
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them)
  const myTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)

  for (const e of enemyTokens) {
    const sides = siegeSidesFor(state, me, e.pos.x, e.pos.y)
    if (sides === 3) score += w.siege3 * oppPressureScale
    else if (sides >= 4 && sides <= 6) score += w.siegeLock * oppPressureScale
    else if (sides === 7) score += w.siege7 * oppPressureScale
    else if (sides === 8) score += w.siege8 * oppPressureScale
  }

  for (const m of myTokens) {
    const sides = siegeSidesFor(state, them, m.pos.x, m.pos.y)
    if (sides === 3) score += w.threatened3 * myPressureScale
    else if (sides >= 4 && sides <= 6) score += w.threatenedLock * myPressureScale
    else if (sides === 7) score += w.threatened7 * myPressureScale
    else if (sides === 8) score += w.threatened8 * myPressureScale
  }

  return score
}

function simulateAndScore<T>(state: GameState, me: Player, style: AiStyle, mut: (s: GameState) => void): number {
  const c: GameState = structuredClone(state)
  mut(c)
  return evalState(c, me, style)
}

function bestOpeningSquare(state: GameState): Coord | null {
  const empties = allEmptySquares(state)
  if (empties.length === 0) return null
  const cx = (SIZE - 1) / 2
  const cy = (SIZE - 1) / 2
  let best = empties[0]
  let bestD = Infinity
  for (const e of empties) {
    const d = Math.abs(e.x - cx) + Math.abs(e.y - cy)
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best
}

function openingChoice(state: GameState, me: Player, style: AiStyle): Coord | null {
  const empties = allEmptySquares(state)
  if (empties.length === 0) return null

  // NOTE: This is a pure (x,y) board coordinate.
  // If you later decide to map algebraic like “E4” differently in UI,
  // this is the only line you change.
  const E4: Coord = { x: 4, y: 3 } // 0-index

  if (style.opening === "random") return empties[randomInt(empties.length)]
  if (style.opening === "center") return bestOpeningSquare(state) ?? empties[0]

  if (style.opening === "e4_mafia") {
    if (inBounds(E4.x, E4.y) && !tokenAt(state, E4.x, E4.y)) return E4
    return bestOpeningSquare(state) ?? empties[0]
  }

  if (style.opening === "adjacent_siege") {
    const myTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)
    if (myTokens.length > 0) {
      const base = myTokens[0].pos
      const adj = empties.filter(
        (c) => Math.abs(c.x - base.x) <= 1 && Math.abs(c.y - base.y) <= 1 && !(c.x === base.x && c.y === base.y)
      )
      if (adj.length > 0) return adj[randomInt(adj.length)]
    }
    return bestOpeningSquare(state) ?? empties[0]
  }

  return empties[randomInt(empties.length)]
}

function shouldBuyExtraReinforcementHeuristic(state: GameState, me: Player): boolean {
  if (state.phase !== "ACTION") return false
  if (state.gameOver) return false
  if ((state as any).extraReinforcementBoughtThisTurn) return false

  if (state.reserves[me] < 4) return false
  if (state.reserves[me] - 4 < 6) return false

  const them = other(me)
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them)

  for (const e of enemyTokens) {
    const sidesNow = siegeSidesFor(state, me, e.pos.x, e.pos.y)
    if (sidesNow !== 3) continue
    for (const d of ADJ8) {
      const nx = e.pos.x + d.dx
      const ny = e.pos.y + d.dy
      if (!inBounds(nx, ny)) continue
      if (tokenAt(state, nx, ny)) continue
      return true
    }
  }

  const myOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me).length
  const theirOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === other(me)).length
  if (myOnBoard + 1 < theirOnBoard) return true

  return false
}

function safestReinforcementSquare(state: GameState, me: Player, style: AiStyle): Coord | null {
  const empties = allEmptySquares(state)
  if (empties.length === 0) return null

  const enemy = other(me)

  // 1) HARD RULE: prefer safe squares (can't be invaded next turn) if any exist.
  const safe = empties.filter((c) => !canEnemyInvadeSquareNextTurn(state, enemy, c))
  const candidates = safe.length > 0 ? safe : empties

  function isAdj(a: Coord, b: Coord): boolean {
    return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y)
  }

  const myTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === enemy)

  const threatenedMine = myTokens
    .map((t) => ({ t, enemySides: siegeSidesFor(state, enemy, t.pos.x, t.pos.y) }))
    .filter((x) => x.enemySides >= 3)

  let best = candidates[0]
  let bestScore = -Infinity

  for (const c of candidates) {
    const base = simulateAndScore(state, me, style, (s) => placeReinforcement(s, c))
    let bonus = 0

    for (const e of enemyTokens) {
      if (!isAdj(c, e.pos)) continue
      const before = siegeSidesFor(state, me, e.pos.x, e.pos.y)
      const after = before + 1

      if (before < 4 && after >= 4) bonus += 80
      if (before < 7 && after >= 7) bonus += 60
      if (before < 8 && after >= 8) bonus += 200

      bonus += 8
    }

    for (const m of threatenedMine) {
      if (!isAdj(c, m.t.pos)) continue
      if (m.enemySides >= 7) bonus += 140
      else if (m.enemySides >= 4) bonus += 90
      else bonus += 40
    }

    const cx = (SIZE - 1) / 2
    const cy = (SIZE - 1) / 2
    const dist = Math.abs(c.x - cx) + Math.abs(c.y - cy)
    const tieBreak = -0.01 * dist

    const sc = base + bonus + feedingPenalty(state, me, c) + tieBreak
    if (sc > bestScore) {
      bestScore = sc
      best = c
    }
  }

  return best
}

function bestReinforcementPlacement(state: GameState, me: Player, style: AiStyle): Coord | null {
  const empties = allEmptySquares(state)
  if (empties.length === 0) return null

  const enemy = other(me)
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === enemy)
  const myTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)

  function isAdj(a: Coord, b: Coord): boolean {
    return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y)
  }

  const threatenedMine = myTokens
    .map((t) => ({ t, enemySides: siegeSidesFor(state, enemy, t.pos.x, t.pos.y) }))
    .filter((x) => x.enemySides >= 3)

  // Precompute which squares the enemy can invade next turn
  const invasionTargets = new Set<string>()
  for (const r of state.routes[enemy]) {
    for (const t of enemyTokens) {
      if (!canTokenUseRoute(state, enemy, t, r.id)) continue
      const steps = traceByRoute(t.pos, r)
      if (steps.length === 0) continue
      const to = steps[steps.length - 1]
      invasionTargets.add(`${to.x},${to.y}`)
    }
  }

  let bestScore = -Infinity
  let bests: Coord[] = []

  for (const c of empties) {
    // Hard penalty: don't place where enemy can immediately capture
    const immediatelyVulnerable = invasionTargets.has(`${c.x},${c.y}`)
    if (immediatelyVulnerable) continue  // skip entirely — never gift a free capture

    const base = simulateAndScore(state, me, style, (s) => placeReinforcement(s, c))
    let bonus = 0

    for (const e of enemyTokens) {
      if (!isAdj(c, e.pos)) continue
      const before = siegeSidesFor(state, me, e.pos.x, e.pos.y)
      const after = before + 1

      if (before < 4 && after >= 4) bonus += 80
      if (before < 7 && after >= 7) bonus += 60
      if (before < 8 && after >= 8) bonus += 200

      bonus += 8
    }

    for (const tm of threatenedMine) {
      if (!isAdj(c, tm.t.pos)) continue
      if (tm.enemySides >= 7) bonus += 160
      else if (tm.enemySides >= 4) bonus += 90
      else bonus += 40
    }

    const sc = base + bonus + feedingPenalty(state, me, c)

    const EPS = 1e-6
    if (sc > bestScore + EPS) {
      bestScore = sc
      bests = [c]
    } else if (Math.abs(sc - bestScore) <= EPS) {
      bests.push(c)
    }
  }

  // Fallback: if ALL squares are vulnerable (very rare), use safest available
  if (bests.length === 0) {
    const safe = empties.filter((c) => !invasionTargets.has(`${c.x},${c.y}`))
    const pool = safe.length > 0 ? safe : empties
    return pool[randomInt(pool.length)]
  }

  return bests[randomInt(bests.length)]
}

function bestSwapChoice(state: GameState, me: Player, style: AiStyle): { handId: string; qIdx: number } | null {
  const hand = state.routes[me]
  if (hand.length === 0) return null
  if (state.queue.length === 0) return null

  let best: { handId: string; qIdx: number } | null = null
  let bestScore = -Infinity

  for (const h of hand) {
    for (let qIdx = 0; qIdx < state.queue.length; qIdx++) {
      const sc = simulateAndScore(state, me, style, (s) => {
        chooseSwapHandRoute(s, h.id)
        chooseSwapQueueIndex(s, qIdx)
        confirmSwapAndEndTurn(s)
      })
      if (sc > bestScore) {
        bestScore = sc
        best = { handId: h.id, qIdx }
      }
    }
  }

  return best
}

// ------------------------------------------------------------
// Tactical greedy: Expert-level action selection
// Never "mistakes" a capture or lock — those are always taken.
// Mistake chance only applies to positional/neutral moves.
// ------------------------------------------------------------
function bestTacticalActionMove(
  state: GameState,
  me: Player,
  style: AiStyle
): ActionMove | null {
  const them = other(me)
  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) return null

  // Classify moves
  type ScoredMove = { mv: ActionMove; priority: number; eval: number }
  const classified: ScoredMove[] = []

  const theirOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length

  for (const mv of moves) {
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)

    const theirAfter = c.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
    const isCapture = theirAfter < theirOnBoard

    let maxSiege = 0
    for (const e of c.tokens) {
      if (e.in !== "BOARD" || e.owner !== them) continue
      const sides = siegeSidesFor(c, me, e.pos.x, e.pos.y)
      if (sides > maxSiege) maxSiege = sides
    }

    const isLockOrBetter = isCapture || maxSiege >= 4

    // Priority: 0 = forcing (no mistakes), 1 = positional (mistakes apply)
    const priority = isLockOrBetter ? 0 : 1
    const ev = evalState(c, me, style)

    classified.push({ mv, priority, eval: ev })
  }

  // Forcing moves: always pick best, no mistakes
  const forcing = classified.filter((x) => x.priority === 0)
  if (forcing.length > 0) {
    forcing.sort((a, b) => b.eval - a.eval)
    return forcing[0].mv
  }

  // Positional moves: apply mistake chance
  const positional = classified.slice().sort((a, b) => b.eval - a.eval)
  if (positional.length >= 2 && Math.random() < style.mistakeChance) {
    const pick = positional[Math.min(1 + Math.floor(Math.random() * 2), positional.length - 1)]
    return pick.mv
  }

  return positional[0]?.mv ?? null
}

function bestActionMovesTopN(
  state: GameState,
  me: Player,
  style: AiStyle,
  n: number
): Array<{ tokenId: string; routeId: string; score: number }> {
  const unused = state.routes[me].filter((r) => !state.usedRoutes.includes(r.id))
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)

  const scored: Array<{ tokenId: string; routeId: string; score: number }> = []

  for (const r of unused) {
    for (const t of tokens) {
      if (!canTokenUseRoute(state, me, t, r.id)) continue
      const sc = simulateAndScore(state, me, style, (s) => applyRouteMove(s, t.id, r.id))
      scored.push({ tokenId: t.id, routeId: r.id, score: sc })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.max(1, n))
}

function pickBlueBeltMove(
  top: Array<{ tokenId: string; routeId: string; score: number }>,
  mistakeChance: number
): { tokenId: string; routeId: string } | null {
  if (top.length === 0) return null

  if (top.length >= 2 && Math.random() < mistakeChance) {
    if (top.length === 2) return { tokenId: top[1].tokenId, routeId: top[1].routeId }
    const pick = Math.random() < 0.7 ? top[1] : top[2]
    return { tokenId: pick.tokenId, routeId: pick.routeId }
  }

  return { tokenId: top[0].tokenId, routeId: top[0].routeId }
}

type ActionMove = { tokenId: string; routeId: string }

function enumerateLegalActionMoves(state: GameState, p: Player): ActionMove[] {
  if (state.phase !== "ACTION") return []
  const unused = state.routes[p].filter((r) => !state.usedRoutes.includes(r.id))
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === p)
  const out: ActionMove[] = []
  for (const r of unused) {
    for (const t of tokens) {
      if (!canTokenUseRoute(state, p, t, r.id)) continue
      out.push({ tokenId: t.id, routeId: r.id })
    }
  }
  return out
}

// Run a deterministic policy until the active player changes (full turn finishes), or game ends.
function playoutFullTurn(state: GameState, p: Player, level: AiLevel) {
  const hardCap = 256
  let n = 0
  while (!state.gameOver && state.player === p && n < hardCap) {
    aiStepWithStyle(state, p, level, AI_STYLE[level])
    n += 1
  }
}

// Fast playout for use INSIDE search — always uses tacticalGreedy (no lookahead).
// Prevents recursive search explosion when master/SM/GM simulate their own turns.
// CRITICAL: earlySwapMode must be "none" — bestEarlySwapPlanBrutal is too expensive
// to run at every search node.
const FAST_STYLE: AiStyle = {
  ...AI_STYLE.expert,
  actionPicker: "tacticalGreedy",
  mistakeChance: 0.0,
  earlySwapMode: "none",       // ← critical: skip bestForcingOpportunity entirely
  reinforcePicker: "safe",     // cheaper than "best" (no full invasion precompute)
  swapPicker: "best",
  ransom: { mode: "tempo", resThreshold: 2, deadRouteBias: 2 },
  extraReinforcement: { mode: "heuristic", simDelta: 0, minReserves: 999 }, // skip sim
}

function playoutFast(state: GameState, p: Player) {
  const hardCap = 32  // lower cap — we don't need full turn resolution inside search
  let n = 0
  while (!state.gameOver && state.player === p && n < hardCap) {
    aiStepWithStyle(state, p, "expert", FAST_STYLE)
    n += 1
  }
}

// ------------------------------------------------------------
// Early swap: BASIC + BRUTAL (style-threaded)
// ------------------------------------------------------------
function bestEarlySwapPlanBasic(
  state: GameState,
  me: Player,
  style: AiStyle
): { handId: string; qIdx: number } | null {
  if (state.phase !== "ACTION") return null
  if (state.gameOver) return null
  if (state.earlySwapUsedThisTurn) return null
  if (state.captives[me] < 2) return null

  const unusedHand = state.routes[me].filter((r) => !state.usedRoutes.includes(r.id))
  if (unusedHand.length === 0) return null

  let best: { handId: string; qIdx: number } | null = null
  let bestScore = -Infinity

  for (const h of unusedHand) {
    for (let qIdx = 0; qIdx < state.queue.length; qIdx++) {
      const sc = simulateAndScore(state, me, style, (s) => {
        armEarlySwap(s)
        chooseSwapHandRoute(s, h.id)
        chooseSwapQueueIndex(s, qIdx)
        confirmEarlySwap(s)
      })
      if (sc > bestScore) {
        bestScore = sc
        best = { handId: h.id, qIdx }
      }
    }
  }

  const baseline = evalState(state, me, style)
  if (best && bestScore >= baseline + 8) return best
  return null
}

type ForcingInfo = { score: number; isCapture: boolean; isLockOrBetter: boolean }

function bestForcingOpportunity(state: GameState, me: Player, style: AiStyle): ForcingInfo {
  if (state.phase !== "ACTION" || state.gameOver) return { score: 0, isCapture: false, isLockOrBetter: false }

  const them = other(me)
  const theirOnBefore = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
  const baseMyCap = state.captives[me]

  let bestScore = 0
  let bestCapture = false
  let bestLock = false

  const moves = enumerateLegalActionMoves(state, me)
  for (const mv of moves) {
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)

    const theirOnAfter = c.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
    const capGained = c.captives[me] > baseMyCap || theirOnAfter < theirOnBefore

    let maxSides = 0
    for (const e of c.tokens) {
      if (e.in !== "BOARD" || e.owner !== them) continue
      const sides = siegeSidesFor(c, me, e.pos.x, e.pos.y)
      if (sides > maxSides) maxSides = sides
      if (maxSides >= 8) break
    }

    let sc = 0
    if (capGained) sc += 1000
    else if (maxSides >= 8) sc += 900
    else if (maxSides === 7) sc += 260
    else if (maxSides >= 4) sc += 140
    else if (maxSides === 3) sc += 60

    sc += 0.05 * evalState(c, me, style)

    const lockOrBetter = capGained || maxSides >= 4

    if (sc > bestScore) {
      bestScore = sc
      bestCapture = capGained || maxSides >= 8
      bestLock = lockOrBetter
    }
  }

  return { score: bestScore, isCapture: bestCapture, isLockOrBetter: bestLock }
}

function bestEarlySwapPlanBrutal(
  state: GameState,
  me: Player,
  style: AiStyle
): { handId: string; qIdx: number } | null {
  if (state.phase !== "ACTION") return null
  if (state.gameOver) return null
  if (state.earlySwapUsedThisTurn) return null
  if (state.captives[me] < 2) return null

  const curForce = bestForcingOpportunity(state, me, style)

  const them = other(me)
  const theirOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
  const endgameKill = theirOnBoard <= 1

  const unusedHand = state.routes[me].filter((r) => !state.usedRoutes.includes(r.id))
  if (unusedHand.length === 0) return null

  let best: { handId: string; qIdx: number } | null = null
  let bestScore = -Infinity

  for (const h of unusedHand) {
    for (let qIdx = 0; qIdx < state.queue.length; qIdx++) {
      const c: GameState = structuredClone(state)
      armEarlySwap(c)
      chooseSwapHandRoute(c, h.id)
      chooseSwapQueueIndex(c, qIdx)
      confirmEarlySwap(c)

      const afterForce = bestForcingOpportunity(c, me, style)

      let sc = afterForce.score - curForce.score

      if (!curForce.isLockOrBetter && afterForce.isLockOrBetter) sc += 600
      if (!curForce.isCapture && afterForce.isCapture) sc += 900
      if (endgameKill && afterForce.isLockOrBetter) sc += 500

      sc += 0.15 * (evalState(c, me, style) - evalState(state, me, style))

      if (sc > bestScore) {
        bestScore = sc
        best = { handId: h.id, qIdx }
      }
    }
  }

  const threshold = endgameKill ? 250 : 600  // raised from 450 — must be genuinely forcing
  // Hard rule: never spend 2 captives on a swap that doesn't create a capture or lock
  if (best && bestScore >= threshold && (endgameKill || bestScore >= 600)) return best
  return null
}

// ------------------------------------------------------------
// Move ordering: score moves quickly for search ordering (capture/lock first)
// ------------------------------------------------------------
function quickMovePriority(state: GameState, me: Player, mv: ActionMove): number {
  const them = other(me)
  const c: GameState = structuredClone(state)
  applyRouteMove(c, mv.tokenId, mv.routeId)

  const theirBefore = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
  const theirAfter = c.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length
  if (theirAfter < theirBefore) return 3000  // capture

  let maxSiege = 0
  for (const e of c.tokens) {
    if (e.in !== "BOARD" || e.owner !== them) continue
    const sides = siegeSidesFor(c, me, e.pos.x, e.pos.y)
    if (sides > maxSiege) maxSiege = sides
  }
  if (maxSiege >= 8) return 2500
  if (maxSiege >= 7) return 1500
  if (maxSiege >= 4) return 800  // lock
  if (maxSiege === 3) return 300  // near-lock

  // Check if creates 3rd invade (draft)
  const invAfter = (c.turnInvades?.[me] ?? 0)
  if (invAfter >= 3) return 600

  return 0
}

function orderMoves(state: GameState, me: Player, moves: ActionMove[]): ActionMove[] {
  const scored = moves.map((mv) => ({ mv, pri: quickMovePriority(state, me, mv) }))
  scored.sort((a, b) => b.pri - a.pri)
  return scored.map((x) => x.mv)
}

// ------------------------------------------------------------
// Time-budgeted search helpers
// ------------------------------------------------------------
const SEARCH_BUDGET_MS: Record<AiLevel, number> = {
  novice: 0,
  adept: 0,
  expert: 0,
  master: 80,
  senior_master: 200,
  grandmaster: 500,
}

function opponentBestResponseMinimizingMe2ply(state: GameState, me: Player, meStyle: AiStyle, oppLevel: AiLevel, deadline?: number): number {
  if (state.gameOver) return evalState(state, me, meStyle)
  if (deadline && Date.now() > deadline) return evalState(state, me, meStyle)

  const opp = other(me)
  if (state.player !== opp) return evalState(state, me, meStyle)

  if (state.phase !== "ACTION") {
    const c: GameState = structuredClone(state)
    playoutFast(c, opp)
    return evalState(c, me, meStyle)
  }

  const moves = enumerateLegalActionMoves(state, opp)
  if (moves.length === 0) {
    const c: GameState = structuredClone(state)
    yieldForcedIfNoUsableRoutes(c)
    playoutFast(c, opp)
    return evalState(c, me, meStyle)
  }

  const ordered = orderMoves(state, opp, moves)
  const candidates2ply = ordered.slice(0, 6)  // cap inner loop
  let worstForMe = Infinity

  for (const mv of candidates2ply) {
    if (deadline && Date.now() > deadline) break
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFast(c, opp)
    const sc = evalState(c, me, meStyle)
    if (sc < worstForMe) worstForMe = sc
  }

  return worstForMe === Infinity ? evalState(state, me, meStyle) : worstForMe
}

function bestMasterActionMove(state: GameState, me: Player, style: AiStyle): ActionMove | null {
  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) return null

  const deadline = Date.now() + SEARCH_BUDGET_MS.master
  const ordered = orderMoves(state, me, moves)
  const candidates = ordered.slice(0, 8)  // cap to top 8 to stay fast
  let best: ActionMove | null = null
  let bestScore = -Infinity

  for (const mv of candidates) {
    if (Date.now() > deadline) break
    const c: GameState = structuredClone(state)

    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFast(c, me)

    const sc = opponentBestResponseMinimizingMe2ply(c, me, style, "master", deadline)

    if (sc > bestScore) {
      bestScore = sc
      best = mv
    }
  }

  return best
}

function meBestResponseMaximizing(state: GameState, me: Player, meStyle: AiStyle, myLevel: AiLevel, deadline?: number): number {
  if (state.gameOver) return evalState(state, me, meStyle)
  if (state.player !== me) return evalState(state, me, meStyle)
  if (deadline && Date.now() > deadline) return evalState(state, me, meStyle)

  if (state.phase !== "ACTION") {
    const c: GameState = structuredClone(state)
    playoutFast(c, me)
    return evalState(c, me, meStyle)
  }

  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) {
    const c: GameState = structuredClone(state)
    yieldForcedIfNoUsableRoutes(c)
    playoutFast(c, me)
    return evalState(c, me, meStyle)
  }

  const ordered = orderMoves(state, me, moves)
  let best = -Infinity

  for (const mv of ordered) {
    if (deadline && Date.now() > deadline) break
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFast(c, me)
    const sc = evalState(c, me, meStyle)
    if (sc > best) best = sc
  }

  return best === -Infinity ? evalState(state, me, meStyle) : best
}

function opponentBestResponseMinimizingMe(state: GameState, me: Player, meStyle: AiStyle, oppLevel: AiLevel, deadline?: number): number {
  if (state.gameOver) return evalState(state, me, meStyle)
  if (deadline && Date.now() > deadline) return evalState(state, me, meStyle)

  const opp = other(me)
  if (state.player !== opp) return evalState(state, me, meStyle)

  const myLevel = oppLevel === "grandmaster" ? "grandmaster" : "senior_master"

  if (state.phase !== "ACTION") {
    const c: GameState = structuredClone(state)
    playoutFast(c, opp)
    return meBestResponseMaximizing(c, me, meStyle, myLevel, deadline)
  }

  const moves = enumerateLegalActionMoves(state, opp)
  if (moves.length === 0) {
    const c: GameState = structuredClone(state)
    yieldForcedIfNoUsableRoutes(c)
    playoutFast(c, opp)
    return meBestResponseMaximizing(c, me, meStyle, myLevel, deadline)
  }

  const ordered = orderMoves(state, opp, moves)
  let worstForMe = Infinity

  for (const mv of ordered) {
    if (deadline && Date.now() > deadline) break
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFast(c, opp)

    const sc = meBestResponseMaximizing(c, me, meStyle, myLevel, deadline)
    if (sc < worstForMe) worstForMe = sc
  }

  return worstForMe === Infinity ? evalState(state, me, meStyle) : worstForMe
}

function bestSeniorMasterActionMove(state: GameState, me: Player, style: AiStyle): ActionMove | null {
  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) return null

  const deadline = Date.now() + SEARCH_BUDGET_MS.senior_master
  const ordered = orderMoves(state, me, moves)
  const candidates = ordered.slice(0, 8)  // cap to top 8
  const useThreePly = ordered.length <= 10

  let best: ActionMove | null = null
  let bestScore = -Infinity

  for (const mv of candidates) {
    if (Date.now() > deadline) break
    const c: GameState = structuredClone(state)

    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFast(c, me)

    let sc: number
    if (useThreePly) {
      sc = opponentBestResponseMinimizingMe(c, me, style, "master", deadline)
    } else {
      const opp = other(me)
      if (c.player === opp) sc = opponentBestResponseMinimizingMe2ply(c, me, style, "master", deadline)
      else sc = evalState(c, me, style)
    }

    if (sc > bestScore) {
      bestScore = sc
      best = mv
    }
  }

  return best
}

function bestGrandmasterActionMove(state: GameState, me: Player, style: AiStyle): ActionMove | null {
  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) return null

  const deadline = Date.now() + SEARCH_BUDGET_MS.grandmaster
  const ordered = orderMoves(state, me, moves)
  const candidates = ordered.slice(0, 16)  // more candidates with larger time budget

  let best: ActionMove | null = null
  let bestScore = -Infinity

  for (const mv of candidates) {
    if (Date.now() > deadline) break
    const c: GameState = structuredClone(state)

    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFast(c, me)

    const sc = opponentBestResponseMinimizingMe(c, me, style, "senior_master", deadline)

    if (sc > bestScore) {
      bestScore = sc
      best = mv
    }
  }

  return best
}

// ------------------------------------------------------------
// Unified style-driven step pipeline (all levels)
// ------------------------------------------------------------
function aiStepWithStyle(state: GameState, aiPlayer: Player, level: AiLevel, style: AiStyle) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  if (state.phase === "OPENING") {
    const c = openingChoice(state, aiPlayer, style)
    if (!c) return
    placeOpeningToken(state, c)
    return
  }

  if (state.phase === "REINFORCE") {
    let c: Coord | null = null
    if (style.reinforcePicker === "random") c = randomReinforcementSquare(state)
    else if (style.reinforcePicker === "best") c = bestReinforcementPlacement(state, aiPlayer, style)
    else c = safestReinforcementSquare(state, aiPlayer, style)

    if (!c) return
    placeReinforcement(state, c)
    return
  }

  if (state.phase === "SWAP") {
    const plan =
      style.swapPicker === "random"
        ? randomSwapChoice(state, aiPlayer)
        : bestSwapChoice(state, aiPlayer, style)

    if (!plan) return
    if (!state.pendingSwap.handRouteId) {
      chooseSwapHandRoute(state, plan.handId)
      return
    }
    if (state.pendingSwap.queueIndex === null) {
      chooseSwapQueueIndex(state, plan.qIdx)
      return
    }
    confirmSwapAndEndTurn(state)
    return
  }

  if (state.phase === "ACTION") {
    // If already armed, we must complete/cancel the swap flow.
    if (state.earlySwapArmed) {
      const plan =
        style.earlySwapMode === "brutal"
          ? bestEarlySwapPlanBrutal(state, aiPlayer, style)
          : style.earlySwapMode === "basic"
            ? bestEarlySwapPlanBasic(state, aiPlayer, style)
            : null

      if (!plan) {
        cancelEarlySwap(state)
        return
      }
      if (!state.pendingSwap.handRouteId) {
        chooseSwapHandRoute(state, plan.handId)
        return
      }
      if (state.pendingSwap.queueIndex === null) {
        chooseSwapQueueIndex(state, plan.qIdx)
        return
      }
      confirmEarlySwap(state)
      return
    }

    // Consider arming early swap.
    if (style.earlySwapMode !== "none") {
      const earlyPlan =
        style.earlySwapMode === "brutal"
          ? bestEarlySwapPlanBrutal(state, aiPlayer, style)
          : bestEarlySwapPlanBasic(state, aiPlayer, style)

      if (earlyPlan) {
        armEarlySwap(state)
        return
      }
    }

    // Ransom (style-driven)
    if (shouldRansom(state, aiPlayer, style)) {
      useRansom(state)
      return
    }

    // Extra reinforcement (style-driven)
    if (style.extraReinforcement.mode === "sim") {
      if (
        state.phase === "ACTION" &&
        !state.gameOver &&
        !(state as any).extraReinforcementBoughtThisTurn
      ) {
        const myOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === aiPlayer).length
        const theirOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === other(aiPlayer)).length
        const badlyOutnumbered = theirOnBoard >= myOnBoard + 2

        // Survival override: buy extra reinforcement when badly outnumbered,
        // even if below normal reserve threshold (as long as we can afford it)
        const canAfford = state.reserves[aiPlayer] >= 2  // buyExtraReinforcement costs 2
        if (badlyOutnumbered && canAfford && !(state as any).extraReinforcementBoughtThisTurn) {
          buyExtraReinforcement(state)
          return
        }

        if (state.reserves[aiPlayer] >= style.extraReinforcement.minReserves) {
          const base = evalState(state, aiPlayer, style)
          const after = simulateAndScore(state, aiPlayer, style, (s) => buyExtraReinforcement(s))
          if (after >= base + style.extraReinforcement.simDelta) {
            buyExtraReinforcement(state)
            return
          }
        }
      }
    } else {
      if (shouldBuyExtraReinforcementHeuristic(state, aiPlayer)) {
        buyExtraReinforcement(state)
        return
      }
    }

    // ACTION move selection
    if (style.actionPicker === "random") {
      const mv = randomActionMove(state, aiPlayer)
      if (mv) {
        applyRouteMove(state, mv.tokenId, mv.routeId)
        return
      }
      yieldForcedIfNoUsableRoutes(state)
      return
    }

    if (style.actionPicker === "tacticalGreedy") {
      const mv = bestTacticalActionMove(state, aiPlayer, style)
      if (mv) {
        applyRouteMove(state, mv.tokenId, mv.routeId)
        return
      }
      yieldForcedIfNoUsableRoutes(state)
      return
    }

    if (style.actionPicker === "gmSearch") {
      const mv = bestGrandmasterActionMove(state, aiPlayer, style)
      if (mv) {
        applyRouteMove(state, mv.tokenId, mv.routeId)
        return
      }
      yieldForcedIfNoUsableRoutes(state)
      return
    }

    if (style.actionPicker === "seniorMasterSearch") {
      const mv = bestSeniorMasterActionMove(state, aiPlayer, style)
      if (mv) {
        applyRouteMove(state, mv.tokenId, mv.routeId)
        return
      }
      yieldForcedIfNoUsableRoutes(state)
      return
    }

    if (style.actionPicker === "master2ply") {
      const mv = bestMasterActionMove(state, aiPlayer, style)
      if (mv) {
        applyRouteMove(state, mv.tokenId, mv.routeId)
        return
      }
      yieldForcedIfNoUsableRoutes(state)
      return
    }

    // greedyTopN (with controlled “mistakes”)
    const top = bestActionMovesTopN(state, aiPlayer, style, 3)
    const picked = pickBlueBeltMove(top, style.mistakeChance)
    if (picked) {
      applyRouteMove(state, picked.tokenId, picked.routeId)
      return
    }

    yieldForcedIfNoUsableRoutes(state)
    return
  }
}

// ------------------------------------------------------------
// Legacy named exports (kept for external callers; now style-driven)
// ------------------------------------------------------------
export function aiStepNovice(state: GameState, aiPlayer: Player) {
  return aiStepWithStyle(state, aiPlayer, "novice", AI_STYLE.novice)
}
export function aiStepAdept(state: GameState, aiPlayer: Player) {
  return aiStepWithStyle(state, aiPlayer, "adept", AI_STYLE.adept)
}
export function aiStepExpert(state: GameState, aiPlayer: Player) {
  return aiStepWithStyle(state, aiPlayer, "expert", AI_STYLE.expert)
}
export function aiStepMaster(state: GameState, aiPlayer: Player) {
  return aiStepWithStyle(state, aiPlayer, "master", AI_STYLE.master)
}
export function aiStepSeniorMaster(state: GameState, aiPlayer: Player) {
  return aiStepWithStyle(state, aiPlayer, "senior_master", AI_STYLE.senior_master)
}
export function aiStepGrandmaster(state: GameState, aiPlayer: Player) {
  return aiStepWithStyle(state, aiPlayer, "grandmaster", AI_STYLE.grandmaster)
}

// ------------------------------------------------------------
// AI CHAT — 6 LEVELS
// ------------------------------------------------------------
export type AiChatEvent =
  | "HELLO"
  | "OPENING_PLAY"
  | "YOU_BLUNDERED"
  | "YOU_MISSED_TACTIC"
  | "I_CAPTURED"
  | "I_SIEGED"
  | "I_LOCKED"
  | "I_ESCAPED"
  | "YOU_STALLED"
  | "NICE_TRY"
  | "GAME_OVER_WIN"
  | "GAME_OVER_LOSS"
  | "REMATCH"
  | "SILENCE"

export type AiChatContext = {
  turn?: number
  streak?: number
  player?: Player
  ai?: Player
}

export function aiChatPickLine(level: AiLevel, ev: AiChatEvent, ctx?: AiChatContext): string | null {
  const table = {
    novice: NOVICE_CHAT,
    adept: ADEPT_CHAT,
    expert: EXPERT_CHAT,
    master: MASTER_CHAT,
    senior_master: SENIOR_MASTER_CHAT,
    grandmaster: GRANDMASTER_CHAT,
  }[level]
  return pickFromTable(level, table, ev, ctx)
}

function shouldSpeak(level: AiLevel, ev: AiChatEvent): boolean {
  if (ev === "SILENCE") return false

  switch (level) {
    case "novice":
      if (ev === "HELLO") return Math.random() < 0.9
      if (ev === "OPENING_PLAY") return Math.random() < 0.4
      if (ev === "GAME_OVER_WIN" || ev === "GAME_OVER_LOSS") return Math.random() < 0.95
      return Math.random() < 0.22

    case "adept":
      if (ev === "HELLO") return Math.random() < 0.55
      if (ev === "OPENING_PLAY") return Math.random() < 0.18
      if (ev === "YOU_BLUNDERED") return Math.random() < 0.75
      if (ev === "YOU_MISSED_TACTIC") return Math.random() < 0.55
      if (ev === "I_CAPTURED" || ev === "I_SIEGED" || ev === "I_LOCKED") return Math.random() < 0.35
      if (ev === "GAME_OVER_WIN" || ev === "GAME_OVER_LOSS") return Math.random() < 0.65
      return Math.random() < 0.12

    case "expert":
      if (ev === "HELLO") return Math.random() < 0.8
      if (ev === "YOU_BLUNDERED") return Math.random() < 0.85
      if (ev === "I_CAPTURED" || ev === "I_SIEGED" || ev === "I_LOCKED") return Math.random() < 0.55
      if (ev === "GAME_OVER_WIN") return Math.random() < 0.9
      if (ev === "GAME_OVER_LOSS") return Math.random() < 0.6
      if (ev === "YOU_MISSED_TACTIC") return Math.random() < 0.7
      return Math.random() < 0.2

    case "master":
    case "senior_master":
      if (ev === "HELLO") return Math.random() < 0.7
      if (ev === "YOU_BLUNDERED") return Math.random() < 0.8
      if (ev === "YOU_MISSED_TACTIC") return Math.random() < 0.85
      if (ev === "I_CAPTURED" || ev === "I_SIEGED") return Math.random() < 0.4
      if (ev === "GAME_OVER_WIN" || ev === "GAME_OVER_LOSS") return Math.random() < 0.85
      if (ev === "NICE_TRY") return Math.random() < 0.5
      return Math.random() < 0.15

    case "grandmaster":
      if (ev === "HELLO") return Math.random() < 0.5
      if (ev === "GAME_OVER_WIN") return Math.random() < 0.7
      if (ev === "GAME_OVER_LOSS") return Math.random() < 0.5
      if (ev === "YOU_BLUNDERED") return Math.random() < 0.2
      return Math.random() < 0.04
  }
}

type ChatTable = Record<AiChatEvent, string[]>

function pickFromTable(level: AiLevel, table: ChatTable, ev: AiChatEvent, ctx?: AiChatContext): string | null {
  if (!shouldSpeak(level, ev)) return null
  const lines = table[ev]
  if (!lines || lines.length === 0) return null
  return lines[randomInt(lines.length)]
}

// ------------------------------------------------------------
// NOVICE — clueless, excited, has no idea what's happening
// ------------------------------------------------------------
const NOVICE_CHAT: ChatTable = {
  HELLO: [
    "Alright — let's learn this.",
    "You've got this. One move at a time.",
    "No pressure. We're just playing.",
    "Let's see what happens!",
    "I think I know what I'm doing. Mostly.",
  ],
  OPENING_PLAY: [
    "Center is usually a good start, right?",
    "I read something about opening positions once.",
    "Here goes nothing.",
    "That felt like a good move.",
  ],
  YOU_BLUNDERED: [
    "Oh! Was that bad? I'm not sure.",
    "Hmm. Something seems different now.",
    "I didn't plan that but okay.",
    "That one hurt — but you'll spot it next time.",
  ],
  YOU_MISSED_TACTIC: [
    "There was a tactic there. I think.",
    "Keep an eye on captures and sieges.",
    "Look for what changes after your move.",
  ],
  I_CAPTURED: ["Oh! I got one!", "Was that good? I think that was good.", "Capture! I did the capture thing!", "That's a swing — watch those lanes."],
  I_SIEGED: ["I surrounded something. Is that good?", "That's a lot of my pieces near yours.", "Siege pressure building, I think!"],
  I_LOCKED: ["It's locked? What does that do exactly?", "That token can't move now. I did that!", "Locked — but not dead. Yet."],
  I_ESCAPED: ["I moved away from that. Phew.", "That was close I think.", "Nice try — I sort of slipped out."],
  YOU_STALLED: ["Are you stuck? I feel like we're both stuck.", "Sometimes the best move is repositioning.", "Maybe try a different route?"],
  NICE_TRY: ["Good idea!", "That was close.", "You're learning fast.", "Oh that was clever."],
  GAME_OVER_WIN: ["I won?! I won!!", "Wait really? That worked?", "Good game. I think I got lucky."],
  GAME_OVER_LOSS: ["Good game! Want to run it back?", "No worries. I'll get you next time.", "That was fun. Again?"],
  REMATCH: ["Again!", "Run it back!", "Let's go again!"],
  SILENCE: [],
}

// ------------------------------------------------------------
// INTERMEDIATE — smug, sharp, corrective
// ------------------------------------------------------------
const ADEPT_CHAT: ChatTable = {
  HELLO: ["Alright. Let's see what you've got.", "Don't blink.", "Play clean."],
  OPENING_PLAY: ["Fine.", "That's a start.", "We'll see."],
  YOU_BLUNDERED: ["You left that open.", "That was free.", "You can't do that.", "I'll take that every time."],
  YOU_MISSED_TACTIC: ["You didn't see it.", "There was a punish there.", "You're reacting, not reading."],
  I_CAPTURED: ["Thanks.", "Free piece.", "Obvious."],
  I_SIEGED: ["That ring is closing.", "Count the sides.", "You feel that pressure yet?"],
  I_LOCKED: ["Locked.", "Now it can't run.", "That's what happens."],
  I_ESCAPED: ["Not today.", "Good idea. Wrong timing.", "Close. But no."],
  YOU_STALLED: ["You're out of ideas.", "Swap, or drown.", "Find a line."],
  NICE_TRY: ["Better.", "Almost.", "You're learning. Don't get cocky."],
  GAME_OVER_WIN: ["That's the difference.", "You'll see it on replay.", "Again when you're ready."],
  GAME_OVER_LOSS: ["Okay. That was decent.", "You can improve from this one.", "Replay it. You'll find the turn."],
  REMATCH: ["Again.", "Same rules. Same outcome.", "Go."],
  SILENCE: [],
}

// ------------------------------------------------------------
// ADVANCED — cocky, trash-talking, rubs it in
// ------------------------------------------------------------
const EXPERT_CHAT: ChatTable = {
  HELLO: ["I hope you warmed up.", "Let me know when you're ready to lose.", "This won't take long.", "You sure about this?"],
  OPENING_PLAY: ["Predictable.", "I've seen that before.", "Okay. I'll allow it."],
  YOU_BLUNDERED: ["Did you even think that through?", "Free real estate.", "I was hoping you'd do that.", "Thank you.", "That's a gift."],
  YOU_MISSED_TACTIC: ["It was right there.", "You looked at it and still missed it.", "That's the difference between us.", "I would've seen that in two seconds."],
  I_CAPTURED: ["And that's gone.", "Easy.", "You weren't using it anyway.", "Mine now."],
  I_SIEGED: ["You're boxed in.", "Nowhere to run.", "You see this, right?", "That ring is mine."],
  I_LOCKED: ["Sit there.", "Locked. Don't even try.", "That token's decorative now."],
  I_ESCAPED: ["You really thought that would work?", "Nice try. Not even close.", "Try again."],
  YOU_STALLED: ["You've got nothing.", "Out of moves? Already?", "This is embarrassing."],
  NICE_TRY: ["I'll give you that one.", "Okay, that was actually decent.", "Don't get used to that."],
  GAME_OVER_WIN: ["Called it.", "Not even close.", "Same result next time.", "Come back when you've practiced."],
  GAME_OVER_LOSS: ["You got lucky.", "I wasn't playing my best.", "Run it back. Right now.", "That doesn't count."],
  REMATCH: ["Again. Right now.", "That was a warmup.", "Let's go."],
  SILENCE: [],
}

// ------------------------------------------------------------
// MASTER — teacherly, precise, hard but fair
// ------------------------------------------------------------
const MASTER_CHAT: ChatTable = {
  HELLO: [
    "Good. Let's play.",
    "Pay attention to what I'm doing, not just what you're doing.",
    "Clear your head. Think before each move.",
    "Let's see where you are.",
  ],
  OPENING_PLAY: ["Center control matters early.", "Your opening defines your options later.", "Consider what that opening position enables."],
  YOU_BLUNDERED: [
    "You moved without checking adjacent threats first.",
    "Before you move, ask: what does this leave open?",
    "That position was safe. You left it voluntarily.",
    "Slow down. The board doesn't change while you think.",
    "That blunder came from not reading my last move.",
  ],
  YOU_MISSED_TACTIC: [
    "There was a forcing sequence there. Look at captures before other moves.",
    "When a siege ring is almost complete, completing it is usually priority one.",
    "You had a lock available. Always check for locks before repositioning.",
    "The tactic was: move here, then here. Pattern recognition comes with repetition.",
  ],
  I_CAPTURED: ["That was the forcing line.", "Capture with a threat attached is stronger than a plain capture.", "I set that up two moves ago."],
  I_SIEGED: ["Four sides is a lock. Eight is a capture. Know the threshold.", "Siege rings don't complete in one move. Recognize the buildup.", "Your token is under siege. You have a window to break it."],
  I_LOCKED: ["Locked. Your reserve is your only rescue now.", "That's what 4-sided adjacency does. It's a resource drain.", "Can you break it before I complete the ring?"],
  I_ESCAPED: ["You had the siege. You needed one more side covered.", "Good pressure. Wrong follow-up.", "Close — check why it failed before you try again."],
  YOU_STALLED: ["No usable routes means you're paying into the void. Plan to avoid that.", "Stalled positions come from reactive play. Start building ahead of your opponent.", "A route swap might solve this, but think about which route actually helps."],
  NICE_TRY: ["That was the right idea. The timing was off.", "Good concept. Work on the execution.", "You're starting to see the patterns.", "That's the right kind of thinking."],
  GAME_OVER_WIN: ["The game turned when you left that position open. Review it.", "You played well in the middle. The endgame needs work.", "Good game. You have a real foundation to build on."],
  GAME_OVER_LOSS: ["You found something I didn't expect. Study that sequence.", "Well played. You executed clean.", "You earned it. Good game."],
  REMATCH: ["Again. Apply what you just learned.", "Go again.", "Next game, focus on what went wrong."],
  SILENCE: [],
}

// ------------------------------------------------------------
// GRANDMASTER — nearly silent, a few words max, just wins
// ------------------------------------------------------------
const SENIOR_MASTER_CHAT = MASTER_CHAT

const GRANDMASTER_CHAT: ChatTable = {
  HELLO: [".", "Play.", "Begin.", "Go."],
  OPENING_PLAY: ["Noted.", "Fine."],
  YOU_BLUNDERED: ["No.", "Wrong."],
  YOU_MISSED_TACTIC: ["There."],
  I_CAPTURED: ["."],
  I_SIEGED: ["Closing."],
  I_LOCKED: ["Done."],
  I_ESCAPED: ["No."],
  YOU_STALLED: ["Nowhere."],
  NICE_TRY: ["No.", "Not yet."],
  GAME_OVER_WIN: ["Expected.", "Again if you want.", "There it is."],
  GAME_OVER_LOSS: ["Good.", "You earned it.", "Go again."],
  REMATCH: ["Again.", "Go."],
  SILENCE: [],
}