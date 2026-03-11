// scripts/ai_single_game.ts
// Runs ONE headless AI vs AI game and returns/prints a single result.
// Usage:
//   npx tsx scripts/ai_single_game.ts novice adept 600
//
// Args: <levelW> <levelB> <maxTurns>

import { newGame, type GameState, type Player } from "../src/engine/state"
import { passMulligan, advanceFromAction } from "../src/engine/game"
import {
  aiStepNovice,
  aiStepAdept,
  aiStepExpert,
  aiStepMaster,
  aiStepSeniorMaster,
  aiStepGrandmaster,
  type AiLevel,
} from "../src/engine/ai"

const STEP_MAP: Record<AiLevel, (s: GameState, p: Player) => void> = {
  novice: aiStepNovice,
  adept: aiStepAdept,
  expert: aiStepExpert,
  master: aiStepMaster,
  senior_master: aiStepSeniorMaster,
  grandmaster: aiStepGrandmaster,
}

function getTurnCount(state: GameState): number {
  const t = (state as any).turn
  return typeof t === "number" ? t : 0
}

function getWinner(state: GameState): Player | null {
  const go = (state as any).gameOver
  if (!go) return null
  const w = go.winner
  return w === "W" || w === "B" ? w : null
}

export function runSingleGame(levelW: AiLevel, levelB: AiLevel, maxTurns = 600) {
  const s: GameState = newGame()

  let safetySteps = 0
  const maxSafetySteps = 200000

  while (!(s as any).gameOver) {
    if (safetySteps++ >= maxSafetySteps) break

    const turns = getTurnCount(s)
    if (turns >= maxTurns) break

    if ((s as any).phase === "MULLIGAN") {
      const ready = (s as any).mulliganReady ?? { W: false, B: false }

      if (!ready.W) {
        passMulligan(s, "W")
        continue
      }
      if (!ready.B) {
        passMulligan(s, "B")
        continue
      }

      continue
    }

    // Headless equivalent of ui_controller's AI turn-advance behavior:
    // once all routes are used, explicitly advance out of ACTION.
    if (
      (s as any).phase === "ACTION" &&
      Array.isArray((s as any).routes?.[(s as any).player]) &&
      Array.isArray((s as any).usedRoutes) &&
      (s as any).routes[(s as any).player].length > 0 &&
      (s as any).usedRoutes.length >= (s as any).routes[(s as any).player].length
    ) {
      advanceFromAction(s)
      continue
    }

    const p: Player = (s as any).player
    const lvl = p === "W" ? levelW : levelB
    STEP_MAP[lvl](s, p)
  }

  return {
    winner: getWinner(s),
    turns: getTurnCount(s),
    phase: (s as any).phase,
    player: (s as any).player,
    openingPlaced: (s as any).openingPlaced,
    mulliganReady: (s as any).mulliganReady,
    logTop: Array.isArray((s as any).log) ? (s as any).log[0] ?? null : null,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const levelW = process.argv[2] as AiLevel
  const levelB = process.argv[3] as AiLevel
  const maxTurns = Number(process.argv[4] ?? 600)

  const result = runSingleGame(levelW, levelB, maxTurns)
  process.stdout.write(JSON.stringify(result) + "\n")
}