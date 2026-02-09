import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Howler } from "howler"
import type { Coord } from "./coords"
import { newGame, type GameState, type Player, type Token } from "./state"
import { aiStepBeginner, aiStepIntermediate, aiThinkDelayMs } from "./ai"
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

type Clocks = { W: number; B: number }

const other = (p: Player): Player => (p === "W" ? "B" : "W")

export function useVekkeController(opts: { sounds: Sounds; aiDelayMs?: number }) {
  const sounds = opts.sounds
  const AI_DELAY_MS = opts.aiDelayMs ?? 1200

  const [g, setG] = useState<GameState>(() => newGame())
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [human] = useState<Player>(() => (Math.random() < 0.5 ? "W" : "B"))
  const ai: Player = human === "W" ? "B" : "W"

  const [aiDifficulty, setAiDifficulty] = useState<"beginner" | "intermediate">("beginner")

  const [started, setStarted] = useState(false)
  const [audioReady, setAudioReady] = useState(false)

  // NEW: time controls + clocks
  const [timeControlId, setTimeControlId] = useState<TimeControlId>("standard")
  const timeControl = TIME_CONTROLS[timeControlId]
  const [clocks, setClocks] = useState<Clocks>(() => ({ W: timeControl.baseMs, B: timeControl.baseMs }))

  const prevRef = useRef<GameState | null>(null)
  const playedGameOverSound = useRef(false)

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
    g.reserves[g.player] >= EXTRA_REINFORCEMENT_COST

  const update = useCallback((mut: (s: GameState) => void) => {
    setG((prev) => {
      const next: GameState = structuredClone(prev)
      mut(next)
      return next
    })
  }, [])

  const warn = useCallback((msg: string) => {
    update((s) => {
      (s as any).warning = msg
    })
  }, [update])

  // Play invalid sound on any new INVALID warning (original robust version, fixed deps)
  const currentWarning = useMemo(() => (g as any).warning ?? null, [g])   // stable ref to string or null

  useEffect(() => {
    if (!audioReady) return

    const w = currentWarning
    if (!w || typeof w !== "string" || !w.toUpperCase().startsWith("INVALID")) {
      lastInvalidRef.current = null
      return
    }

    if (lastInvalidRef.current === w) return   // don't repeat same message

    console.log("[INVALID SOUND] Triggered for:", w)   // debug: see if it fires
    lastInvalidRef.current = w
    playSound(sounds.invalid)
  }, [currentWarning, audioReady, playSound, sounds.invalid])

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
        const p = g.player
        const nextVal = Math.max(0, prev[p] - dt)
        return { ...prev, [p]: nextVal }
      })
    }, intervalMs)

    return () => window.clearInterval(id)
  }, [started, g.player, g.gameOver, timeControlId])

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
      update((s) => ((s as any).gameOver = { winner: "B" } as any))
      warn("TIME: White ran out of time.")
      return
    }
    if (clocks.B <= 0) {
      update((s) => ((s as any).gameOver = { winner: "W" } as any))
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
    [started, g, update, playSound, sounds.place, sounds.click, boardMap, selectedTokenId, warn]
  )

  useEffect(() => {
    const sel = selectedTokenId
      ? g.tokens.find((t) => t.in === "BOARD" && t.id === selectedTokenId)
      : null

    if (g.phase === "ACTION" || g.phase === "SWAP") {
      if (!sel || sel.owner !== g.player) {
        const firstFriendly = g.tokens.find((t) => t.in === "BOARD" && t.owner === g.player)
        setSelectedTokenId(firstFriendly ? firstFriendly.id : null)
      }
    }
  }, [g.player, g.phase, g.tokens, selectedTokenId])

  useEffect(() => {
    if (!started) return
    if (g.gameOver) return
    if (g.player !== ai) return

    const t = window.setTimeout(() => {
      update((s) => {
        const step = aiDifficulty === "beginner" ? aiStepBeginner : aiStepIntermediate
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

  useEffect(() => {
    if (!started) return

    const prev = prevRef.current
    prevRef.current = g
    if (!prev) return

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
        try { sounds.siegeLock.play() } catch {}
      }
      if (unlockedNow > 0) {
        try { sounds.siegeBreak.play() } catch {}
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

  const selected =
    selectedTokenId ? g.tokens.find((t) => t.id === selectedTokenId && t.in === "BOARD") ?? null : null

  const actions = useMemo(() => {
    return {
      setStarted,
      setAiDifficulty,
      unlockAudio,

      setTimeControlId,

      newGame: async (tc: TimeControlId = timeControlId) => {
        await unlockAudio()

        const ng = newGame()
        setG(ng)
        setSelectedTokenId(null)
        prevRef.current = ng
        playedGameOverSound.current = false

        const t = TIME_CONTROLS[tc]
        setTimeControlId(tc)
        setClocks({ W: t.baseMs, B: t.baseMs })
        lastTickAtRef.current = performance.now()
        prevTurnPlayerRef.current = null
      },

      resign: () => {
        if (!started) return
        if (g.gameOver) return

        update((s) => {
          s.gameOver = { winner: other(s.player) }
        })
      },

      onSquareClick,

      playRoute: (owner: Player, routeId: string) => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
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

      yieldForced: () => {
        if (!started) return
        if (g.gameOver) {
          warn("INVALID: Game is over.")
          return
        }
        update((s) => yieldForcedIfNoUsableRoutes(s))
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
    selectedTokenId,
    warn,
    timeControlId,
  ])

  return {
    g,
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

    timeControlId,
    timeControl,
    clocks,

    constants: { EARLY_SWAP_COST, EXTRA_REINFORCEMENT_COST },
    actions,
  }
}