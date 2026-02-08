import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Howler } from "howler"
import type { Coord } from "./coords"
import { newGame, type GameState, type Player, type Token } from "./state"
import { traceByRoute, type Route } from "./move"
import { aiStepBeginner, aiStepIntermediate } from "./ai"
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
} from "./game"

type SoundHandle = { stop: () => void; play: () => number; load?: () => void }
type Sounds = {
  move: SoundHandle
  capture: SoundHandle
  place: SoundHandle
  swap: SoundHandle
  click: SoundHandle
  gameOver: SoundHandle
}

export function useVekkeController(opts: { sounds: Sounds; aiDelayMs?: number }) {
  const sounds = opts.sounds
  const AI_DELAY_MS = opts.aiDelayMs ?? 1200

  const [g, setG] = useState<GameState>(() => newGame())
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [human] = useState<Player>(() => (Math.random() < 0.5 ? "W" : "B"))
  const ai: Player = human === "W" ? "B" : "W"

  const [aiDifficulty, setAiDifficulty] = useState<"beginner" | "intermediate">(
    "beginner"
  )

  const [started, setStarted] = useState(false)
  const [audioReady, setAudioReady] = useState(false)

  const prevRef = useRef<GameState | null>(null)
  const playedGameOverSound = useRef(false)

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

  const samePos = useCallback((a: Coord, b: Coord) => a.x === b.x && a.y === b.y, [])
  const tokenAtXY = useCallback(
    (x: number, y: number): Token | null => boardMap.get(`${x},${y}`) ?? null,
    [boardMap]
  )

  const canTokenUseRoute = useCallback(
    (p: Player, token: Token, route: Route): boolean => {
      if (token.in !== "BOARD") return false
      if (token.owner !== p) return false

      const from = token.pos
      const steps = traceByRoute(from, route)
      if (steps.length === 0) return false

      const leftOrigin = steps.some((c) => !samePos(c, from))
      if (!leftOrigin) return false

      const to = steps[steps.length - 1]
      const occ = tokenAtXY(to.x, to.y)
      if (occ && occ.owner === p && occ.id !== token.id) return false

      return true
    },
    [samePos, tokenAtXY]
  )

  const remainingRoutes =
    g.phase === "ACTION" ? g.routes[g.player].filter((r) => !g.usedRoutes.includes(r.id)) : []

  const forcedYieldAvailable =
    g.phase === "ACTION" &&
    !g.gameOver &&
    remainingRoutes.length > 0 &&
    (() => {
      const friendly = g.tokens.filter((t) => t.in === "BOARD" && t.owner === g.player)
      for (const r of remainingRoutes) {
        for (const t of friendly) {
          if (canTokenUseRoute(g.player, t, r)) return false
        }
      }
      return true
    })()

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

  const onSquareClick = useCallback(
    (x: number, y: number) => {
      if (!started) return
      if (g.warning) update((s) => (s.warning = "" as any))

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
          update((s) => (s.warning = "INVALID: You can only select your own tokens." as any))
          playSound(sounds.invalid)
          return
        }
        if (selectedTokenId !== t.id) playSound(sounds.click)
        setSelectedTokenId(t.id)
      }
    },
    [started, g, update, playSound, sounds.place, sounds.click, boardMap, selectedTokenId]
  )

  useEffect(() => {
    const sel = selectedTokenId ? g.tokens.find((t) => t.in === "BOARD" && t.id === selectedTokenId) : null

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

    // 🔴 INVALID / WARNING SOUND
    if (g.warning && g.warning !== prev.warning) {
      playSound(sounds.invalid)
      return
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

    const movedKey = (lm: any) =>
      `${lm.by}|${lm.tokenId}|${lm.from.x},${lm.from.y}|${lm.to.x},${lm.to.y}`

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
  }, [g, started, playSound, sounds])

  const selected =
    selectedTokenId ? g.tokens.find((t) => t.id === selectedTokenId && t.in === "BOARD") ?? null : null

  const actions = useMemo(() => {
    return {
      setStarted,
      setAiDifficulty,
      unlockAudio,

      newGame: async () => {
        await unlockAudio()
        const ng = newGame()
        setG(ng)
        setSelectedTokenId(null)
        prevRef.current = ng
        playedGameOverSound.current = false
      },

      onSquareClick,

      playRoute: (owner: Player, routeId: string) => {
        if (!started || g.gameOver) return
        if (g.player !== owner) return

        if (g.phase === "ACTION") {
          if (earlySwapArmed) {
            update((s) => chooseSwapHandRoute(s, routeId))
            return
          }
          if (!selectedTokenId) {
            update((s) => (s.warning = "INVALID: You must select a token first." as any))
            playSound(sounds.invalid)
            return
          }
          update((s) => applyRouteMove(s, selectedTokenId, routeId))
          return
        }

        if (g.phase === "SWAP") {
          update((s) => chooseSwapHandRoute(s, routeId))
        }
      },

      pickQueueIndex: (idx: number) => update((s) => chooseSwapQueueIndex(s, idx)),
      confirmSwapAndEndTurn: () => update((s) => confirmSwapAndEndTurn(s)),

      armEarlySwap: () => update((s) => armEarlySwap(s)),
      confirmEarlySwap: () => update((s) => confirmEarlySwap(s)),
      cancelEarlySwap: () => update((s) => cancelEarlySwap(s)),

      buyExtraReinforcement: () => update((s) => buyExtraReinforcement(s)),
      yieldForced: () => update((s) => yieldForcedIfNoUsableRoutes(s)),

      setSelectedTokenId,
    }
  }, [started, g, update, unlockAudio, onSquareClick, earlySwapArmed, selectedTokenId])

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
    constants: { EARLY_SWAP_COST, EXTRA_REINFORCEMENT_COST },
    actions,
  }
}
