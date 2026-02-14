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
} from "./game"

export type AiLevel = "novice" | "adept" | "expert" | "master" | "senior_master" | "grandmaster"

export function aiStep(state: GameState, aiPlayer: Player, level: AiLevel) {
if (level === "grandmaster") return aiStepGrandmaster(state, aiPlayer)
if (level === "senior_master") return aiStepSeniorMaster(state, aiPlayer)
if (level === "master") return aiStepMaster(state, aiPlayer)
if (level === "expert") return aiStepExpert(state, aiPlayer)
if (level === "adept") return aiStepAdept(state, aiPlayer)
return aiStepNovice(state, aiPlayer)
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

function safestReinforcementSquare(state: GameState, me: Player): Coord | null {
  const empties = allEmptySquares(state)
  if (empties.length === 0) return null

  const enemy = other(me)

  // 1) HARD RULE: prefer safe squares (can't be invaded next turn) if any exist.
  const safe = empties.filter((c) => !canEnemyInvadeSquareNextTurn(state, enemy, c))
  const candidates = safe.length > 0 ? safe : empties

  // Helper: adjacency check
  function isAdj(a: Coord, b: Coord): boolean {
    return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y)
  }

  // Precompute siege status
  const myTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === enemy)

  // Identify my tokens that are in trouble (enemy siege pressure).
  // (Lock is 4-7 in your code’s movement rule; 8 is capture ring.)
  const threatenedMine = myTokens
    .map((t) => ({ t, enemySides: siegeSidesFor(state, enemy, t.pos.x, t.pos.y) }))
    .filter((x) => x.enemySides >= 3) // “rescue window” starts at 3

  let best = candidates[0]
  let bestScore = -Infinity

  for (const c of candidates) {
    // Base: keep it sane using your general evaluator.
    // (This alone won’t do “rescue”, so we add explicit rescue/siege bonuses below.)
    const base = simulateAndScore(state, me, (s) => placeReinforcement(s, c))

    let bonus = 0

    // 2a) SIEGE INTENT: placing adjacent to an enemy token increases our siegeSides on it by +1.
    // Big bumps for hitting lock/capture thresholds.
    for (const e of enemyTokens) {
      if (!isAdj(c, e.pos)) continue

      const before = siegeSidesFor(state, me, e.pos.x, e.pos.y)
      const after = before + 1

      // Reward *crossing* important thresholds.
      if (before < 4 && after >= 4) bonus += 80   // create a lock threat
      if (before < 7 && after >= 7) bonus += 60   // near-complete ring pressure
      if (before < 8 && after >= 8) bonus += 200  // completes capture ring

      // Small reward for just increasing pressure at all.
      bonus += 8
    }

    // 2b) RESCUE INTENT: if one of our tokens is under siege pressure,
    // prefer occupying an empty adjacent square (it blocks the enemy from taking that spot later).
    // Heavier bonus when the token is closer to being locked/captured.
    for (const m of threatenedMine) {
      if (!isAdj(c, m.t.pos)) continue
      if (m.enemySides >= 7) bonus += 140
      else if (m.enemySides >= 4) bonus += 90
      else bonus += 40 // enemySides == 3
    }

    // Slightly bias away from “same square every time” when scores tie:
    // tiny center preference (NOT a hard opening rule; just a tie-breaker).
    const cx = (SIZE - 1) / 2
    const cy = (SIZE - 1) / 2
    const dist = Math.abs(c.x - cx) + Math.abs(c.y - cy)
    const tieBreak = -0.01 * dist

    const sc = base + bonus + tieBreak
    if (sc > bestScore) {
      bestScore = sc
      best = c
    }
  }

  return best
}

