import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Howler } from "howler"
import { getCurrentUserId } from "../services/auth"
import { reportVsAiEloAndStats } from "../services/player_stats"
import { getAccountTier, saveGameLog } from "../services/game_logs"
import type { Coord } from "./coords"
import { newGame, type GameState, type Player, type Token } from "./state"
import { VgnRecorder } from "./vgn"
import {
  aiStepNovice,
  aiStepAdept,
  aiStepExpert,
  aiStepMaster,
  aiStepSeniorMaster,
  aiStepGrandmaster,
  type AiLevel,
} from "./ai"
import {
  applyRouteMove,
  chooseSwapHandRoute,
  chooseSwapQueueIndex,
  confirmSwapAndEndTurn,
  placeOpeningToken,
  placeReinforcement,
  yieldForcedIfNoUsableRoutes,
  armEarlySwap,
  confirmEarlySwap,
  cancelEarlySwap,
  EARLY_SWAP_COST,
  buyExtraReinforcement,
  EXTRA_REINFORCEMENT_COST,
  isTokenLockedBySiege,
  useRansom,
  RANSOM_COST_CAPTIVES,
  armEvasion,
  cancelEvasion,
  selectEvasionToken,
  selectEvasionDestination,
  confirmEvasion,
  EVASION_COST_CAPTIVES,
  EVASION_COST_RESERVES,
} from "./game"

type SoundHandle = { stop: () => void; play: () => number; load?: () => void }
type Sounds = {
  move: SoundHandle
  capture: SoundHandle
  place: SoundHandle
  swap: SoundHandle
  click: SoundHandle
  invalid: SoundHandle
  gameOver: SoundHandle
  siegeLock: SoundHandle
  siegeBreak: SoundHandle
}

export type TimeControlId = "standard" | "rapid" | "blitz" | "daily"
export type TimeControl = { id: TimeControlId; label: string; baseMs: number; incMs: number }

const TIME_CONTROLS: Record<TimeControlId, TimeControl> = {
  standard: { id: "standard", label: "Standard (10+5)", baseMs: 10 * 60_000, incMs: 5_000 },
  rapid: { id: "rapid", label: "Rapid (5+3)", baseMs: 5 * 60_000, incMs: 3_000 },
  blitz: { id: "blitz", label: "Blitz (3+2)", baseMs: 3 * 60_000, incMs: 2_000 },
  daily: { id: "daily", label: "Daily (24h/move)", baseMs: 24 * 60 * 60_000, incMs: 0 },
}

// ------------------------------------------------------------
// AI fixed ratings (do NOT change over time)
// NOTE: Keys must match AiLevel exactly.
// ------------------------------------------------------------
export const AI_RATING: Record<AiLevel, number> = {
  novice: 600,
  adept: 900,
  expert: 1200,
  master: 1500,
  senior_master: 1750,
  grandmaster: 2000,
}

// Stable UUIDs to represent AI opponents in the games table.
// These do NOT need to correspond to auth.users (and are never updated in player_stats).
const AI_UUID: Record<AiLevel, string> = {
  novice: "00000000-0000-4000-8000-000000000600",
  adept: "00000000-0000-4000-8000-000000000900",
  expert: "00000000-0000-4000-8000-000000001200",
  master: "00000000-0000-4000-8000-000000001500",
  senior_master: "00000000-0000-4000-8000-000000001750",
  grandmaster: "00000000-0000-4000-8000-000000002000",
}

type Clocks = { W: number; B: number }

const other = (p: Player): Player => (p === "W" ? "B" : "W")

