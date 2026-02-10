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

export type AiLevel = "beginner" | "intermediate"

export function aiStep(state: GameState, aiPlayer: Player, level: AiLevel) {
  if (level === "intermediate") return aiStepIntermediate(state, aiPlayer)
  return aiStepBeginner(state, aiPlayer)
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

  // Siege lock: a token surrounded by 4–7 adjacent enemy tokens cannot move.
  const enemy = other(p)
  const lockSides = siegeSidesFor(state, enemy, token.pos.x, token.pos.y)
  if (lockSides >= 4 && lockSides < 8) return false

  const route = state.routes[p].find((r) => r.id === routeId)
  if (!route) return false

  const from = token.pos
  const steps = traceByRoute(from, route)
  if (steps.length === 0) return false

  // Must leave origin at some point
  const leftOrigin = steps.some((c) => !samePos(c, from))
  if (!leftOrigin) return false

  const to = steps[steps.length - 1]
  const occ = tokenAt(state, to.x, to.y)

  // Friendly occupied only illegal if it's another friendly token
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

function canEnemyInvadeSquareNextTurn(state: GameState, enemy: Player, target: Coord): boolean {
  // If enemy isn't in ACTION next, they can't invade via routes anyway.
  // But this is "next turn" assumption; we only care about route moves.
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === enemy)

  // Enemy will have all routes unused at start of their turn.
  const enemyRoutes = state.routes[enemy]

  for (const r of enemyRoutes) {
    for (const t of enemyTokens) {
      // If token can use route, compute destination and see if it matches target.
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

  // Prefer squares the enemy cannot invade at all.
  const safe = empties.filter((c) => !canEnemyInvadeSquareNextTurn(state, enemy, c))
  if (safe.length > 0) {
    // If many safe squares, just pick one randomly so it doesn't look robotic
    return safe[randomInt(safe.length)]
  }

  // If nowhere is safe, pick a square that minimizes the number of enemy invades onto it.
  // (Simple scoring: count how many (token,route) land there.)
  let best = empties[0]
  let bestThreat = Infinity

  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === enemy)
  const enemyRoutes = state.routes[enemy]

  for (const c of empties) {
    let threat = 0
    for (const r of enemyRoutes) {
      for (const t of enemyTokens) {
        if (!canTokenUseRoute(state, enemy, t, r.id)) continue
        const steps = traceByRoute(t.pos, r)
        if (steps.length === 0) continue
        const to = steps[steps.length - 1]
        if (to.x === c.x && to.y === c.y) threat += 1
      }
    }
    if (threat < bestThreat) {
      bestThreat = threat
      best = c
    }
  }

  return best
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
// Performs ONE atomic AI action for the current player (assumes it's AI's turn).
export function aiStepBeginner(state: GameState, aiPlayer: Player) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  // OPENING: place one token on a random empty square
  if (state.phase === "OPENING") {
    const empties = allEmptySquares(state)
    if (empties.length === 0) return
    placeOpeningToken(state, empties[randomInt(empties.length)])
    return
  }

  // ACTION: pick one unused route + one token that can use it
  if (state.phase === "ACTION") {
    const unused = state.routes[aiPlayer].filter((r) => !state.usedRoutes.includes(r.id))
    if (unused.length === 0) return

    const tokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === aiPlayer)

    // randomize route order
    const routeOrder = [...unused].sort(() => Math.random() - 0.5)

    for (const r of routeOrder) {
      const legalTokens = tokens.filter((t) => canTokenUseRoute(state, aiPlayer, t, r.id))
      if (legalTokens.length === 0) continue

      const chosen = legalTokens[randomInt(legalTokens.length)]
      applyRouteMove(state, chosen.id, r.id)
      return
    }

    // Rare: none of the remaining routes are usable by any token
    state.warning = "AI: no usable routes remaining (forced yield not implemented for AI yet)."
    return
  }

  // REINFORCE: place a token randomly on any empty square
  if (state.phase === "REINFORCE") {
    const empties = allEmptySquares(state)
    if (empties.length === 0) {
      state.warning = "AI: no empty squares to reinforce."
      return
    }
    placeReinforcement(state, empties[randomInt(empties.length)])
    return
  }

  // SWAP: select hand route + queue index then confirm
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
// Intermediate AI (1-ply greedy + tactical heuristics)
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

  // Terminal
  if (state.gameOver) {
    return state.gameOver.winner === me ? 1_000_000 : -1_000_000
  }

  let score = 0

  // Material / presence
  score += 10 * myOnBoard
  score -= 10 * theirOnBoard

  score += 2 * myRes
  score -= 2 * theirRes

  score += 1.5 * myCap
  score -= 1.5 * theirCap

  score += 0.5 * myVoid
  score -= 0.5 * theirVoid

  // Draft incentive: if I can cash in 3 invades and I have void to recover from, push for it
  const myInv = state.turnInvades?.[me] ?? 0
  if (myInv >= 3 && myVoid > 0) score += 25

  // Siege pressure / danger (new siege rules: 4–7 locks; 8 captures)
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them)
  const myTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === me)

  for (const e of enemyTokens) {
    const sides = siegeSidesFor(state, me, e.pos.x, e.pos.y)
    if (sides === 3) score += 6 // one away from locking
    else if (sides >= 4 && sides <= 6) score += 14 // locked is good, but not a kill
    else if (sides === 7) score += 24 // one away from full siege capture
    else if (sides === 8) score += 60 // should be captured immediately by rules
  }

  for (const m of myTokens) {
    const sides = siegeSidesFor(state, them, m.pos.x, m.pos.y)
    if (sides === 3) score -= 7
    else if (sides >= 4 && sides <= 6) score -= 16
    else if (sides === 7) score -= 28
    else if (sides === 8) score -= 70
  }

  // Mobility / tempo (action phase only)
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

  // Prefer center-ish squares to maximize adjacency options
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