// ------------------------------------------------------------
// Novice AI (was Beginner) — pure random legal moves
// ------------------------------------------------------------
export function aiStepNovice(state: GameState, aiPlayer: Player) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  if (state.phase === "OPENING") {
    const empties = allEmptySquares(state)
    if (empties.length === 0) return
    placeOpeningToken(state, empties[randomInt(empties.length)])
    return
  }

  if (state.phase === "ACTION") {
    const unused = state.routes[aiPlayer].filter((r) => !state.usedRoutes.includes(r.id))
    if (unused.length === 0) return

    const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === aiPlayer)

    // 1) NEW: if any capture exists, take one (still "novice": picks randomly among captures).
    const captureMoves: Array<{ tokenId: string; routeId: string }> = []
    for (const r of unused) {
      for (const t of tokens) {
        if (!canTokenUseRoute(state, aiPlayer, t, r.id)) continue
        if (isCaptureMove(state, aiPlayer, t.id, r.id)) {
          captureMoves.push({ tokenId: t.id, routeId: r.id })
        }
      }
    }

    if (captureMoves.length > 0) {
      const mv = captureMoves[randomInt(captureMoves.length)]
      applyRouteMove(state, mv.tokenId, mv.routeId)
      return
    }

    // 2) Otherwise: keep the old random-legal behavior.
    const routeOrder = [...unused].sort(() => Math.random() - 0.5)

    for (const r of routeOrder) {
      const legalTokens = tokens.filter((t) => canTokenUseRoute(state, aiPlayer, t, r.id))
      if (legalTokens.length === 0) continue
      const chosen = legalTokens[randomInt(legalTokens.length)]
      applyRouteMove(state, chosen.id, r.id)
      return
    }

    yieldForcedIfNoUsableRoutes(state)
    return
  }

  if (state.phase === "REINFORCE") {
    const empties = allEmptySquares(state)
    if (empties.length === 0) return
    placeReinforcement(state, empties[randomInt(empties.length)])
    return
  }

  if (state.phase === "SWAP") {
    if (!state.pendingSwap.handRouteId) {
      const hand = state.routes[aiPlayer]
      chooseSwapHandRoute(state, hand[randomInt(hand.length)].id)
      return
    }
    if (state.pendingSwap.queueIndex === null) {
      chooseSwapQueueIndex(state, randomInt(state.queue.length))
      return
    }
    confirmSwapAndEndTurn(state)
    return
  }
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

function evalState(state: GameState, me: Player): number {
  const them = other(me)

  const myOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me).length
  const theirOnBoard = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them).length

  const myRes = state.reserves[me]
  const theirRes = state.reserves[them]

  const myCap = state.captives[me]
  const theirCap = state.captives[them]

  const myVoid = (state as any).void?.[me] ?? 0
  const theirVoid = (state as any).void?.[them] ?? 0

  if (state.gameOver) {
    return state.gameOver.winner === me ? 1_000_000 : -1_000_000
  }

  let score = 0

  score += 10 * myOnBoard
  score -= 10 * theirOnBoard
  score += 2 * myRes
  score -= 2 * theirRes
  score += 1.5 * myCap
  score -= 1.5 * theirCap
  score += 0.5 * myVoid
  score -= 0.5 * theirVoid

  const myInv = state.turnInvades?.[me] ?? 0
  if (myInv >= 3 && myVoid > 0) score += 25

  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them)
  const myTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)

  for (const e of enemyTokens) {
    const sides = siegeSidesFor(state, me, e.pos.x, e.pos.y)
    if (sides === 3) score += 6
    else if (sides >= 4 && sides <= 6) score += 14
    else if (sides === 7) score += 24
    else if (sides === 8) score += 60
  }

  for (const m of myTokens) {
    const sides = siegeSidesFor(state, them, m.pos.x, m.pos.y)
    if (sides === 3) score -= 7
    else if (sides >= 4 && sides <= 6) score -= 16
    else if (sides === 7) score -= 28
    else if (sides === 8) score -= 70
  }

  if (state.phase === "ACTION") {
    score += 0.25 * countUsableMoves(state, me)
    score -= 0.25 * countUsableMoves(state, them)
  }

  return score
}

