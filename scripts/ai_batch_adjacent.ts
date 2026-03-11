// scripts/ai_batch_adjacent.ts
// Fast in-process batch runner for adjacent AI tiers.
//
// Run:
//   npx tsx scripts/ai_batch_adjacent.ts
//
// Optional:
//   GAMES=100 MAX_TURNS=600 npx tsx scripts/ai_batch_adjacent.ts

import { runSingleGame } from "./ai_single_game"
import type { AiLevel } from "../src/engine/ai"

type BatchAiLevel = Exclude<AiLevel, "rookie">

const AI_RATING: Record<BatchAiLevel, number> = {
  novice: 600,
  adept: 900,
  expert: 1200,
  master: 1500,
  senior_master: 1750,
  grandmaster: 2000,
}

const AI_NAME: Record<BatchAiLevel, string> = {
  novice: "Glen",
  adept: "Priya",
  expert: "Vladimir",
  master: "Yui",
  senior_master: "Haoran",
  grandmaster: "Chioma",
}

const LEVELS: BatchAiLevel[] = [
  "novice",
  "adept",
  "expert",
  "master",
  "senior_master",
  "grandmaster",
]

function pct(n: number, d: number): string {
  if (d <= 0) return "0.0%"
  return `${((n / d) * 100).toFixed(1)}%`
}

async function runPairing(
  level1: BatchAiLevel,
  level2: BatchAiLevel,
  games: number,
  maxTurns: number
) {
  const label = `${AI_NAME[level1]} (${AI_RATING[level1]}) vs ${AI_NAME[level2]} (${AI_RATING[level2]})`
  console.log(`\n=== ${label} ===`)

  let wins1 = 0
  let wins2 = 0
  let timeouts = 0
  let totalTurns = 0

  for (let i = 0; i < games; i++) {
    if ((i + 1) % 10 === 0) console.log(`...progress: ${i + 1}/${games}`)

    const level1IsWhite = Math.random() < 0.5
    const levelW: BatchAiLevel = level1IsWhite ? level1 : level2
    const levelB: BatchAiLevel = level1IsWhite ? level2 : level1

    const r = runSingleGame(levelW, levelB, maxTurns)

    if (i === 0) {
      console.log("DEBUG first game:", r)
    }

    totalTurns += r.turns

    if (r.winner == null) {
      timeouts++
      continue
    }

    if (r.winner === "W") {
      if (levelW === level1) wins1++
      else wins2++
    } else {
      if (levelB === level1) wins1++
      else wins2++
    }
  }

  const finished = games - timeouts
  const avgTurns = finished > 0 ? totalTurns / finished : 0

  console.log(
    `${label}  |  ` +
      `${AI_NAME[level1]} wins: ${wins1}/${games} (${pct(wins1, games)})  ` +
      `${AI_NAME[level2]} wins: ${wins2}/${games} (${pct(wins2, games)})  ` +
      `turn-timeouts: ${timeouts}/${games} (${pct(timeouts, games)})  ` +
      `avg turns: ${avgTurns.toFixed(1)}`
  )
}

async function main() {
  const games = Number(process.env.GAMES ?? 100)
  const maxTurns = Number(process.env.MAX_TURNS ?? 600)

  console.log(`AI vs AI batch: ${games} games per adjacent pairing`)
  console.log(`MAX_TURNS=${maxTurns}`)

  for (let i = 0; i < LEVELS.length - 1; i++) {
    await runPairing(LEVELS[i], LEVELS[i + 1], games, maxTurns)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})