function shouldBuyExtraReinforcement(state: GameState, me: Player): boolean {
  if (state.phase !== "ACTION") return false
  if (state.gameOver) return false
  if ((state as any).extraReinforcementBoughtThisTurn) return false

  // Must exist in your GameState as reserves; cost is enforced by engine anyway.
  // Heuristic: don’t bankrupt; buy when it likely creates immediate Segura capture pressure.
  const cost = (state as any).EXTRA_REINFORCEMENT_COST ?? 4 // UI imports cost anyway; engine enforces.
  if (state.reserves[me] < 4) return false
  if (state.reserves[me] - 4 < 6) return false // keep at least 6 in reserve after purchase

  // If there exists a reinforcement placement that would create a 4th siege side on an enemy (locks them) => huge.
  const them = other(me)
  const enemyTokens = state.tokens.filter((t) => t.in === "BOARD" && t.owner === them)
  const empties = allEmptySquares(state)

  for (const e of enemyTokens) {
    const sidesNow = siegeSidesFor(state, me, e.pos.x, e.pos.y)
    if (sidesNow !== 3) continue

    // Is there an empty adjacent square I could place into to make it 4?
    for (const d of ADJ8) {
      const nx = e.pos.x + d.dx
      const ny = e.pos.y + d.dy
      if (!inBounds(nx, ny)) continue
      if (tokenAt(state, nx, ny)) continue
      // Yes — buying extra reinf could be immediate capture during reinforcement phase.
      return true
    }
  }

  // Otherwise: only buy if behind on board presence.
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
    if (sc > bestScore) {
      bestScore = sc
      best = c
    }
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
      if (sc > bestScore) {
        bestScore = sc
        best = { handId: h.id, qIdx }
      }
    }
  }

  return best
}

function bestEarlySwapPlan(state: GameState, me: Player): { handId: string; qIdx: number } | null {
  // Only consider early swap when it’s legal to arm and we still have unused routes.
  if (state.phase !== "ACTION") return null
  if (state.gameOver) return null
  if (state.earlySwapUsedThisTurn) return null

  const remainingMoves = countUsableMoves(state, me)
  // If we have plenty of options, early swap is less urgent.
  const urgency = remainingMoves <= 1

  if (!urgency && state.captives[me] < 4) return null // if not urgent, don’t burn captives

  // Evaluate candidate early swaps by simulating: arm -> set pending -> confirm
  const unusedHand = state.routes[me].filter((r) => !state.usedRoutes.includes(r.id))
  if (unusedHand.length === 0) return null

  let best: { handId: string; qIdx: number } | null = null
  let bestScore = -Infinity

  for (const h of unusedHand) {
    for (let qIdx = 0; qIdx < state.queue.length; qIdx++) {
      const sc = simulateAndScore(state, me, (s) => {
        armEarlySwap(s)
        // if arming failed, score will just reflect unchanged state
        chooseSwapHandRoute(s, h.id)
        chooseSwapQueueIndex(s, qIdx)
        confirmEarlySwap(s)
        // Note: confirmEarlySwap does NOT end turn, so it’s pure tempo.
      })
      if (sc > bestScore) {
        bestScore = sc
        best = { handId: h.id, qIdx }
      }
    }
  }

  // Require a meaningful improvement vs no-swap baseline
  const baseline = evalState(state, me)
  if (best && bestScore >= baseline + 8) return best

  return null
}