function simulateAndScore<T>(state: GameState, me: Player, mut: (s: GameState) => void): number {
  const c: GameState = structuredClone(state)
  mut(c)
  return evalState(c, me)
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
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

function shouldBuyExtraReinforcement(state: GameState, me: Player): boolean {
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

function bestActionMove(state: GameState, me: Player): { tokenId: string; routeId: string; score: number } | null {
  const unused = state.routes[me].filter((r) => !state.usedRoutes.includes(r.id))
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)

  let best: { tokenId: string; routeId: string; score: number } | null = null

  for (const r of unused) {
    for (const t of tokens) {
      if (!canTokenUseRoute(state, me, t, r.id)) continue
      const sc = simulateAndScore(state, me, (s) => applyRouteMove(s, t.id, r.id))
      if (!best || sc > best.score) best = { tokenId: t.id, routeId: r.id, score: sc }
    }
  }

  return best
}

function bestReinforcementPlacement(state: GameState, me: Player): Coord | null {
  const empties = allEmptySquares(state)
  if (empties.length === 0) return null

  let best = empties[0]
  let bestScore = -Infinity

  for (const c of empties) {
    const sc = simulateAndScore(state, me, (s) => placeReinforcement(s, c))
    if (sc > bestScore) { bestScore = sc; best = c }
  }

  return best
}

function bestSwapChoice(state: GameState, me: Player): { handId: string; qIdx: number } | null {
  const hand = state.routes[me]
  if (hand.length === 0) return null
  if (state.queue.length === 0) return null

  let best: { handId: string; qIdx: number } | null = null
  let bestScore = -Infinity

  for (const h of hand) {
    for (let qIdx = 0; qIdx < state.queue.length; qIdx++) {
      const sc = simulateAndScore(state, me, (s) => {
        chooseSwapHandRoute(s, h.id)
        chooseSwapQueueIndex(s, qIdx)
        confirmSwapAndEndTurn(s)
      })
      if (sc > bestScore) { bestScore = sc; best = { handId: h.id, qIdx } }
    }
  }

  return best
}

function bestEarlySwapPlanBasic(state: GameState, me: Player): { handId: string; qIdx: number } | null {
  if (state.phase !== "ACTION") return null
  if (state.gameOver) return null
  if (state.earlySwapUsedThisTurn) return null

  const remainingMoves = countUsableMoves(state, me)
  const urgency = remainingMoves <= 2
  if (!urgency && state.captives[me] < 2) return null

  const unusedHand = state.routes[me].filter((r) => !state.usedRoutes.includes(r.id))
  if (unusedHand.length === 0) return null

  let best: { handId: string; qIdx: number } | null = null
  let bestScore = -Infinity

  for (const h of unusedHand) {
    for (let qIdx = 0; qIdx < state.queue.length; qIdx++) {
      const sc = simulateAndScore(state, me, (s) => {
        armEarlySwap(s)
        chooseSwapHandRoute(s, h.id)
        chooseSwapQueueIndex(s, qIdx)
        confirmEarlySwap(s)
      })
      if (sc > bestScore) { bestScore = sc; best = { handId: h.id, qIdx } }
    }
  }

  const baseline = evalState(state, me)
  if (best && bestScore >= baseline + 8) return best

  return null
}


// ------------------------------------------------------------
// Brutal early-swap tactic (Senior Master / Grandmaster)
// If we have no forcing tactics with current unused routes, and the queue
// can give us a forcing line (lock/capture pressure), spend to swap NOW.
// ------------------------------------------------------------
type ForcingInfo = { score: number; isCapture: boolean; isLockOrBetter: boolean }

function bestForcingOpportunity(state: GameState, me: Player): ForcingInfo {
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
    const capGained = (c.captives[me] > baseMyCap) || (theirOnAfter < theirOnBefore)

    // After the move, measure best siege pressure we have on any enemy token.
    let maxSides = 0
    for (const e of c.tokens) {
      if (e.in !== "BOARD" || e.owner !== them) continue
      const sides = siegeSidesFor(c, me, e.pos.x, e.pos.y)
      if (sides > maxSides) maxSides = sides
      if (maxSides >= 8) break
    }

    // Heavily prefer immediate captures; otherwise prefer creating/advancing locks.
    let sc = 0
    if (capGained) sc += 1000
    else if (maxSides >= 8) sc += 900
    else if (maxSides == 7) sc += 260
    else if (maxSides >= 4) sc += 140  // lock pressure (4+)
    else if (maxSides == 3) sc += 60

    // Small nudge from general evaluation (keeps it from doing stupid swaps).
    sc += 0.05 * evalState(c, me)

    const lockOrBetter = capGained || maxSides >= 4

    if (sc > bestScore) {
      bestScore = sc
      bestCapture = capGained || maxSides >= 8
      bestLock = lockOrBetter
    }
  }

  return { score: bestScore, isCapture: bestCapture, isLockOrBetter: bestLock }
}

function bestEarlySwapPlanBrutal(state: GameState, me: Player): { handId: string; qIdx: number } | null {
  if (state.phase !== "ACTION") return null
  if (state.gameOver) return null
  if (state.earlySwapUsedThisTurn) return null

  // If we already have a forcing tactic available, don't pay to swap early.
  const curForce = bestForcingOpportunity(state, me)

  // If opponent is on life support, prioritize swaps that create lock/capture lines.
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

      const afterForce = bestForcingOpportunity(c, me)

      // Our "brutal" rule: if we *gain* a forcing line we didn't have before, that's huge.
      let sc = (afterForce.score - curForce.score)

      // Prefer plans that create lock/capture pressure, especially in endgame.
      if (!curForce.isLockOrBetter && afterForce.isLockOrBetter) sc += 600
      if (!curForce.isCapture && afterForce.isCapture) sc += 900
      if (endgameKill && afterForce.isLockOrBetter) sc += 500

      // Also ensure it isn't positionally suicidal.
      sc += 0.15 * (evalState(c, me) - evalState(state, me))

      if (sc > bestScore) {
        bestScore = sc
        best = { handId: h.id, qIdx }
      }
    }
  }

  // Trigger swap if it meaningfully improves forcing chances.
  // In "kill" endgames we accept smaller improvements.
  const threshold = endgameKill ? 250 : 450

  if (best && bestScore >= threshold) return best
  return null
}



