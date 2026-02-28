// scripts/ai_single_game.ts
// Runs ONE headless AI vs AI game and prints a single JSON line to stdout.
// Usage:
//   npx tsx scripts/ai_single_game.ts novice adept 600
//
// Args: <levelW> <levelB> <maxTurns>

import { newGame, type GameState, type Player } from "../src/engine/state"
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

function main() {
  const levelW = process.argv[2] as AiLevel
  const levelB = process.argv[3] as AiLevel
  const maxTurns = Number(process.argv[4] ?? 600)

  const s: GameState = newGame()

  while (!(s as any).gameOver) {
    const turns = getTurnCount(s)
    if (turns >= maxTurns) break

    const p: Player = (s as any).player
    const lvl = p === "W" ? levelW : levelB
    STEP_MAP[lvl](s, p)
  }

  const out = {
    winner: getWinner(s),     // "W" | "B" | null (null = maxTurns timeout)
    turns: getTurnCount(s),
  }

  // One JSON line only.
  process.stdout.write(JSON.stringify(out) + "\n")
}

main()