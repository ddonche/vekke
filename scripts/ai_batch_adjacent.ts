// scripts/ai_batch_adjacent_spawn.ts
// Robust batch runner that CANNOT hang: each game runs in its own process with a hard timeout.
//
// Run:
//   npx tsx scripts/ai_batch_adjacent_spawn.ts
//
// Optional:
//   GAMES=100 MAX_TURNS=600 MAX_GAME_MS=8000 npx tsx scripts/ai_batch_adjacent_spawn.ts

import { spawn } from "node:child_process"

type AiLevel = "novice" | "adept" | "expert" | "master" | "senior_master" | "grandmaster"

const AI_RATING: Record<AiLevel, number> = {
  novice: 600,
  adept: 900,
  expert: 1200,
  master: 1500,
  senior_master: 1750,
  grandmaster: 2000,
}

const AI_NAME: Record<AiLevel, string> = {
  novice: "Glen",
  adept: "Priya",
  expert: "Vladimir",
  master: "Yui",
  senior_master: "Haoran",
  grandmaster: "Chioma",
}

const LEVELS: AiLevel[] = ["novice", "adept", "expert", "master", "senior_master", "grandmaster"]

function pct(n: number, d: number): string {
  if (d <= 0) return "0.0%"
  return `${((n / d) * 100).toFixed(1)}%`
}

type OneGameResult = { winner: "W" | "B" | null; turns: number }

function runOneGame(levelW: AiLevel, levelB: AiLevel, maxTurns: number, maxGameMs: number): Promise<OneGameResult | "killed"> {
  return new Promise((resolve) => {
    // Use shell:true so Windows runs npx correctly.
    const child = spawn(
      "npx",
      ["tsx", "scripts/ai_single_game.ts", levelW, levelB, String(maxTurns)],
      { stdio: ["ignore", "pipe", "pipe"], shell: true }
    )

    let stdout = ""
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")))

    const killTimer = setTimeout(() => {
      // On Windows, signals are limited; kill() is still fine.
      child.kill()
      resolve("killed")
    }, maxGameMs)

    child.on("exit", () => {
      clearTimeout(killTimer)
      const line = stdout.trim().split("\n").pop() ?? ""
      try {
        resolve(JSON.parse(line) as OneGameResult)
      } catch {
        resolve("killed")
      }
    })
  })
}

async function runPairing(level1: AiLevel, level2: AiLevel, games: number, maxTurns: number, maxGameMs: number) {
  const label = `${AI_NAME[level1]} (${AI_RATING[level1]}) vs ${AI_NAME[level2]} (${AI_RATING[level2]})`
  console.log(`\n=== ${label} ===`)

  let wins1 = 0
  let wins2 = 0
  let timeouts = 0
  let killed = 0
  let totalTurns = 0

  for (let i = 0; i < games; i++) {
    if ((i + 1) % 10 === 0) console.log(`...progress: ${i + 1}/${games}`)

    const level1IsWhite = Math.random() < 0.5
    const levelW = level1IsWhite ? level1 : level2
    const levelB = level1IsWhite ? level2 : level1

    const r = await runOneGame(levelW, levelB, maxTurns, maxGameMs)

    if (r === "killed") {
      killed++
      continue
    }

    totalTurns += r.turns

    if (r.winner == null) {
      timeouts++
      continue
    }

    // winner is W or B; map to which level that was this game
    if (r.winner === "W") {
      if (levelW === level1) wins1++
      else wins2++
    } else {
      if (levelB === level1) wins1++
      else wins2++
    }
  }

  const finished = games - killed
  const avgTurns = finished > 0 ? totalTurns / finished : 0

  console.log(
    `${label}  |  ` +
      `${AI_NAME[level1]} wins: ${wins1}/${games} (${pct(wins1, games)})  ` +
      `${AI_NAME[level2]} wins: ${wins2}/${games} (${pct(wins2, games)})  ` +
      `turn-timeouts: ${timeouts}/${games} (${pct(timeouts, games)})  ` +
      `killed: ${killed}/${games} (${pct(killed, games)})  ` +
      `avg turns (finished): ${avgTurns.toFixed(1)}`
  )
}

async function main() {
  const games = Number(process.env.GAMES ?? 100)
  const maxTurns = Number(process.env.MAX_TURNS ?? 600)

  // This is the important one. If a single game takes longer than this, we kill it and continue.
  const maxGameMs = Number(process.env.MAX_GAME_MS ?? 8000)

  console.log(`AI vs AI batch (spawned): ${games} games per adjacent pairing`)
  console.log(`MAX_TURNS=${maxTurns}  MAX_GAME_MS=${maxGameMs}`)

  for (let i = 0; i < LEVELS.length - 1; i++) {
    await runPairing(LEVELS[i], LEVELS[i + 1], games, maxTurns, maxGameMs)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})