function bestActionMovesTopN(
  state: GameState,
  me: Player,
  n: number
): Array<{ tokenId: string; routeId: string; score: number }> {
  const unused = state.routes[me].filter((r) => !state.usedRoutes.includes(r.id))
  const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)

  const scored: Array<{ tokenId: string; routeId: string; score: number }> = []

  for (const r of unused) {
    for (const t of tokens) {
      if (!canTokenUseRoute(state, me, t, r.id)) continue
      const sc = simulateAndScore(state, me, (s) => applyRouteMove(s, t.id, r.id))
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

  // 25%: intentionally *not* the best move (when we have alternatives).
  if (top.length >= 2 && Math.random() < mistakeChance) {
    if (top.length === 2) return { tokenId: top[1].tokenId, routeId: top[1].routeId }
    // Prefer 2nd-best over 3rd-best.
    const pick = Math.random() < 0.7 ? top[1] : top[2]
    return { tokenId: pick.tokenId, routeId: pick.routeId }
  }

  return { tokenId: top[0].tokenId, routeId: top[0].routeId }
}

function aiStepGreedy(state: GameState, aiPlayer: Player, mistakeChance: number) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  if (state.phase === "OPENING") {
    const empties = allEmptySquares(state)
    if (empties.length === 0) return
    placeOpeningToken(state, empties[randomInt(empties.length)])
    return
  }

  if (state.phase === "REINFORCE") {
    const c = safestReinforcementSquare(state, aiPlayer)
    if (!c) return
    placeReinforcement(state, c)
    return
  }

  if (state.phase === "SWAP") {
    const plan = bestSwapChoice(state, aiPlayer)
    if (!plan) return
    if (!state.pendingSwap.handRouteId) { chooseSwapHandRoute(state, plan.handId); return }
    if (state.pendingSwap.queueIndex === null) { chooseSwapQueueIndex(state, plan.qIdx); return }
    confirmSwapAndEndTurn(state)
    return
  }

  if (state.phase === "ACTION") {
    if (state.earlySwapArmed) {
      const plan = bestEarlySwapPlanBasic(state, aiPlayer) ?? null
      if (!plan) { cancelEarlySwap(state); return }
      if (!state.pendingSwap.handRouteId) { chooseSwapHandRoute(state, plan.handId); return }
      if (state.pendingSwap.queueIndex === null) { chooseSwapQueueIndex(state, plan.qIdx); return }
      confirmEarlySwap(state)
      return
    }

    const earlyPlan = bestEarlySwapPlanBasic(state, aiPlayer)
    if (earlyPlan) { armEarlySwap(state); return }

    if (shouldBuyExtraReinforcement(state, aiPlayer)) { buyExtraReinforcement(state); return }

    // Blue belt separation lives here: same greedy evaluator, but occasional intentional imperfection.
    const top = bestActionMovesTopN(state, aiPlayer, 3)
    const picked = pickBlueBeltMove(top, mistakeChance)
    if (picked) { applyRouteMove(state, picked.tokenId, picked.routeId); return }

    yieldForcedIfNoUsableRoutes(state)
    return
  }
}

// Blue belt (approx): 1-ply greedy + 0% imperfection.
export function aiStepAdept(state: GameState, aiPlayer: Player) {
  return aiStepGreedy(state, aiPlayer, 0.0)
}

// Purple belt (approx): same greedy engine, but no intentional mistakes.
export function aiStepExpert(state: GameState, aiPlayer: Player) {
  return aiStepGreedy(state, aiPlayer, 0.0)
}

// Brown belt (approx): 2-ply minimax (me → opponent) on ACTION, otherwise strong-but-normal policy.
export function aiStepMaster(state: GameState, aiPlayer: Player) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  if (state.phase === "OPENING") {
    const empties = allEmptySquares(state)
    if (empties.length === 0) return
    placeOpeningToken(state, empties[randomInt(empties.length)])
    return
  }

  if (state.phase === "REINFORCE") {
    const c = safestReinforcementSquare(state, aiPlayer)
    if (!c) return
    placeReinforcement(state, c)
    return
  }

  if (state.phase === "SWAP") {
    const plan = bestSwapChoice(state, aiPlayer)
    if (!plan) return
    if (!state.pendingSwap.handRouteId) { chooseSwapHandRoute(state, plan.handId); return }
    if (state.pendingSwap.queueIndex === null) { chooseSwapQueueIndex(state, plan.qIdx); return }
    confirmSwapAndEndTurn(state)
    return
  }

  if (state.phase === "ACTION") {
    if (state.earlySwapArmed) {
      const plan = bestEarlySwapPlanBasic(state, aiPlayer) ?? null
      if (!plan) { cancelEarlySwap(state); return }
      if (!state.pendingSwap.handRouteId) { chooseSwapHandRoute(state, plan.handId); return }
      if (state.pendingSwap.queueIndex === null) { chooseSwapQueueIndex(state, plan.qIdx); return }
      confirmEarlySwap(state)
      return
    }

    const earlyPlan = bestEarlySwapPlanBasic(state, aiPlayer)
    if (earlyPlan) { armEarlySwap(state); return }

    if (shouldBuyExtraReinforcement(state, aiPlayer)) { buyExtraReinforcement(state); return }

    const mv = bestMasterActionMove(state, aiPlayer)
    if (mv) { applyRouteMove(state, mv.tokenId, mv.routeId); return }

    yieldForcedIfNoUsableRoutes(state)
    return
  }
}