export function useVekkeController(opts: { sounds: Sounds; aiDelayMs?: number }) {
  const sounds = opts.sounds
  const AI_DELAY_MS = opts.aiDelayMs ?? 1200

  // ------------------------------------------------------------
  // Core game state
  // ------------------------------------------------------------
  const [g, setG] = useState<GameState>(() => newGame())
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)

  // IMPORTANT: human MUST reset each new game (you asked for this).
  const [human, setHuman] = useState<Player>(() => (Math.random() < 0.5 ? "W" : "B"))
  const ai: Player = human === "W" ? "B" : "W"

  const [aiDifficulty, setAiDifficulty] = useState<AiLevel>("novice")

  const [started, setStarted] = useState(false)
  const [audioReady, setAudioReady] = useState(false)

  // NEW: time controls + clocks
  const [timeControlId, setTimeControlId] = useState<TimeControlId>("standard")
  const timeControl = TIME_CONTROLS[timeControlId]
  const [clocks, setClocks] = useState<Clocks>(() => ({ W: timeControl.baseMs, B: timeControl.baseMs }))

  // ------------------------------------------------------------
  // Online reporting / Elo wiring
  // (Add-only: does not affect gameplay logic)
  // ------------------------------------------------------------
  const [vsAi, setVsAi] = useState<boolean>(true) // PvP not wired yet
  const [isRanked, setIsRanked] = useState<boolean>(true) // Elo always for now
  const [gameId, setGameId] = useState<string | null>(null)
  const reportedResultRef = useRef<string | null>(null)

  const setWarning = useCallback((msg: string) => {
    setG((prev) => {
      const next = structuredClone(prev)
      next.warning = msg
      return next
    })
  }, [])

  // NOTE: We are NOT persisting games yet.
  // We only update player_stats when a game ends.
  // Keep this helper as a safe no-op so the rest of the controller can call it.
  const creatingGameRowRef = useRef(false)
  const ensureGameRow = useCallback(
    async (_state: GameState, _tc: TimeControlId) => {
      if (creatingGameRowRef.current) return
      creatingGameRowRef.current = true
      try {
        const userId = await getCurrentUserId()
        if (!userId) {
          // Loud, visible failure: you must be logged in to record elo.
          setWarning("Not logged in. Sign in to record elo.")
          return
        }

        // Intentionally do NOT create a games row yet.
        setGameId(null)
      } catch (e) {
        console.error("SUPABASE: auth check failed:", e)
      } finally {
        creatingGameRowRef.current = false
      }
    },
    [setWarning]
  )

  const prevRef = useRef<GameState | null>(null)
  const playedGameOverSound = useRef(false)
  const evasionAutoSelectedRef = useRef(false)

  // ------------------------------------------------------------
  // VGN recording (pure state-transition ledger)
  // ------------------------------------------------------------
  const vgnRef = useRef<VgnRecorder | null>(null)
  const vgnGameIdRef = useRef<string | null>(null)
  const vgnStartPerfRef = useRef<number>(0)
  const vgnEndedKeyRef = useRef<string | null>(null)
  const savedVgnRef = useRef<string | null>(null)
  const lastPlayedRouteRef = useRef<{ by: Player; routeId: string } | null>(null)

  // Timer refs
  const lastTickAtRef = useRef<number>(0)
  const prevTurnPlayerRef = useRef<Player | null>(null)

  const playSound = useCallback((h: SoundHandle) => {
    try {
      h.stop()
      h.play()
    } catch (e) {
      console.error("Sound play error:", e)
    }
  }, [])

  const unlockAudio = useCallback(async () => {
    try {
      Howler.mute(false)
      if (Howler.ctx?.state === "suspended") {
        await Howler.ctx.resume()
      }
      sounds.move.load?.()
      sounds.capture.load?.()
      sounds.place.load?.()
      sounds.swap.load?.()
      sounds.click.load?.()
      sounds.invalid.load?.()
      sounds.gameOver.load?.()
      sounds.siegeLock.load?.()
      sounds.siegeBreak.load?.()
      setAudioReady(true)
    } catch (e) {
      console.error("Audio unlock failed:", e)
    }
  }, [sounds])

  useEffect(() => {
    const unlock = async () => {
      await unlockAudio()
    }
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("keydown", unlock, { once: true })
    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
    }
  }, [unlockAudio])

  // If the UI starts a game without calling actions.newGame(), still create the games row.
  useEffect(() => {
    if (!started) return
    if (g.gameOver) return
    if (gameId) return
    void ensureGameRow(g, timeControlId)
  }, [started, g.gameOver, gameId, ensureGameRow, g, timeControlId])

  const boardMap = useMemo(() => {
    const m = new Map<string, Token>()
    for (const t of g.tokens) {
      if (t.in === "BOARD") m.set(`${t.pos.x},${t.pos.y}`, t)
    }
    return m
  }, [g.tokens])

  const remainingRoutes = g.phase === "ACTION" ? g.routes[g.player].filter((r) => !g.usedRoutes.includes(r.id)) : []

  const forcedYieldAvailable = useMemo(() => {
    if (!started) return false
    if (g.phase !== "ACTION") return false
    if (g.gameOver) return false
    if (remainingRoutes.length === 0) return false

    const test: GameState = structuredClone(g)
    const before0 = test.log[0]
    yieldForcedIfNoUsableRoutes(test)
    return (test as any).warning == null && test.log[0] !== before0
  }, [started, g, remainingRoutes.length])

  const earlySwapArmed = Boolean((g as any).earlySwapArmed)
  const earlySwapUsedThisTurn = Boolean((g as any).earlySwapUsedThisTurn)

  const canPickQueueForSwap = g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)

  const canEarlySwap =
    g.phase === "ACTION" &&
    !g.gameOver &&
    !earlySwapArmed &&
    !earlySwapUsedThisTurn &&
    remainingRoutes.length > 0 &&
    g.captives[g.player] >= EARLY_SWAP_COST

  const extraReinfBought = Boolean((g as any).extraReinforcementBoughtThisTurn)

  const canBuyExtraReinforcement =
    g.phase === "ACTION" && !g.gameOver && !extraReinfBought && g.reserves[g.player] >= EXTRA_REINFORCEMENT_COST

  const ransomUsed = Boolean((g as any).ransomUsedThisTurn)

  const canUseRansom =
    g.phase === "ACTION" &&
    !g.gameOver &&
    !ransomUsed &&
    g.captives[g.player] >= RANSOM_COST_CAPTIVES &&
    g.void[g.player] >= 1

  const evasionArmed = Boolean((g as any).evasionArmed)
  const evasionUsed = (g as any).evasionUsed as { W: boolean; B: boolean } | undefined
  const defender = other(g.player) // The player who is NOT currently moving
  const hasUsedEvasion = evasionUsed?.[defender] ?? false

  // Whose clock should be ticking?
  // During evasion interrupt, defender's clock ticks. Otherwise, current player's clock ticks.
  const clockPlayer = evasionArmed ? defender : g.player

  const canUseEvasion =
    g.phase === "ACTION" &&
    !g.gameOver &&
    !evasionArmed &&
    !hasUsedEvasion &&
    g.captives[defender] >= EVASION_COST_CAPTIVES &&
    g.reserves[defender] >= EVASION_COST_RESERVES

  // Evasion visualization data
  const pendingEvasion = (g as any).pendingEvasion as { tokenId: string | null; to: Coord | null } | undefined
  const evasionSourcePos = evasionArmed && selectedTokenId
    ? (() => {
        const token = g.tokens.find((t) => t.id === selectedTokenId)
        if (token?.in === "BOARD") return token.pos
        if (token?.in === "CAPTIVE" && g.lastMove?.tokenId === selectedTokenId) return g.lastMove.to
        return null
      })()
    : null

  const update = useCallback((mut: (s: GameState) => void) => {
    setG((prev) => {
      const next: GameState = structuredClone(prev)
      mut(next)
      return next
    })
  }, [])

  const warn = useCallback(
    (msg: string) => {
      update((s) => {
        ;(s as any).warning = msg
      })
    },
    [update]
  )

  // Play invalid sound whenever the game (or UI) sets an INVALID warning.
  const lastInvalidRef = useRef<string | null>(null)
  useEffect(() => {
    if (!audioReady) return
    const w: any = (g as any).warning
    if (!w || typeof w !== "string") {
      lastInvalidRef.current = null
      return
    }
    if (!w.toUpperCase().startsWith("INVALID")) return
    if (lastInvalidRef.current === w) return
    lastInvalidRef.current = w
    playSound(sounds.invalid)
  }, [(g as any).warning, audioReady, playSound, sounds.invalid])

  // ===== TIMER CORE =====

  useEffect(() => {
    if (started) return
    setClocks({ W: timeControl.baseMs, B: timeControl.baseMs })
  }, [timeControl.baseMs, started])

  useEffect(() => {
    if (!started) return
    if (g.gameOver) return

    lastTickAtRef.current = performance.now()

    const intervalMs = timeControlId === "daily" ? 1000 : 100

    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = now - lastTickAtRef.current
      lastTickAtRef.current = now

      setClocks((prev) => {
        const p = clockPlayer
        const nextVal = Math.max(0, prev[p] - dt)
        return { ...prev, [p]: nextVal }
      })
    }, intervalMs)

    return () => window.clearInterval(id)
  }, [started, g.player, g.gameOver, timeControlId, clockPlayer])

  useEffect(() => {
    if (!started) return
    if (g.gameOver) return

    const prevP = prevTurnPlayerRef.current
    const nextP = g.player

    if (prevP && prevP !== nextP) {
      setClocks((prev) => {
        const next = { ...prev }
        next[prevP] = next[prevP] + timeControl.incMs
        return next
      })
    }

    prevTurnPlayerRef.current = nextP
  }, [started, g.player, g.gameOver, timeControl.incMs])

  useEffect(() => {
    if (!started) return
    if (g.gameOver) return

    if (clocks.W <= 0) {
      update((s) => ((s as any).gameOver = { winner: "B", reason: "Timeout" } as any))
      warn("TIME: White ran out of time.")
      return
    }
    if (clocks.B <= 0) {
      update((s) => ((s as any).gameOver = { winner: "W", reason: "Timeout" } as any))
      warn("TIME: Blue ran out of time.")
      return
    }
  }, [started, g.gameOver, clocks.W, clocks.B, update, warn])

  // ===== END TIMER CORE =====

  const onSquareClick = useCallback(
    (x: number, y: number) => {
      if (!started) return
      if ((g as any).warning) update((s) => ((s as any).warning = "" as any))

      const coord: Coord = { x, y }

      if (g.phase === "OPENING") {
        update((s) => placeOpeningToken(s, coord))
        playSound(sounds.place)
        return
      }

      if (g.phase === "REINFORCE") {
        update((s) => placeReinforcement(s, coord))
        playSound(sounds.place)
        return
      }

      // Handle evasion clicks
      if (evasionArmed) {
        // --- EVASION: allow selecting the last-captured token by clicking its capture square ---
        if (g.lastMove) {
          const captured = g.tokens.find((t) => t.id === g.lastMove!.tokenId && t.in === "CAPTIVE")

          // Only when we haven't selected an evasion token yet
          if (captured && !pendingEvasion?.tokenId && x === g.lastMove.to.x && y === g.lastMove.to.y) {
            update((s) => selectEvasionToken(s, captured.id))
            setSelectedTokenId(captured.id) // so your UI highlights correctly
            playSound(sounds.click)
            return
          }
        }

        const t = boardMap.get(`${x},${y}`)
        if (t) {
          // Clicking on a token - select it for evasion
          update((s) => selectEvasionToken(s, t.id))
          setSelectedTokenId(t.id) // Update visual selection
          playSound(sounds.click)
        } else {
          // Clicking on empty square - select as destination
          update((s) => selectEvasionDestination(s, coord))
          playSound(sounds.click)
        }
        return
      }

      const t = boardMap.get(`${x},${y}`)
      if (t) {
        if (t.owner !== g.player && (g.phase === "ACTION" || g.phase === "SWAP")) {
          warn("INVALID: You can only select your own tokens.")
          return
        }
        if (selectedTokenId !== t.id) playSound(sounds.click)
        setSelectedTokenId(t.id)
      }
    },
    [started, g, update, playSound, sounds.place, sounds.click, boardMap, selectedTokenId, warn, evasionArmed, pendingEvasion]
  )

  useEffect(() => {
    // Auto-select for evasion - only on initial arm
    if (evasionArmed && !evasionAutoSelectedRef.current) {
      evasionAutoSelectedRef.current = true

      // If last move captured defender's token, select that captured token
      if (g.lastMove) {
        const capturedToken = g.tokens.find((t) => t.id === g.lastMove?.tokenId && t.owner === defender)
        if (capturedToken) {
          setSelectedTokenId(capturedToken.id)
          // Also set in game engine
          update((s) => selectEvasionToken(s, capturedToken.id))
          return
        }
      }

      // Otherwise, select random defender's board token
      const defenderTokens = g.tokens.filter((t) => t.in === "BOARD" && t.owner === defender)
      if (defenderTokens.length > 0) {
        setSelectedTokenId(defenderTokens[0].id)
        // Also set in game engine
        update((s) => selectEvasionToken(s, defenderTokens[0].id))
      }
      return
    }

    // Reset ref when evasion ends
    if (!evasionArmed) {
      evasionAutoSelectedRef.current = false
    }

    // Normal auto-selection for regular turns
    if (!evasionArmed) {
      const sel = selectedTokenId ? g.tokens.find((t) => t.in === "BOARD" && t.id === selectedTokenId) : null

      if (g.phase === "ACTION" || g.phase === "SWAP") {
        if (!sel || sel.owner !== g.player) {
          const firstFriendly = g.tokens.find((t) => t.in === "BOARD" && t.owner === g.player)
          setSelectedTokenId(firstFriendly ? firstFriendly.id : null)
        }
      }
    }
  }, [g.player, g.phase, g.tokens, evasionArmed, g.lastMove, defender, update, selectedTokenId])

  useEffect(() => {
    if (!started) return
    if (g.gameOver) return
    if (g.player !== ai) return
    if (evasionArmed) return // Don't let AI move during evasion interrupt

    const t = window.setTimeout(() => {
      update((s) => {
        const stepMap: Record<AiLevel, typeof aiStepNovice> = {
          novice: aiStepNovice,
          adept: aiStepAdept,
          expert: aiStepExpert,
          master: aiStepMaster,
          senior_master: aiStepSeniorMaster,
          grandmaster: aiStepGrandmaster,
        }
        const step = stepMap[aiDifficulty] ?? aiStepNovice
        step(s, ai)
      })
    }, AI_DELAY_MS)

    return () => window.clearTimeout(t)
  }, [
    started,
    g.player,
    g.phase,
    g.usedRoutes.length,
    g.pendingSwap.handRouteId,
    g.pendingSwap.queueIndex,
    g.reinforcementsToPlace,
    g.openingPlaced.B,
    g.openingPlaced.W,
    g.gameOver,
    g.log.length,
    ai,
    aiDifficulty,
    update,
    AI_DELAY_MS,
    evasionArmed,
  ])

  useEffect(() => {
    if (!started) return
    if (g.player !== ai) return
    if (!g.lastMove) return
    setSelectedTokenId(g.lastMove.tokenId)
  }, [g.lastMove?.moveNumber, g.player, ai, started])

  useEffect(() => {
    if (g.gameOver && !playedGameOverSound.current) {
      try {
        sounds.gameOver.play()
      } catch {}
      playedGameOverSound.current = true
    }

    if (!g.gameOver) {
      playedGameOverSound.current = false
    }
  }, [g.gameOver, sounds.gameOver])

  // ------------------------------------------------------------
  // Report result + apply Elo (AI fixed rating; human updates only)
  // NOTE: We are NOT persisting games rows yet.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!started) return
    if (!g.gameOver) return

    // De-dupe: same terminal state can re-render.
    const reportKey = `${g.gameOver.winner}:${g.gameOver.reason}:${g.log.length}`
    if (reportedResultRef.current === reportKey) return
    reportedResultRef.current = reportKey

    // --- VGN TERMINAL MARKER (emit once) ---
    if (vgnRef.current && vgnEndedKeyRef.current !== reportKey) {
      vgnEndedKeyRef.current = reportKey
      vgnRef.current.end(performance.now(), g.gameOver.winner, g.gameOver.reason)
    }
    // --- END VGN TERMINAL MARKER ---

    ;(async () => {
      try {
        const endedAt = new Date().toISOString()

        const userId = await getCurrentUserId()
        if (!userId) return

        // PvP isn't wired yet. For now we treat all matches as vs AI.
        if (!vsAi) return

        await reportVsAiEloAndStats({
          userId,
          timeControlId,
          aiRating: AI_RATING[aiDifficulty] ?? 600,
          humanPlayer: human,
          winner: g.gameOver.winner,
          reason: g.gameOver.reason,
          endedAt,
        })

        // --- SAVE VGN (AI only for PRO accounts) ---
        try {
          if (savedVgnRef.current !== reportKey) {
            savedVgnRef.current = reportKey

            if (vsAi) {
              const accountTier = await getAccountTier(userId)
              if (accountTier === "pro") {
                const gameId = vgnGameIdRef.current
                const rec: any = vgnRef.current as any

                const vgnText: string | null =
                  rec?.toVgnText?.() ??
                  rec?.toVgn?.() ??
                  rec?.toText?.() ??
                  rec?.dump?.() ??
                  (typeof rec?.toString === "function" ? rec.toString() : null)

                if (gameId && vgnText) {
                  await saveGameLog({
                    gameId,
                    ownerId: userId,
                    opponentId: AI_UUID[aiDifficulty] ?? null,
                    mode: "ai",
                    timeControlId,
                    winner: g.gameOver.winner,
                    reason: g.gameOver.reason,
                    aiLevel: aiDifficulty,
                    vgn: vgnText,
                  })
                } else {
                  console.warn("VGN not saved: missing gameId or VGN text", {
                    gameId,
                    hasRecorder: !!vgnRef.current,
                  })
                }
              }
            }
          }
        } catch (e) {
          console.error("VGN save failed:", e)
        }
        // --- END SAVE VGN ---
      } catch (err) {
        console.error("Result reporting / Elo failed:", err)
      }
    })()
  }, [started, g.gameOver, g.log.length, vsAi, timeControlId, aiDifficulty, human])

  useEffect(() => {
    if (!started) return

    const prev = prevRef.current
    prevRef.current = g
    if (!prev) return

    // --- VGN DIFF CAPTURE ---
    if (vgnRef.current) {
      const now = performance.now()
      vgnRef.current.onTurnChange(now, g.player)
      vgnRef.current.captureDiff(now, prev, g, lastPlayedRouteRef.current)
      lastPlayedRouteRef.current = null
    }
    // --- END VGN DIFF CAPTURE ---

    // Siege SFX: detect lock/unlock transitions (4–7 adjacent enemy tokens = locked; dropping below 4 = unlocked)
    // We compute from state each render (no cached flags) so UI/AI/engine stay consistent.
    const buildLockedSet = (state: GameState): Set<string> => {
      const set = new Set<string>()
      for (const t of state.tokens) {
        if (t.in !== "BOARD") continue
        if (isTokenLockedBySiege(state, t)) set.add(t.id)
      }
      return set
    }

    const prevLocked = buildLockedSet(prev)
    const nextLocked = buildLockedSet(g)

    let lockedNow = 0
    let unlockedNow = 0
    for (const id of nextLocked) if (!prevLocked.has(id)) lockedNow += 1
    for (const id of prevLocked) if (!nextLocked.has(id)) unlockedNow += 1

    if (audioReady) {
      if (lockedNow > 0) {
        try {
          sounds.siegeLock.play()
        } catch {}
      }
      if (unlockedNow > 0) {
        try {
          sounds.siegeBreak.play()
        } catch {}
      }
    }

    const didPickSwap =
      g.phase === "SWAP" &&
      (g.pendingSwap.handRouteId !== prev.pendingSwap.handRouteId || g.pendingSwap.queueIndex !== prev.pendingSwap.queueIndex)

    const prevCaptives = prev.captives.B + prev.captives.W
    const nextCaptives = g.captives.B + g.captives.W

    const prevReserves = prev.reserves.B + prev.reserves.W
    const nextReserves = g.reserves.B + g.reserves.W

    const prevOpening = prev.openingPlaced.B + prev.openingPlaced.W
    const nextOpening = g.openingPlaced.B + g.openingPlaced.W

    const prevReinf = prev.reinforcementsToPlace
    const nextReinf = g.reinforcementsToPlace

    const movedKey = (lm: any) => `${lm.by}|${lm.tokenId}|${lm.from.x},${lm.from.y}|${lm.to.x},${lm.to.y}`

    const prevMoveKey = prev.lastMove ? movedKey(prev.lastMove) : null
    const nextMoveKey = g.lastMove ? movedKey(g.lastMove) : null

    if (didPickSwap) {
      playSound(sounds.click)
      return
    }

    if (nextCaptives > prevCaptives) {
      playSound(sounds.capture)
      return
    }

    const placedFromReserves = nextReserves < prevReserves
    const openingPlacedMore = nextOpening > prevOpening
    const reinforcementPlaced = nextReinf < prevReinf

    if (placedFromReserves || openingPlacedMore || reinforcementPlaced) {
      playSound(sounds.place)
      return
    }

    if (prev.phase === "SWAP" && g.phase !== "SWAP") {
      playSound(sounds.swap)
      return
    }
    if (prev.phase === "SWAP" && g.player !== prev.player) {
      playSound(sounds.swap)
      return
    }

    if ((prev.phase === "ACTION" || g.phase === "ACTION") && nextMoveKey && nextMoveKey !== prevMoveKey) {
      playSound(sounds.move)
      return
    }
  }, [g, started, audioReady, playSound, sounds])

  const selected = selectedTokenId ? g.tokens.find((t) => t.id === selectedTokenId && t.in === "BOARD") ?? null : null

  const actions = useMemo(() => {
    return {
      setVsAi,
      setIsRanked,
      setGameId: (id: string | null) => {
        setGameId(id)
        reportedResultRef.current = null
      },

      setStarted: (v: boolean) => {
        setStarted(v)
        if (v) {
          // Make sure the DB is wired even if UI starts without actions.newGame().
          void ensureGameRow(g, timeControlId)
        }
      },
      setAiDifficulty,
      unlockAudio,

      setTimeControlId,

      newGame: async (tc: TimeControlId = timeControlId) => {
        await unlockAudio()

        reportedResultRef.current = null // RESET result de-dupe for the next game
        savedVgnRef.current = null // RESET VGN save de-dupe for the next game

        const ng = newGame()
        setG(ng)
        // --- VGN INIT (new game) ---
        const perf0 = performance.now()
        vgnStartPerfRef.current = perf0

        // VGN game id is local for now (PvP will replace with real games.id later)
        const vgnGameId = crypto.randomUUID()
        vgnGameIdRef.current = vgnGameId
        vgnEndedKeyRef.current = null

        // Determine player ids for META header
        const myId = (await getCurrentUserId()) ?? "anon"

        // For now, AI id is stable-by-difficulty at game start (you already have AI_UUID in this file)
        const aiId = AI_UUID[aiDifficulty] ?? "AI"

        // Who is W/B in this game is determined by `human` after we set it.
        // BUT setHuman is async state; we need a local coinflip here so VGN header matches reality.
        const humanSide: Player = Math.random() < 0.5 ? "W" : "B"
        setHuman(humanSide) // keep your existing reset behavior, but make it deterministic for VGN
        const aiSide: Player = humanSide === "W" ? "B" : "W"

        const t = TIME_CONTROLS[tc]

        vgnRef.current = new VgnRecorder({
          gameId: vgnGameId,
          ruleset: "vekke",
          version: 1,
          whiteId: humanSide === "W" ? myId : aiId,
          blueId: humanSide === "B" ? myId : aiId,
          tokensW: 18,
          tokensB: 18,
          tc: { id: tc, baseMs: t.baseMs, incMs: t.incMs },
          gameStartPerfMs: perf0,
        })
        // --- END VGN INIT ---

        setSelectedTokenId(null)
        prevRef.current = ng
        playedGameOverSound.current = false

        setTimeControlId(tc)
        setClocks({ W: t.baseMs, B: t.baseMs })
        lastTickAtRef.current = performance.now()
        prevTurnPlayerRef.current = null

        // DB wiring only (NO games inserts)
        await ensureGameRow(ng, tc)
      },

      resign: () => {
        if (!started) return
        if (g.gameOver) return

        update((s) => {
          s.gameOver = { winner: other(s.player), reason: "Resignation" }
        })
      },

      onSquareClick,

      playRoute: (owner: Player, routeId: string) => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        // Block current player from playing routes during evasion interrupt
        if (evasionArmed && owner === g.player) {
          warn("INVALID: Opponent is currently in evasion.")
          return
        }

        if (g.player !== owner) {
          warn("INVALID: It's not your turn.")
          return
        }

        if (g.phase !== "ACTION" && g.phase !== "SWAP") {
          warn("INVALID: You can't use routes in this phase.")
          return
        }

        if (g.phase === "ACTION") {
          if (earlySwapArmed) {
            update((s) => chooseSwapHandRoute(s, routeId))
            return
          }

          if (!selectedTokenId) {
            warn("INVALID: You must select a token first.")
            return
          }

          lastPlayedRouteRef.current = { by: g.player, routeId }
          update((s) => applyRouteMove(s, selectedTokenId, routeId))
          return
        }

        update((s) => chooseSwapHandRoute(s, routeId))
      },

      pickQueueIndex: (idx: number) => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        if (!canPickQueueForSwap) {
          warn("INVALID: You can only pick from the queue during a swap.")
          return
        }

        update((s) => chooseSwapQueueIndex(s, idx))
      },

      confirmSwapAndEndTurn: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        if (!canPickQueueForSwap) {
          warn("INVALID: You can only confirm a swap during a swap.")
          return
        }

        if (!g.pendingSwap.handRouteId || g.pendingSwap.queueIndex == null) {
          warn("INVALID: Pick a hand route and a queue slot first.")
          return
        }

        update((s) => confirmSwapAndEndTurn(s))
      },

      armEarlySwap: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        if (!canEarlySwap) {
          if (g.phase !== "ACTION") {
            warn("INVALID: Early swap is only available during ACTION.")
            return
          }
          if (earlySwapArmed) {
            warn("INVALID: Early swap is already armed.")
            return
          }
          if (earlySwapUsedThisTurn) {
            warn("INVALID: Early swap already used this turn.")
            return
          }
          if (remainingRoutes.length <= 0) {
            warn("INVALID: No routes left to swap.")
            return
          }
          if (g.captives[g.player] < EARLY_SWAP_COST) {
            warn(`INVALID: Need ${EARLY_SWAP_COST} captives to early swap.`)
            return
          }
          warn("INVALID: Early swap not available right now.")
          return
        }

        update((s) => armEarlySwap(s))
      },

      confirmEarlySwap: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => confirmEarlySwap(s))
      },

      cancelEarlySwap: () => update((s) => cancelEarlySwap(s)),

      buyExtraReinforcement: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        if (!canBuyExtraReinforcement) {
          if (g.phase !== "ACTION") {
            warn("INVALID: You can only buy reinforcement during ACTION.")
            return
          }
          if (extraReinfBought) {
            warn("INVALID: Extra reinforcement already bought this turn.")
            return
          }
          if (g.reserves[g.player] < EXTRA_REINFORCEMENT_COST) {
            warn(`INVALID: Need ${EXTRA_REINFORCEMENT_COST} reserves to buy reinforcement.`)
            return
          }
          warn("INVALID: Can't buy extra reinforcement right now.")
          return
        }

        update((s) => buyExtraReinforcement(s))
      },

      useRansom: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        if (!canUseRansom) {
          if (g.phase !== "ACTION") {
            warn("INVALID: Ransom only available during ACTION.")
            return
          }
          if (ransomUsed) {
            warn("INVALID: Ransom already used this turn.")
            return
          }
          if (g.captives[g.player] < RANSOM_COST_CAPTIVES) {
            warn(`INVALID: Need ${RANSOM_COST_CAPTIVES} captives to ransom.`)
            return
          }
          if (g.void[g.player] < 1) {
            warn("INVALID: No tokens in void to recover.")
            return
          }
          warn("INVALID: Can't use ransom right now.")
          return
        }

        update((s) => useRansom(s))
      },

      yieldForced: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => yieldForcedIfNoUsableRoutes(s))
      },

      armEvasion: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        if (!canUseEvasion) {
          if (g.phase !== "ACTION") {
            warn("INVALID: Evasion is only available during ACTION phase.")
            return
          }
          if (evasionArmed) {
            warn("INVALID: Evasion is already armed.")
            return
          }
          if (hasUsedEvasion) {
            warn("INVALID: Evasion already used this game.")
            return
          }
          if (g.captives[defender] < EVASION_COST_CAPTIVES) {
            warn(`INVALID: Need ${EVASION_COST_CAPTIVES} captives to evade.`)
            return
          }
          if (g.reserves[defender] < EVASION_COST_RESERVES) {
            warn(`INVALID: Need ${EVASION_COST_RESERVES} reserves to evade.`)
            return
          }
          warn("INVALID: Evasion not available right now.")
          return
        }

        update((s) => armEvasion(s))
      },

      cancelEvasion: () => update((s) => cancelEvasion(s)),

      selectEvasionToken: (tokenId: string) => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => selectEvasionToken(s, tokenId))
      },

      selectEvasionDestination: (to: Coord) => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => selectEvasionDestination(s, to))
      },

      confirmEvasion: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => confirmEvasion(s))
      },

      setSelectedTokenId,
    }
  }, [
    started,
    g,
    update,
    unlockAudio,
    onSquareClick,
    earlySwapArmed,
    earlySwapUsedThisTurn,
    remainingRoutes.length,
    canPickQueueForSwap,
    canEarlySwap,
    canBuyExtraReinforcement,
    extraReinfBought,
    canUseRansom,
    ransomUsed,
    evasionArmed,
    hasUsedEvasion,
    canUseEvasion,
    defender,
    selectedTokenId,
    warn,
    timeControlId,
    ensureGameRow,
  ])

  return {
    g,
    vsAi,
    isRanked,
    gameId,

    selectedTokenId,
    selected,
    human,
    ai,
    started,
    audioReady,
    aiDifficulty,
    boardMap,
    remainingRoutes,
    forcedYieldAvailable,
    earlySwapArmed,
    canPickQueueForSwap,
    canEarlySwap,
    canBuyExtraReinforcement,
    canUseRansom,
    evasionArmed,
    canUseEvasion,
    pendingEvasion,
    evasionSourcePos,
    evasionPlayer: evasionArmed ? defender : null,
    clockPlayer,

    timeControlId,
    timeControl,
    clocks,

    constants: {
      EARLY_SWAP_COST,
      EXTRA_REINFORCEMENT_COST,
      RANSOM_COST_CAPTIVES,
      EVASION_COST_CAPTIVES,
      EVASION_COST_RESERVES,
    },
    actions,
  }
}