// Performs ONE atomic AI action for the current player (intermediate).
export function aiStepIntermediate(state: GameState, aiPlayer: Player) {
  if (state.gameOver) return
  if (state.player !== aiPlayer) return

  // OPENING: random (same as beginner)
  if (state.phase === "OPENING") {
    const empties = allEmptySquares(state)
    if (empties.length === 0) return
    placeOpeningToken(state, empties[randomInt(empties.length)])
    return
  }

  // REINFORCE: place where opponent cannot (or least likely to) invade next turn
  if (state.phase === "REINFORCE") {
    const c = safestReinforcementSquare(state, aiPlayer)
    if (!c) {
      state.warning = "AI: no empty squares to reinforce."
      return
    }
    placeReinforcement(state, c)
    return
  }

  // SWAP: choose best swap (simulate full confirm)
  if (state.phase === "SWAP") {
    const plan = bestSwapChoice(state, aiPlayer)
    if (!plan) return

    // Keep “atomic” behavior like your current AI: pick hand, then queue, then confirm.
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

  // ACTION:
  if (state.phase === "ACTION") {
    // 1) If early swap is already armed, finish it in staged steps.
    if (state.earlySwapArmed) {
      const plan = bestEarlySwapPlan(state, aiPlayer) ?? null

      // If no plan found, disarm (don’t sit forever)
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

    // 2) Decide whether to arm early swap (tempo rescue / upgrade)
    const earlyPlan = bestEarlySwapPlan(state, aiPlayer)
    if (earlyPlan) {
      armEarlySwap(state)
      // Next aiStep tick will pick hand/queue then confirm.
      return
    }

    // 3) Decide whether to buy extra reinforcement (resource spend)
    if (shouldBuyExtraReinforcement(state, aiPlayer)) {
      buyExtraReinforcement(state)
      return
    }

    // 4) Choose best route move by simulation
    const mv = bestActionMove(state, aiPlayer)
    if (mv) {
      applyRouteMove(state, mv.tokenId, mv.routeId)
      return
    }

    // 5) If nothing is usable, do the forced yield action (your engine has it)
    yieldForcedIfNoUsableRoutes(state)
    return
  }
}

// ------------------------------------------------------------
// AI CHAT (BEGINNER + INTERMEDIATE) — NO GAME LOGIC CHANGES
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
  // Optional knobs (you can pass nothing)
  turn?: number
  streak?: number // e.g. repeated mistake count
  player?: Player // human player
  ai?: Player
}

// Pick a chat line for a given AI + event.
// Returns null when the AI chooses not to speak.
export function aiChatPickLine(level: AiLevel, ev: AiChatEvent, ctx?: AiChatContext): string | null {
  // Beginner talks more, but always supportive.
  // Intermediate talks less, but is smug and corrective.
  if (level === "beginner") return pickFromTable(BEGINNER_CHAT, ev, ctx)
  return pickFromTable(INTERMEDIATE_CHAT, ev, ctx)
}

// Simple weighted chance gate so chat doesn't spam.
// You can tune these later without touching UI.
function shouldSpeak(level: AiLevel, ev: AiChatEvent, ctx?: AiChatContext): boolean {
  // Hard off events
  if (ev === "SILENCE") return false

  // Beginner: higher rate
  if (level === "beginner") {
    if (ev === "HELLO") return Math.random() < 0.85
    if (ev === "OPENING_PLAY") return Math.random() < 0.35
    if (ev === "NICE_TRY") return Math.random() < 0.25
    if (ev.startsWith("GAME_OVER")) return Math.random() < 0.95
    return Math.random() < 0.18
  }

  // Intermediate: lower rate, more pointed
  if (ev === "HELLO") return Math.random() < 0.55
  if (ev === "OPENING_PLAY") return Math.random() < 0.18
  if (ev === "YOU_BLUNDERED") return Math.random() < 0.75
  if (ev === "YOU_MISSED_TACTIC") return Math.random() < 0.55
  if (ev === "I_CAPTURED" || ev === "I_SIEGED" || ev === "I_LOCKED") return Math.random() < 0.35
  if (ev.startsWith("GAME_OVER")) return Math.random() < 0.65
  return Math.random() < 0.12
}

type ChatTable = Record<AiChatEvent, string[]>

function pickFromTable(table: ChatTable, ev: AiChatEvent, ctx?: AiChatContext): string | null {
  if (!shouldSpeak((table === BEGINNER_CHAT ? "beginner" : "intermediate") as AiLevel, ev, ctx)) return null
  const lines = table[ev]
  if (!lines || lines.length === 0) return null
  return lines[randomInt(lines.length)]
}

// BEGINNER (white belt): encouraging, short, never insults.
const BEGINNER_CHAT: ChatTable = {
  HELLO: [
    "Alright — let’s learn this.",
    "You’ve got this. One move at a time.",
    "No pressure. We’re just playing.",
    "Let’s see what happens.",
  ],
  OPENING_PLAY: [
    "Center is usually a good start.",
    "Try to keep options open.",
    "Nice. Now look for your next route.",
  ],
  YOU_BLUNDERED: [
    "That one hurt — but you’ll spot it next time.",
    "Careful. That leaves something open.",
    "Close — you can recover from this.",
  ],
  YOU_MISSED_TACTIC: [
    "There was a tactic there. You’ll see it soon.",
    "Keep an eye on captures and sieges.",
    "Look for what changes after your move.",
  ],
  I_CAPTURED: [
    "Got one.",
    "Capture there was available.",
    "That’s a swing — watch those lanes.",
  ],
  I_SIEGED: [
    "Siege pressure is building.",
    "That’s a lock threat.",
    "Keep an eye on the ring around your tokens.",
  ],
  I_LOCKED: [
    "That token is locked now.",
    "Locked — but not dead. Yet.",
    "That’s what 4 sides does.",
  ],
  I_ESCAPED: [
    "Nice try — I slipped out.",
    "Good pressure. I had to move.",
    "That was close.",
  ],
  YOU_STALLED: [
    "If you’re stuck, look for a swap or a new angle.",
    "Sometimes the best move is repositioning.",
    "Try a different route line.",
  ],
  NICE_TRY: [
    "Good idea.",
    "That was close.",
    "You’re learning fast.",
  ],
  GAME_OVER_WIN: [
    "Good game. You earned that.",
    "Nice win.",
    "Okay — you’re getting it.",
  ],
  GAME_OVER_LOSS: [
    "Good game. Want to run it back?",
    "No worries. That was progress.",
    "We can replay and see where it turned.",
  ],
  REMATCH: [
    "Again.",
    "Run it back.",
    "Let’s go.",
  ],
  SILENCE: [],
}

// INTERMEDIATE (blue belt): smug, sharp, but never attacks the player’s identity.
const INTERMEDIATE_CHAT: ChatTable = {
  HELLO: [
    "Alright. Let’s see what you’ve got.",
    "Don’t blink.",
    "Play clean.",
  ],
  OPENING_PLAY: [
    "Fine.",
    "That’s a start.",
    "We’ll see.",
  ],
  YOU_BLUNDERED: [
    "You left that open.",
    "That was free.",
    "You can’t do that.",
    "I’ll take that every time.",
  ],
  YOU_MISSED_TACTIC: [
    "You didn’t see it.",
    "There was a punish there.",
    "You’re reacting, not reading.",
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
    "Now it can’t run.",
    "That’s what happens.",
  ],
  I_ESCAPED: [
    "Not today.",
    "Good idea. Wrong timing.",
    "Close. But no.",
  ],
  YOU_STALLED: [
    "You’re out of ideas.",
    "Swap, or drown.",
    "Find a line.",
  ],
  NICE_TRY: [
    "Better.",
    "Almost.",
    "You’re learning. Don’t get cocky.",
  ],
  GAME_OVER_WIN: [
    "That’s the difference.",
    "You’ll see it on replay.",
    "Again when you’re ready.",
  ],
  GAME_OVER_LOSS: [
    "Okay. That was decent.",
    "You can improve from this one.",
    "Replay it. You’ll find the turn.",
  ],
  REMATCH: [
    "Again.",
    "Same rules. Same outcome.",
    "Go.",
  ],
  SILENCE: [],
}