function opponentBestResponseMinimizingMe2ply(state: GameState, me: Player): number {
  if (state.gameOver) return evalState(state, me)

  const opp = other(me)
  if (state.player !== opp) return evalState(state, me)

  if (state.phase !== "ACTION") {
    const c: GameState = structuredClone(state)
    playoutFullTurn(c, opp, aiStepExpert)
    return evalState(c, me)
  }

  const moves = enumerateLegalActionMoves(state, opp)
  if (moves.length === 0) {
    const c: GameState = structuredClone(state)
    yieldForcedIfNoUsableRoutes(c)
    playoutFullTurn(c, opp, aiStepExpert)
    return evalState(c, me)
  }

  let worstForMe = Infinity

  for (const mv of moves) {
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFullTurn(c, opp, aiStepExpert)
    const sc = evalState(c, me)
    if (sc < worstForMe) worstForMe = sc
  }

  return worstForMe
}

function bestMasterActionMove(state: GameState, me: Player): ActionMove | null {
  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) return null

  let best: ActionMove | null = null
  let bestScore = -Infinity

  for (const mv of moves) {
    const c: GameState = structuredClone(state)

    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFullTurn(c, me, aiStepExpert) // zero-mistake playout

    // 2-ply: opponent best reply only (no "me response" ply).
    const sc = opponentBestResponseMinimizingMe2ply(c, me)

    if (sc > bestScore) { bestScore = sc; best = mv }
  }

  return best
}

// ------------------------------------------------------------
// Grandmaster AI — shallow minimax (2-ply) + full-turn playout
// ------------------------------------------------------------
type ActionMove = { tokenId: string; routeId: string }

function meBestResponseMaximizing(state: GameState, me: Player): number {
  if (state.gameOver) return evalState(state, me)
  if (state.player !== me) return evalState(state, me)

  if (state.phase !== "ACTION") {
    const c: GameState = structuredClone(state)
    playoutFullTurn(c, me, aiStepExpert) // zero-mistake playout
    return evalState(c, me)
  }

  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) {
    const c: GameState = structuredClone(state)
    yieldForcedIfNoUsableRoutes(c)
    playoutFullTurn(c, me, aiStepExpert) // zero-mistake playout
    return evalState(c, me)
  }

  let best = -Infinity

  for (const mv of moves) {
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFullTurn(c, me, aiStepExpert) // zero-mistake playout
    const sc = evalState(c, me)
    if (sc > best) best = sc
  }

  return best
}

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

// Run the Adept policy until the active player changes (i.e., a full turn finishes),
// or the game ends. This is intentionally deterministic so search is stable.
function playoutFullTurn(
  state: GameState,
  p: Player,
  step: (s: GameState, ai: Player) => void
) {
  const hardCap = 256
  let n = 0
  while (!state.gameOver && state.player === p && n < hardCap) {
    step(state, p)
    n += 1
  }
}

// Given a state where it's opponent's turn, assume opponent chooses a best reply
// that minimizes "me"'s evaluation.
function opponentBestResponseMinimizingMe(state: GameState, me: Player): number {
  if (state.gameOver) return evalState(state, me)

  const opp = other(me)
  if (state.player !== opp) return evalState(state, me)

  if (state.phase !== "ACTION") {
    const c: GameState = structuredClone(state)
    playoutFullTurn(c, opp, aiStepExpert)
    return meBestResponseMaximizing(c, me)  // 👈 3rd ply
  }

  const moves = enumerateLegalActionMoves(state, opp)
  if (moves.length === 0) {
    const c: GameState = structuredClone(state)
    yieldForcedIfNoUsableRoutes(c)
    playoutFullTurn(c, opp, aiStepExpert)
    return meBestResponseMaximizing(c, me)
  }

  let worstForMe = Infinity

  for (const mv of moves) {
    const c: GameState = structuredClone(state)
    applyRouteMove(c, mv.tokenId, mv.routeId)
    playoutFullTurn(c, opp, aiStepExpert)

    const sc = meBestResponseMaximizing(c, me)  // 👈 third ply
    if (sc < worstForMe) worstForMe = sc
  }

  return worstForMe
}

