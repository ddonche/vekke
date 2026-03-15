import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Howler } from "howler"
import { getCurrentUserId } from "../services/auth"
import type { Coord } from "./coords"
import { newGame, type GameState, type Player, type Token } from "./state"
import { VgnRecorder } from "./vgn"
import {
  aiStepRookie,
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
  armRecoil,
  cancelRecoil,
  selectRecoilToken,
  selectRecoilDestination,
  confirmRecoil,
  RECOIL_COST_CAPTIVES,
  RECOIL_COST_RESERVES,
  advanceFromAction,
  armDefection,
  cancelDefection,
  confirmDefection,
  DEFECTION_BOARD_COST,
  DEFECTION_VOID_GAIN,
  executeMulligan,
  passMulligan,
  armMulligan,
  cancelMulligan,
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

export const TIME_CONTROLS: Record<TimeControlId, TimeControl> = {
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
  rookie: 400,
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
  rookie: "29b6ad2a-4bfc-4041-938d-9077c6743cc2", // Scarecrow
  novice: "d90c1ec7-a586-4594-85ad-702beca6af45", // Glen
  adept: "9d6503a7-1b18-46d4-878d-09367d6ac833", // Priya
  expert: "69174323-2b15-4b83-b1d7-96a324bce0a4", // Vladimir
  master: "bb5802a3-1f76-43f8-9bf3-2ac65d618cfe", // Yui
  senior_master: "92c903e8-aa7d-4571-9905-0611b4a07a1d", // Haoran
  grandmaster: "492a8702-9470-4f43-85e0-d6b44ec5c562", // Chioma
}

type Clocks = { W: number; B: number }

const other = (p: Player): Player => (p === "W" ? "B" : "W")

export function useVekkeController(opts: {
  sounds: Sounds
  aiDelayMs?: number
  opponentType?: "ai" | "pvp"
  onMoveComplete?: (
    state: GameState,
    clocks: { W: number; B: number },
    vgn?: string
  ) => void
  initialState?: GameState
  /**
   * PvP only: pass the latest state received from the DB here.
   * When it changes the controller will apply it to the local engine,
   * which is how the opponent's move is shown on your board.
   */
  externalState?: GameState
  externalGameData?: any
  mySide?: Player
  initialTimeControlId?: TimeControlId
  initialClocks?: { W: number; B: number }
  /** AI games loaded from DB: pass the ai_level so the controller starts with the right difficulty */
  initialAiDifficulty?: AiLevel
}) {
  const sounds = opts.sounds
  const AI_DELAY_MS = opts.aiDelayMs ?? 1200
  const opponentType = opts.opponentType ?? "ai"
  const onMoveComplete = opts.onMoveComplete
  const mySide = opts.mySide

  // ------------------------------------------------------------
  // Core game state
  // ------------------------------------------------------------
  const [g, setG] = useState<GameState>(() => opts.initialState ?? newGame())
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)

  // IMPORTANT: human MUST reset each new game (you asked for this).
  const [human, setHuman] = useState<Player>(() => {
    if (opts.mySide) return opts.mySide
    return Math.random() < 0.5 ? "W" : "B"
  })
  const ai: Player = human === "W" ? "B" : "W"

  const [aiDifficulty, setAiDifficulty] = useState<AiLevel>(opts.initialAiDifficulty ?? "novice")

  const [started, setStarted] = useState(() => opponentType === "pvp")
  const [audioReady, setAudioReady] = useState(false)

  // NEW: time controls + clocks
  const [timeControlId, setTimeControlId] = useState<TimeControlId>(opts.initialTimeControlId ?? "standard")
  const timeControl = TIME_CONTROLS[timeControlId]
  const [clocks, setClocks] = useState<Clocks>(
    () => opts.initialClocks ?? { W: timeControl.baseMs, B: timeControl.baseMs }
  )

  // ------------------------------------------------------------
  // Online reporting / Elo wiring
  // (Add-only: does not affect gameplay logic)
  // ------------------------------------------------------------
  const [vsAi, setVsAi] = useState<boolean>(opponentType === "ai")
  const [gameId, setGameId] = useState<string | null>(null)
  const reportedResultRef = useRef<string | null>(null)

  // ------------------------------------------------------------
  // External state injection (PvP: opponent's move from DB)
  // ------------------------------------------------------------
  // When the wrapper receives the opponent's state via realtime it passes it
  // here.  We apply it to the local engine so the board actually updates.
  // We use a ref flag to suppress the onMoveComplete echo that would otherwise
  // write the opponent's state straight back to the DB.
  const applyingExternalRef = useRef(false)
  const lastExternalKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (opponentType !== "pvp") return
    if (!opts.externalState) return

    // Never overwrite local state while it is our own turn.
    // During our turn we are the sole authority — anything arriving from the DB
    // is either an echo of one of our own moves or a stale out-of-order packet.
    // The opponent's end-of-turn write arrives when g.player is still the opponent
    // locally (before we apply it), so that case is always allowed through.
    if (mySide && gPlayerRef.current === mySide) return

    // Cheap dedup key – same shape as PvPGameWrapper's makeStateKey
    const ext = opts.externalState as any
    let key: string
    if (ext.gameOver) {
      key = `gameover-${ext.gameOver.winner}-${ext.gameOver.reason}-${ext.log?.length ?? 0}`
    } else if (ext.phase === "OPENING") {
      key = `opening-${ext.openingPlaced?.B ?? 0}-${ext.openingPlaced?.W ?? 0}`
    } else {
      key = `${ext.player}-${ext.phase}-${ext.log?.length ?? 0}`
    }

    if (key === lastExternalKeyRef.current) return
    lastExternalKeyRef.current = key

    applyingExternalRef.current = true
    setG(opts.externalState)
  }, [opts.externalState, opponentType, mySide])

  // Track the last state key we actually sent to onMoveComplete so we never
  // fire it twice for the same state (e.g. on a clock tick with unchanged g).
  const lastSyncedKeyRef = useRef<string | null>(null)

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
  const recoilAutoSelectedRef = useRef(false)
  // Always reflects the current g.player; updated in render body (safe for a ref).
  const gPlayerRef = useRef<Player>(g.player)
  gPlayerRef.current = g.player

  // ------------------------------------------------------------
  // VGN recording (pure state-transition ledger)
  // ------------------------------------------------------------
  const vgnRef = useRef<VgnRecorder | null>(null)
  const vgnGameIdRef = useRef<string | null>(null)
  const vgnStartPerfRef = useRef<number>(0)
  const vgnEndedKeyRef = useRef<string | null>(null)
  const lastPlayedRouteRef = useRef<{ by: Player; routeId: string } | null>(null)
  const enrichedLogsRef = useRef<{ text: string; step: number }[]>([])

  useEffect(() => {
    const externalGameData = (opts as any).externalGameData
    if (!externalGameData) return
    if (vgnRef.current) return

    const tcId = opts.initialTimeControlId ?? "standard"
    const tc = TIME_CONTROLS[tcId]
    const perf0 = performance.now()

    vgnStartPerfRef.current = perf0
    vgnGameIdRef.current = externalGameData.id ?? externalGameData.game_id ?? crypto.randomUUID()
    vgnEndedKeyRef.current = null

    const rec = new VgnRecorder({
      gameId: vgnGameIdRef.current,
      ruleset: "vekke",
      version: 1,
      whiteId: String(externalGameData.wake_id ?? "W"),
      blueId: String(externalGameData.brake_id ?? "B"),
      tokensW: 18,
      tokensB: 18,
      tc: { id: tcId, baseMs: tc.baseMs, incMs: tc.incMs },
      gameStartPerfMs: perf0,
    })

    const existingVgn = externalGameData.vgn as string | null | undefined
    if (existingVgn) {
      ;(rec as any).lines = String(existingVgn).split("\n")
    }

    vgnRef.current = rec
  }, [opts.initialTimeControlId, (opts as any).externalGameData])

  // Timer refs
  const lastTickAtRef = useRef<number>(0)
  const prevTurnPlayerRef = useRef<Player | null>(null)
  const clockPlayerRef = useRef<Player>("W")

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

  const remainingRoutes =
    g.phase === "ACTION" ? g.routes[g.player].filter((r) => !g.usedRoutes.includes(r.id)) : []

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
    g.phase === "ACTION" &&
    !g.gameOver &&
    !extraReinfBought &&
    g.reserves[g.player] >= EXTRA_REINFORCEMENT_COST + 2

  const ransomUsed = Boolean((g as any).ransomUsedThisTurn)

  const canUseRansom =
    g.phase === "ACTION" &&
    !g.gameOver &&
    !ransomUsed &&
    g.captives[g.player] >= RANSOM_COST_CAPTIVES &&
    g.void[g.player] >= 1

  const recoilArmed = Boolean((g as any).recoilArmed)
  const defender = other(g.player) // The player who is NOT currently moving

  // Whose clock should be ticking?
  // During recoil interrupt, defender's clock ticks. Otherwise, current player's clock ticks.
  const clockPlayer = recoilArmed ? defender : g.player
  clockPlayerRef.current = clockPlayer

  // Miracle Win protection: on turn 1, Recoil available only when defender is down to 1 token on the board
  // In that scenario it's free (defender has 0 captives on turn 1)
  const defenderTokensOnBoard = g.tokens.filter((t) => t.in === "BOARD" && t.owner === defender).length
  const isMiracleWinScenario = g.turn === 1 && defenderTokensOnBoard === 1
  const canUseRecoil =
    !g.gameOver &&
    !recoilArmed &&
    g.phase !== "OPENING" &&
    (isMiracleWinScenario ||
      (g.captives[defender] >= RECOIL_COST_CAPTIVES &&
        g.reserves[defender] >= RECOIL_COST_RESERVES))

  // Defection
  const defectionArmed = Boolean(g.defectionArmed)
  const mulliganArmed = Boolean((g as any).mulliganArmed)
  const defectionUsedThisTurn = Boolean(g.defectionUsedThisTurn)

  const canUseDefection =
    g.phase === "ACTION" &&
    !g.gameOver &&
    !defectionArmed &&
    !defectionUsedThisTurn &&
    g.tokens.filter((t) => t.in === "BOARD" && t.owner === g.player).length >= 2 &&
    g.void[other(g.player)] >= DEFECTION_VOID_GAIN

  // True when all routes have been used — UI shows "Proceed to Reinforcements" button
  const allRoutesUsed =
    g.phase === "ACTION" &&
    !g.gameOver &&
    g.usedRoutes.length >= g.routes[g.player].length &&
    g.routes[g.player].length > 0
  const pendingRecoil = (g as any).pendingRecoil as { tokenId: string | null; to: Coord | null } | undefined
  const recoilSourcePos =
    recoilArmed && selectedTokenId
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
    if (opts.initialClocks) return
    setClocks({ W: timeControl.baseMs, B: timeControl.baseMs })
  }, [timeControl.baseMs, started, opts.initialClocks])

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
        const p = clockPlayerRef.current
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

    // In PvP, only trigger timeout for YOUR OWN clock running out.
    // The opponent's timeout is their client's responsibility to report.
    if (opponentType === "pvp" && mySide !== g.player) return

    if (clocks.W <= 0) {
      update((s) => ((s as any).gameOver = { winner: "B", reason: "Timeout" } as any))
      warn("TIME: W ran out of time.")
      return
    }
    if (clocks.B <= 0) {
      update((s) => ((s as any).gameOver = { winner: "W", reason: "Timeout" } as any))
      warn("TIME: B ran out of time.")
      return
    }
  }, [started, g.gameOver, clocks.W, clocks.B, update, warn, opponentType, mySide])

  // ===== END TIMER CORE =====

  const onSquareClick = useCallback(
    (x: number, y: number) => {
      if (!started) return
      // PvP: block input when it's not your turn (except during evasion which is defender's action)
      if (opponentType === "pvp" && mySide) {
        const activePlayer = recoilArmed ? other(g.player) : g.player
        if (activePlayer !== mySide) return
      }
      if ((g as any).warning) update((s) => ((s as any).warning = "" as any))

      const coord: Coord = { x, y }

      if (g.phase === "MULLIGAN") {
        if (!mulliganArmed) return
        const t = boardMap.get(`${x},${y}`)
        if (t && t.owner === (opponentType === "pvp" ? mySide : g.player) && t.in === "BOARD") {
          update((s) => executeMulligan(s, t.owner, t.id))
          playSound(sounds.click)
        }
        return
      }

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

      // Handle defection clicks — player clicks one of their own board tokens to sacrifice
      if (defectionArmed) {
        const t = boardMap.get(`${x},${y}`)
        if (t && t.owner === g.player && t.in === "BOARD") {
          update((s) => confirmDefection(s, t.id))
          playSound(sounds.click)
        } else {
          warn("INVALID: Click one of your own board tokens to sacrifice for Defection.")
        }
        return
      }

      // Handle evasion clicks
      if (recoilArmed) {
        // --- EVASION: allow selecting the last-captured token by clicking its capture square ---
        if (g.lastMove) {
          const captured = g.tokens.find((t) => t.id === g.lastMove!.tokenId && t.in === "CAPTIVE")

          // Only when we haven't selected an evasion token yet
          if (captured && !pendingRecoil?.tokenId && x === g.lastMove.to.x && y === g.lastMove.to.y) {
            update((s) => selectRecoilToken(s, captured.id))
            setSelectedTokenId(captured.id) // so your UI highlights correctly
            playSound(sounds.click)
            return
          }
        }

        const t = boardMap.get(`${x},${y}`)
        if (t) {
          // Clicking on a token - select it for evasion
          update((s) => selectRecoilToken(s, t.id))
          setSelectedTokenId(t.id) // Update visual selection
          playSound(sounds.click)
        } else {
          // Clicking on empty square - select as destination
          update((s) => selectRecoilDestination(s, coord))
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
    [
      started,
      g,
      update,
      playSound,
      sounds.place,
      sounds.click,
      boardMap,
      selectedTokenId,
      warn,
      recoilArmed,
      pendingRecoil,
      defectionArmed,
      mulliganArmed,
      opponentType,
      mySide,
    ]
  )

  useEffect(() => {
    // Auto-select for evasion - only on initial arm
    if (recoilArmed && !recoilAutoSelectedRef.current) {
      recoilAutoSelectedRef.current = true

      // If last move captured defender's token, select that captured token
      if (g.lastMove) {
        const capturedToken = g.tokens.find((t) => t.id === g.lastMove?.tokenId && t.owner === defender)
        if (capturedToken) {
          setSelectedTokenId(capturedToken.id)
          // Also set in game engine
          update((s) => selectRecoilToken(s, capturedToken.id))
          return
        }
      }

      // Otherwise, select random defender's board token
      const defenderTokens = g.tokens.filter((t) => t.in === "BOARD" && t.owner === defender)
      if (defenderTokens.length > 0) {
        setSelectedTokenId(defenderTokens[0].id)
        // Also set in game engine
        update((s) => selectRecoilToken(s, defenderTokens[0].id))
      }
      return
    }

    // Reset ref when evasion ends
    if (!recoilArmed) {
      recoilAutoSelectedRef.current = false
    }

    // Normal auto-selection for regular turns
    if (!recoilArmed) {
      const sel = selectedTokenId ? g.tokens.find((t) => t.in === "BOARD" && t.id === selectedTokenId) ?? null : null

      if (g.phase === "ACTION" || g.phase === "SWAP") {
        if (!sel || sel.owner !== g.player) {
          const firstFriendly = g.tokens.find((t) => t.in === "BOARD" && t.owner === g.player)
          setSelectedTokenId(firstFriendly ? firstFriendly.id : null)
        }
      }
    }
  }, [g.player, g.phase, g.tokens, recoilArmed, g.lastMove, defender, update, selectedTokenId])

  useEffect(() => {
    if (!started) return
    if (g.gameOver) return
    if (opponentType !== "ai") return // Skip AI in PvP mode
    if (recoilArmed) return // Don't let AI move during evasion interrupt

    // AI auto-passes mulligan
    if (g.phase === "MULLIGAN" && !(g as any).mulliganReady?.[ai]) {
      const t = window.setTimeout(() => {
        update((s) => passMulligan(s, ai))
      }, 1500)
      return () => window.clearTimeout(t)
    }

    if (g.player !== ai) return

    // --- AI "thinking" delay ---
    // Human pacing: ~1–5 seconds per AI action, regardless of level/time control.
    // (Still respects opts.aiDelayMs if you want a fixed delay.)
    const delayMs = (() => {
      if (opts.aiDelayMs != null) return AI_DELAY_MS

      const MIN_MS = 1000
      const MAX_MS = 5000
      const ms = MIN_MS + Math.random() * (MAX_MS - MIN_MS)
      return Math.max(MIN_MS, Math.round(ms))
    })()
    // --- end delay ---

    const t = window.setTimeout(() => {
      update((s) => {
        const stepMap: Record<AiLevel, typeof aiStepNovice> = {
          rookie: aiStepRookie,
          novice: aiStepNovice,
          adept: aiStepAdept,
          expert: aiStepExpert,
          master: aiStepMaster,
          senior_master: aiStepSeniorMaster,
          grandmaster: aiStepGrandmaster,
        }
        // If AI has used all its routes, advance the phase instead of trying to move/yield.
        // (finishActionIfDone is a no-op; the AI must call advanceFromAction explicitly.)
        if (
          s.phase === "ACTION" &&
          s.routes[ai].length > 0 &&
          s.usedRoutes.length >= s.routes[ai].length
        ) {
          advanceFromAction(s)
          return
        }

        const step = stepMap[aiDifficulty] ?? aiStepNovice
        step(s, ai)
      })
    }, delayMs)

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
    recoilArmed,
    opponentType,
    timeControlId,
    opts.aiDelayMs,
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

      // --- VGN TERMINAL MARKER (emit once) ---
      const reportKey = `${g.gameOver.winner}:${g.gameOver.reason}:${g.log.length}`
      if (vgnRef.current && vgnEndedKeyRef.current !== reportKey) {
        vgnEndedKeyRef.current = reportKey
        vgnRef.current.end(performance.now(), g.gameOver.winner, g.gameOver.reason)
      }
      // --- END VGN TERMINAL MARKER ---
    }

    if (!g.gameOver) {
      playedGameOverSound.current = false
    }
  }, [g.gameOver, sounds.gameOver])

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

      // Emit a NOTE for every new human log entry.
      // game.ts uses unshift() so newest entries are at the front of g.log.
      // Reverse the slice so notes are emitted oldest-first.
      const newEntries = g.log.length - prev.log.length
      if (newEntries > 0) {
        const fresh = g.log.slice(0, newEntries).reverse()
        for (const text of fresh) {
          vgnRef.current.note(now, text)
        }
        // Also stamp enrichedLogs for the DB (kept until notes are verified)
        const step = vgnRef.current.nonMetaLineCount()
        for (const text of fresh) {
          enrichedLogsRef.current.push({ text, step })
        }
      }
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
      (g.pendingSwap.handRouteId !== prev.pendingSwap.handRouteId ||
        g.pendingSwap.queueIndex !== prev.pendingSwap.queueIndex)

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

  // Sync state to database after a real local state change.
  // IMPORTANT: do NOT include `clocks` in the deps – clocks tick every second
  // and would cause this to spam writes, overwriting the opponent's move.
  // This effect is intentionally BELOW the VGN effects so the serialized VGN
  // includes captureDiff() and terminal end() for the current state.
  useEffect(() => {
    if (!started) return
    if (!onMoveComplete) return

    // Skip if this state update came from the DB (opponent's move).
    // Echoing it back would overwrite the DB with stale local state.
    if (applyingExternalRef.current) {
      applyingExternalRef.current = false
      return
    }

    // Dedup: only fire when g actually changed to a new logical state.
    const gAny = g as any
    let key: string
    if (gAny.gameOver) {
      key = `gameover-${gAny.gameOver.winner}-${gAny.gameOver.reason}-${gAny.log?.length ?? 0}`
    } else if (gAny.phase === "OPENING") {
      key = `opening-${gAny.openingPlaced?.B ?? 0}-${gAny.openingPlaced?.W ?? 0}`
    } else {
      key = `${gAny.player}-${gAny.phase}-${gAny.log?.length ?? 0}`
    }

    if (key === lastSyncedKeyRef.current) return
    lastSyncedKeyRef.current = key

    onMoveComplete(g, clocks, vgnRef.current?.toString?.() ?? undefined, enrichedLogsRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, started, onMoveComplete])
  // Note: clocks intentionally omitted – clock values are included in the
  // argument but must not be the trigger, only g changing should trigger a write.

  const selected =
    selectedTokenId ? g.tokens.find((t) => t.id === selectedTokenId && t.in === "BOARD") ?? null : null

  const actions = useMemo(() => {
    return {
      setVsAi,
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
        void aiSide

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
        enrichedLogsRef.current = []
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

        // PvP: only allow action on your own turn
        if (opponentType === "pvp" && mySide && g.player !== mySide) {
          warn("INVALID: It's not your turn.")
          return
        }

        // Block current player from playing routes during evasion interrupt
        if (recoilArmed && owner === g.player) {
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
        if (opponentType === "pvp" && mySide && g.player !== mySide) return

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
        if (opponentType === "pvp" && mySide && g.player !== mySide) return

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
        // Freeze: recoil interrupt takes priority — attacker must wait
        if (recoilArmed) {
          warn("INVALID: Opponent is using Recoil — wait for them to resolve.")
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
        if (opponentType === "pvp" && mySide && g.player !== mySide) return

        if (!canBuyExtraReinforcement) {
          if (g.phase !== "ACTION") {
            warn("INVALID: You can only buy reinforcement during ACTION.")
            return
          }
          if (extraReinfBought) {
            warn("INVALID: Extra reinforcement already bought this turn.")
            return
          }
          if (g.reserves[g.player] < EXTRA_REINFORCEMENT_COST + 2) {
            warn(
              `INVALID: Need at least ${EXTRA_REINFORCEMENT_COST + 2} reserves to buy extra reinforcement (cost ${EXTRA_REINFORCEMENT_COST}, then you must still have 2 reserves to place both reinforcements).`
            )
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
        if (opponentType === "pvp" && mySide && g.player !== mySide) return

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

      executeMulligan: (side: Player, tokenId: string) => {
        if (!started) return
        update((s) => executeMulligan(s, side, tokenId))
      },

      passMulligan: (side: Player) => {
        if (!started) return
        update((s) => passMulligan(s, side))
      },

      armMulligan: (side: Player) => {
        if (!started) return
        update((s) => armMulligan(s, side))
      },

      cancelMulligan: () => {
        if (!started) return
        update((s) => cancelMulligan(s))
      },

      yieldForced: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        if (opponentType === "pvp" && mySide && g.player !== mySide) return
        update((s) => yieldForcedIfNoUsableRoutes(s))
      },

      armRecoil: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }

        if (!canUseRecoil) {
          if (g.phase !== "ACTION") {
            warn("INVALID: Recoil is only available during ACTION phase.")
            return
          }
          if (recoilArmed) {
            warn("INVALID: Recoil is already armed.")
            return
          }
          if (!isMiracleWinScenario && g.captives[defender] < RECOIL_COST_CAPTIVES) {
            warn(`INVALID: Need ${RECOIL_COST_CAPTIVES} captives to recoil.`)
            return
          }
          if (!isMiracleWinScenario && g.reserves[defender] < RECOIL_COST_RESERVES) {
            warn(`INVALID: Need ${RECOIL_COST_RESERVES} reserves to recoil.`)
            return
          }
          warn("INVALID: Recoil not available right now.")
          return
        }

        update((s) => armRecoil(s))
      },

      cancelRecoil: () => update((s) => cancelRecoil(s)),

      selectRecoilToken: (tokenId: string) => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => selectRecoilToken(s, tokenId))
      },

      selectRecoilDestination: (to: Coord) => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => selectRecoilDestination(s, to))
      },

      confirmRecoil: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => confirmRecoil(s))
      },

      advanceFromAction: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        if (opponentType === "pvp" && mySide && g.player !== mySide) return
        if (!allRoutesUsed) {
          warn("INVALID: You still have routes to use before advancing.")
          return
        }
        update((s) => advanceFromAction(s))
      },

      armDefection: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        if (opponentType === "pvp" && mySide && g.player !== mySide) return
        if (!canUseDefection) {
          if (g.phase !== "ACTION") {
            warn("INVALID: Defection only available during ACTION.")
            return
          }
          if (defectionArmed) {
            warn("INVALID: Defection is already armed.")
            return
          }
          if (defectionUsedThisTurn) {
            warn("INVALID: Defection already used this turn.")
            return
          }
          if (g.tokens.filter((t) => t.in === "BOARD" && t.owner === g.player).length < 2) {
            warn("INVALID: Need at least 2 of your own tokens on the board.")
            return
          }
          if (g.void[other(g.player)] < DEFECTION_VOID_GAIN) {
            warn("INVALID: No enemy tokens in the void to claim.")
            return
          }
          warn("INVALID: Defection not available right now.")
          return
        }
        update((s) => armDefection(s))
      },

      cancelDefection: () => update((s) => cancelDefection(s)),

      loadState: (state: GameState) => {
        setG(state)
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
    recoilArmed,
    canUseRecoil,
    defender,
    defectionArmed,
    defectionUsedThisTurn,
    canUseDefection,
    allRoutesUsed,
    selectedTokenId,
    warn,
    timeControlId,
    ensureGameRow,
    aiDifficulty,
    opponentType,
    mySide,
    isMiracleWinScenario,
  ])

  return {
    g,
    vsAi,
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
    recoilArmed,
    canUseRecoil,
    pendingRecoil,
    recoilSourcePos,
    recoilPlayer: recoilArmed ? defender : null,
    defectionArmed,
    mulliganArmed,
    canUseDefection,
    allRoutesUsed,
    clockPlayer,

    timeControlId,
    timeControl,
    clocks,

    constants: {
      EARLY_SWAP_COST,
      EXTRA_REINFORCEMENT_COST,
      RANSOM_COST_CAPTIVES,
      RECOIL_COST_CAPTIVES,
      RECOIL_COST_RESERVES,
      DEFECTION_BOARD_COST,
      DEFECTION_VOID_GAIN,
    },
    actions,
  }
}