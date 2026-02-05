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
} from "./game"

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

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
// Performs ONE atomic AI action for the current player (assumes it's AI's turn).
export function aiStep(state: GameState, aiPlayer: Player) {
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