function bestGrandmasterActionMove(state: GameState, me: Player): ActionMove | null {
  const moves = enumerateLegalActionMoves(state, me)
  if (moves.length === 0) return null

  // If too many branches, fallback to 2-ply
  const useThreePly = moves.length <= 8

  let best: ActionMove | null = null
  let bestScore = -Infinity

  for (const mv of moves) {
    const c: GameState = structuredClone(state)

    // Commit the candidate first ACTION move.
    applyRouteMove(c, mv.tokenId, mv.routeId)

    // Finish out MY turn deterministically.
    playoutFullTurn(c, me, aiStepExpert) // zero-mistake playout

    // Opponent chooses a best reply (minimizes my eval).
    let sc: number
    if (useThreePly) {
      sc = opponentBestResponseMinimizingMe(c, me)
    } else {
      // fallback to 2-ply
      const opp = other(me)
      if (c.player === opp) {
        sc = opponentBestResponseMinimizingMe2ply(c, me)
      } else {
        sc = evalState(c, me)
      }
    }

    if (sc > bestScore) {
      bestScore = sc
      best = mv
    }
  }

  return best
}



// ------------------------------------------------------------
// Senior Master AI — between Master and Grandmaster
// - Uses Grandmaster's opening/reinforce heuristics
// - Uses Master's action move chooser (fast + strong) but without GM's deeper lookahead
// ------------------------------------------------------------
export function aiStepSeniorMaster(state: GameState, aiPlayer: Player) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  if (state.phase === "OPENING") {
    const c = bestOpeningSquare(state) ?? (allEmptySquares(state)[0] ?? null)
    if (!c) return
    placeOpeningToken(state, c)
    return
  }

  if (state.phase === "REINFORCE") {
    const c = bestReinforcementPlacement(state, aiPlayer) ?? safestReinforcementSquare(state, aiPlayer)
    if (!c) return
    placeReinforcement(state, c)
    return
  }

  if (state.phase === "SWAP") {
    const plan = bestSwapChoice(state, aiPlayer)
    if (!plan) return
    if (!state.pendingSwap.handRouteId) { chooseSwapHandRoute(state, plan.handId); return }
    if (state.pendingSwap.queueIndex === null) { chooseSwapQueueIndex(state, plan.qIdx); return }
    confirmSwapAndEndTurn(state)
    return
  }

  if (state.phase === "ACTION") {
    // Same economy decisions as Master/Grandmaster.
    if (state.earlySwapArmed) {
      const plan = bestEarlySwapPlanBrutal(state, aiPlayer) ?? null
      if (!plan) { cancelEarlySwap(state); return }
      if (!state.pendingSwap.handRouteId) { chooseSwapHandRoute(state, plan.handId); return }
      if (state.pendingSwap.queueIndex === null) { chooseSwapQueueIndex(state, plan.qIdx); return }
      confirmEarlySwap(state)
      return
    }

    const earlyPlan = bestEarlySwapPlanBrutal(state, aiPlayer)
    if (earlyPlan) { armEarlySwap(state); return }

    if (shouldBuyExtraReinforcement(state, aiPlayer)) { buyExtraReinforcement(state); return }

    const mv = bestMasterActionMove(state, aiPlayer)
    if (mv) { applyRouteMove(state, mv.tokenId, mv.routeId); return }

    yieldForcedIfNoUsableRoutes(state)
    return
  }
}
export function aiStepGrandmaster(state: GameState, aiPlayer: Player) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  if (state.phase === "OPENING") {
    // Stronger opening: prefer central pressure rather than random.
    const c = bestOpeningSquare(state) ?? (allEmptySquares(state)[0] ?? null)
    if (!c) return
    placeOpeningToken(state, c)
    return
  }

  if (state.phase === "REINFORCE") {
    // Stronger reinforce: pick placement that maximizes evaluation.
    const c = bestReinforcementPlacement(state, aiPlayer) ?? safestReinforcementSquare(state, aiPlayer)
    if (!c) return
    placeReinforcement(state, c)
    return
  }

  if (state.phase === "SWAP") {
    const plan = bestSwapChoice(state, aiPlayer)
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
    // Preserve the same economy decisions as Adept (early swap, buy extra reinforce).
    if (state.earlySwapArmed) {
      const plan = bestEarlySwapPlanBrutal(state, aiPlayer) ?? null
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

    const earlyPlan = bestEarlySwapPlanBrutal(state, aiPlayer)
    if (earlyPlan) {
      armEarlySwap(state)
      return
    }

    if (shouldBuyExtraReinforcement(state, aiPlayer)) {
      buyExtraReinforcement(state)
      return
    }

    // Strength bump: 2-ply minimax on the next ACTION move.
    const mv = bestGrandmasterActionMove(state, aiPlayer)
    if (mv) {
      applyRouteMove(state, mv.tokenId, mv.routeId)
      return
    }

    yieldForcedIfNoUsableRoutes(state)
    return
  }
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
      if (ev === "HELLO") return Math.random() < 0.90
      if (ev === "OPENING_PLAY") return Math.random() < 0.40
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
      if (ev === "HELLO") return Math.random() < 0.80
      if (ev === "YOU_BLUNDERED") return Math.random() < 0.85
      if (ev === "I_CAPTURED" || ev === "I_SIEGED" || ev === "I_LOCKED") return Math.random() < 0.55
      if (ev === "GAME_OVER_WIN") return Math.random() < 0.90
      if (ev === "GAME_OVER_LOSS") return Math.random() < 0.60
      if (ev === "YOU_MISSED_TACTIC") return Math.random() < 0.70
      return Math.random() < 0.20

    case "master":
    case "senior_master":
      if (ev === "HELLO") return Math.random() < 0.70
      if (ev === "YOU_BLUNDERED") return Math.random() < 0.80
      if (ev === "YOU_MISSED_TACTIC") return Math.random() < 0.85
      if (ev === "I_CAPTURED" || ev === "I_SIEGED") return Math.random() < 0.40
      if (ev === "GAME_OVER_WIN" || ev === "GAME_OVER_LOSS") return Math.random() < 0.85
      if (ev === "NICE_TRY") return Math.random() < 0.50
      return Math.random() < 0.15

    case "grandmaster":
      if (ev === "HELLO") return Math.random() < 0.50
      if (ev === "GAME_OVER_WIN") return Math.random() < 0.70
      if (ev === "GAME_OVER_LOSS") return Math.random() < 0.50
      if (ev === "YOU_BLUNDERED") return Math.random() < 0.20
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
  I_CAPTURED: [
    "Oh! I got one!",
    "Was that good? I think that was good.",
    "Capture! I did the capture thing!",
    "That's a swing — watch those lanes.",
  ],
  I_SIEGED: [
    "I surrounded something. Is that good?",
    "That's a lot of my pieces near yours.",
    "Siege pressure building, I think!",
  ],
  I_LOCKED: [
    "It's locked? What does that do exactly?",
    "That token can't move now. I did that!",
    "Locked — but not dead. Yet.",
  ],
  I_ESCAPED: [
    "I moved away from that. Phew.",
    "That was close I think.",
    "Nice try — I sort of slipped out.",
  ],
  YOU_STALLED: [
    "Are you stuck? I feel like we're both stuck.",
    "Sometimes the best move is repositioning.",
    "Maybe try a different route?",
  ],
  NICE_TRY: [
    "Good idea!",
    "That was close.",
    "You're learning fast.",
    "Oh that was clever.",
  ],
  GAME_OVER_WIN: [
    "I won?! I won!!",
    "Wait really? That worked?",
    "Good game. I think I got lucky.",
  ],
  GAME_OVER_LOSS: [
    "Good game! Want to run it back?",
    "No worries. I'll get you next time.",
    "That was fun. Again?",
  ],
  REMATCH: [
    "Again!",
    "Run it back!",
    "Let's go again!",
  ],
  SILENCE: [],
}

// ------------------------------------------------------------
// INTERMEDIATE — smug, sharp, corrective
// ------------------------------------------------------------
const ADEPT_CHAT: ChatTable = {
  HELLO: [
    "Alright. Let's see what you've got.",
    "Don't blink.",
    "Play clean.",
  ],
  OPENING_PLAY: [
    "Fine.",
    "That's a start.",
    "We'll see.",
  ],
  YOU_BLUNDERED: [
    "You left that open.",
    "That was free.",
    "You can't do that.",
    "I'll take that every time.",
  ],
  YOU_MISSED_TACTIC: [
    "You didn't see it.",
    "There was a punish there.",
    "You're reacting, not reading.",
  ],
  I_CAPTURED: [
    "Thanks.",
    "Free piece.",
    "Obvious.",
  ],
  I_SIEGED: [
    "That ring is closing.",
    "Count the sides.",
    "You feel that pressure yet?",
  ],
  I_LOCKED: [
    "Locked.",
    "Now it can't run.",
    "That's what happens.",
  ],
  I_ESCAPED: [
    "Not today.",
    "Good idea. Wrong timing.",
    "Close. But no.",
  ],
  YOU_STALLED: [
    "You're out of ideas.",
    "Swap, or drown.",
    "Find a line.",
  ],
  NICE_TRY: [
    "Better.",
    "Almost.",
    "You're learning. Don't get cocky.",
  ],
  GAME_OVER_WIN: [
    "That's the difference.",
    "You'll see it on replay.",
    "Again when you're ready.",
  ],
  GAME_OVER_LOSS: [
    "Okay. That was decent.",
    "You can improve from this one.",
    "Replay it. You'll find the turn.",
  ],
  REMATCH: [
    "Again.",
    "Same rules. Same outcome.",
    "Go.",
  ],
  SILENCE: [],
}

// ------------------------------------------------------------
// ADVANCED — cocky, trash-talking, rubs it in
// ------------------------------------------------------------
const EXPERT_CHAT: ChatTable = {
  HELLO: [
    "I hope you warmed up.",
    "Let me know when you're ready to lose.",
    "This won't take long.",
    "You sure about this?",
  ],
  OPENING_PLAY: [
    "Predictable.",
    "I've seen that before.",
    "Okay. I'll allow it.",
  ],
  YOU_BLUNDERED: [
    "Did you even think that through?",
    "Free real estate.",
    "I was hoping you'd do that.",
    "Thank you.",
    "That's a gift.",
  ],
  YOU_MISSED_TACTIC: [
    "It was right there.",
    "You looked at it and still missed it.",
    "That's the difference between us.",
    "I would've seen that in two seconds.",
  ],
  I_CAPTURED: [
    "And that's gone.",
    "Easy.",
    "You weren't using it anyway.",
    "Mine now.",
  ],
  I_SIEGED: [
    "You're boxed in.",
    "Nowhere to run.",
    "You see this, right?",
    "That ring is mine.",
  ],
  I_LOCKED: [
    "Sit there.",
    "Locked. Don't even try.",
    "That token's decorative now.",
  ],
  I_ESCAPED: [
    "You really thought that would work?",
    "Nice try. Not even close.",
    "Try again.",
  ],
  YOU_STALLED: [
    "You've got nothing.",
    "Out of moves? Already?",
    "This is embarrassing.",
  ],
  NICE_TRY: [
    "I'll give you that one.",
    "Okay, that was actually decent.",
    "Don't get used to that.",
  ],
  GAME_OVER_WIN: [
    "Called it.",
    "Not even close.",
    "Same result next time.",
    "Come back when you've practiced.",
  ],
  GAME_OVER_LOSS: [
    "You got lucky.",
    "I wasn't playing my best.",
    "Run it back. Right now.",
    "That doesn't count.",
  ],
  REMATCH: [
    "Again. Right now.",
    "That was a warmup.",
    "Let's go.",
  ],
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
  OPENING_PLAY: [
    "Center control matters early.",
    "Your opening defines your options later.",
    "Consider what that opening position enables.",
  ],
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
  I_CAPTURED: [
    "That was the forcing line.",
    "Capture with a threat attached is stronger than a plain capture.",
    "I set that up two moves ago.",
  ],
  I_SIEGED: [
    "Four sides is a lock. Eight is a capture. Know the threshold.",
    "Siege rings don't complete in one move. Recognize the buildup.",
    "Your token is under siege. You have a window to break it.",
  ],
  I_LOCKED: [
    "Locked. Your reserve is your only rescue now.",
    "That's what 4-sided adjacency does. It's a resource drain.",
    "Can you break it before I complete the ring?",
  ],
  I_ESCAPED: [
    "You had the siege. You needed one more side covered.",
    "Good pressure. Wrong follow-up.",
    "Close — check why it failed before you try again.",
  ],
  YOU_STALLED: [
    "No usable routes means you're paying into the void. Plan to avoid that.",
    "Stalled positions come from reactive play. Start building ahead of your opponent.",
    "A route swap might solve this, but think about which route actually helps.",
  ],
  NICE_TRY: [
    "That was the right idea. The timing was off.",
    "Good concept. Work on the execution.",
    "You're starting to see the patterns.",
    "That's the right kind of thinking.",
  ],
  GAME_OVER_WIN: [
    "The game turned when you left that position open. Review it.",
    "You played well in the middle. The endgame needs work.",
    "Good game. You have a real foundation to build on.",
  ],
  GAME_OVER_LOSS: [
    "You found something I didn't expect. Study that sequence.",
    "Well played. You executed clean.",
    "You earned it. Good game.",
  ],
  REMATCH: [
    "Again. Apply what you just learned.",
    "Go again.",
    "Next game, focus on what went wrong.",
  ],
  SILENCE: [],
}

// ------------------------------------------------------------
// GRANDMASTER — nearly silent, a few words max, just wins
// ------------------------------------------------------------
const SENIOR_MASTER_CHAT = MASTER_CHAT

const GRANDMASTER_CHAT: ChatTable = {
  HELLO: [
    ".",
    "Play.",
    "Begin.",
    "Go.",
  ],
  OPENING_PLAY: [
    "Noted.",
    "Fine.",
  ],
  YOU_BLUNDERED: [
    "No.",
    "Wrong.",
  ],
  YOU_MISSED_TACTIC: [
    "There.",
  ],
  I_CAPTURED: [
    ".",
  ],
  I_SIEGED: [
    "Closing.",
  ],
  I_LOCKED: [
    "Done.",
  ],
  I_ESCAPED: [
    "No.",
  ],
  YOU_STALLED: [
    "Nowhere.",
  ],
  NICE_TRY: [
    "No.",
    "Not yet.",
  ],
  GAME_OVER_WIN: [
    "Expected.",
    "Again if you want.",
    "There it is.",
  ],
  GAME_OVER_LOSS: [
    "Good.",
    "You earned it.",
    "Go again.",
  ],
  REMATCH: [
    "Again.",
    "Go.",
  ],
  SILENCE: [],
}
