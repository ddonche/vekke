import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Howler } from "howler"
import { SIZE, toSq, Coord } from "./engine/coords"
import { newGame, GameState, Player, Token } from "./engine/state"
import { traceByRoute } from "./engine/move"
import type { Route } from "./engine/move"
import { aiStepBeginner, aiStepIntermediate } from "./engine/ai"
import { sounds } from "./sounds"
import { RouteIcon } from "./RouteIcon"
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
} from "./engine/game"

class ErrBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any; stack: string }
> {
  state = { err: null, stack: "" }

  static getDerivedStateFromError(err: any) {
    return { err, stack: "" }
  }

  componentDidCatch(err: any, info: any) {
    console.error("RENDER CRASH:", err)
    console.error("COMPONENT STACK:", info?.componentStack)
    this.setState({ stack: String(info?.componentStack ?? "") })
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, color: "white", background: "#111" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Render crashed</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.err?.message ?? this.state.err)}
          </pre>

          {this.state.stack && (
            <>
              <div style={{ fontWeight: 900, marginTop: 12, marginBottom: 6 }}>
                Component stack
              </div>
              <pre style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>
                {this.state.stack}
              </pre>
            </>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const [g, setG] = useState<GameState>(() => newGame())
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [human, setHuman] = useState<Player>(() => (Math.random() < 0.5 ? "W" : "B"))
  const ai: Player = human === "W" ? "B" : "W"
  const prevRef = useRef<GameState | null>(null)
  const AI_DELAY_MS = 1200
  const [aiDifficulty, setAiDifficulty] = useState<"beginner" | "intermediate">("beginner")

  const [started, setStarted] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showLogOverlay, setShowLogOverlay] = useState(false)
  
  // Screen size detection
  const [isMobile, setIsMobile] = useState(false)

  function StatRow(props: { label: string; w: number; b: number }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(75, 85, 99, 0.6)",
          background: "rgba(55, 65, 81, 0.55)",
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 900, color: "#f9fafb" }}>{props.label}</div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 64, justifyContent: "flex-end" }}>
            <span className="token-mini" />
            <span style={{ fontWeight: 900, color: "#f9fafb" }}>{props.w}</span>
          </div>

          <span style={{ opacity: 0.35, fontWeight: 900 }}>|</span>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 64 }}>
            <span className="token-mini token-mini-blue" />
            <span style={{ fontWeight: 900, color: "#f9fafb" }}>{props.b}</span>
          </div>
        </div>
      </div>
    )
  }
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const playedGameOverSound = useRef(false)

  useEffect(() => {
    if (g.gameOver && !playedGameOverSound.current) {
      sounds.gameOver.play()
      playedGameOverSound.current = true
    }

    if (!g.gameOver) {
      playedGameOverSound.current = false
    }
  }, [g.gameOver])

  const unlockAudio = useCallback(async () => {
    try {
      Howler.mute(false)
      if (Howler.ctx?.state === "suspended") {
        await Howler.ctx.resume()
      }
      sounds.move.load()
      sounds.capture.load()
      sounds.place.load()
      sounds.swap.load()
      sounds.click.load()
      sounds.gameOver.load()
      setAudioReady(true)
    } catch (e) {
      console.error("Audio unlock failed:", e)
    }
  }, [])

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

  function playSound(h: { stop: () => void; play: () => number }) {
    try {
      h.stop()
      h.play()
    } catch (e) {
      console.error("Sound play error:", e)
    }
  }

  const [ghost, setGhost] = useState<null | {
    by: Player
    from: Coord
    tokenId: string
    born: number
  }>(null)

  const GHOST_MS = 1000

  const boardMap = useMemo(() => {
    const m = new Map<string, Token>()
    for (const t of g.tokens) {
      if (t.in === "BOARD") m.set(`${t.pos.x},${t.pos.y}`, t)
    }
    return m
  }, [g.tokens])

  function update(mut: (s: GameState) => void) {
    setG((prev) => {
      const next: GameState = structuredClone(prev)
      mut(next)
      return next
    })
  }

  function onSquareClick(x: number, y: number) {
    if (!started) return

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
        update((s) => (s.warning = "NO-NO: you can only select your own tokens." as any))
        return
      }
      if (selectedTokenId !== t.id) playSound(sounds.click)
      setSelectedTokenId(t.id)
    }
  }

  function samePos(a: Coord, b: Coord) {
    return a.x === b.x && a.y === b.y
  }

  function tokenAtXY(x: number, y: number): Token | null {
    return boardMap.get(`${x},${y}`) ?? null
  }

  function canTokenUseRoute_UI(p: Player, token: Token, route: Route): boolean {
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
  }

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
          if (canTokenUseRoute_UI(g.player, t, r)) return false
        }
      }
      return true
    })()

  const earlySwapArmed = Boolean((g as any).earlySwapArmed)
  const earlySwapUsedThisTurn = Boolean((g as any).earlySwapUsedThisTurn)

  const canPickQueueForSwap =
    g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)

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

  useEffect(() => {
    if (!started) return

    const prev = prevRef.current
    prevRef.current = g
    if (!prev) return

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
  }, [g, started])

  useEffect(() => {
    if (!g.lastMove) return

    const elapsed = Date.now() - g.lastMove.moveNumber
    if (elapsed > GHOST_MS) return

    const interval = setInterval(() => {
      setGhost((prev) => ({ ...prev }))
    }, 50)

    const timeout = setTimeout(() => clearInterval(interval), GHOST_MS - elapsed)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [g.lastMove?.moveNumber])

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
    ai,
    g.log.length,
  ])

  useEffect(() => {
    if (!started) return
    if (g.player !== ai) return
    if (!g.lastMove) return
    
    setSelectedTokenId(g.lastMove.tokenId)
  }, [g.lastMove?.moveNumber, g.player, ai, started])

  const selected =
    selectedTokenId ? g.tokens.find((t) => t.id === selectedTokenId && t.in === "BOARD") ?? null : null

  // Mock player data
  const whitePlayer = {
    username: human === "W" ? "You" : "Computer",
    elo: 1842,
    avatar: human === "W" ? "Y" : "C"
  }
  const bluePlayer = {
    username: human === "B" ? "You" : "Computer",
    elo: 1798,
    avatar: human === "B" ? "Y" : "C"
  }

  // Shared Board Component
  const BoardComponent = ({ mobile = false }: { mobile?: boolean }) => {
    return (
      <div style={{
        display: mobile ? "grid" : "inline-grid",
        gridTemplateColumns: mobile ? `repeat(${SIZE}, 1fr)` : `repeat(${SIZE}, 64px)`,
        gridTemplateRows: mobile ? `repeat(${SIZE}, 1fr)` : `repeat(${SIZE}, 64px)`,
        gap: mobile ? 5 : 12,
        padding: mobile ? 10 : 24,
        background: "#374151",
        borderRadius: mobile ? 10 : 12,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        userSelect: "none",
        opacity: started ? 1 : 0.6,
        pointerEvents: started ? "auto" : "none",
        ...(mobile ? { aspectRatio: "1", width: "100%" } : {})
      }}>
        {Array.from({ length: SIZE }, (_, ry) => {
          const y = SIZE - 1 - ry
          return Array.from({ length: SIZE }, (_, x) => {
            const key = `${x},${y}`
            const sq = toSq({ x, y })
            const t = boardMap.get(key)
            const isSelected = t && t.id === selectedTokenId

            return (
              <div
                key={key}
                onClick={() => onSquareClick(x, y)}
                style={{
                  position: "relative",
                  ...(mobile ? { aspectRatio: "1" } : { width: 64, height: 64 }),
                  borderRadius: mobile ? 5 : 8,
                  background: isSelected ? "#1f2937" : "#4b5563",
                  boxShadow: isSelected ? "0 0 0 2px #3296ab" : "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
                  cursor: g.phase === "OPENING" || t ? "pointer" : "default",
                  transition: "all 0.2s",
                }}
                title={sq}
              >
                <div style={{ position: "absolute", top: mobile ? 2 : 4, left: mobile ? 3 : 6, fontSize: mobile ? 8 : 11, opacity: 0.55, color: "#9ca3af", fontWeight: 600 }}>
                  {sq}
                </div>

                {g.lastMove &&
                  (() => {
                    const lm = g.lastMove
                    const elapsed = Date.now() - lm.moveNumber

                    if (elapsed > GHOST_MS) return null
                    if (lm.from.x !== x || lm.from.y !== y) return null

                    const alpha = Math.max(0, 1 - elapsed / GHOST_MS)

                    return (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "grid",
                          placeItems: "center",
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          className={`token-${lm.by === "B" ? "blue" : "white"} token-ghost`}
                          style={{
                            ...(mobile ? { width: "75%", height: "75%" } : { width: 48, height: 48 }),
                            borderRadius: "50%",
                            position: "relative",
                            opacity: 0.4 * alpha,
                          }}
                        />
                      </div>
                    )
                  })()}

                {t && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                    <div
                      className={`token-${t.owner === "B" ? "blue" : "white"}`}
                      style={{
                        ...(mobile ? { width: "75%", height: "75%" } : { width: 48, height: 48 }),
                        borderRadius: "50%",
                        position: "relative",
                        ...(() => {
                          if (!g.lastMove || mobile) return {}
                          if (g.lastMove.tokenId !== t.id) return {}
                          if (g.lastMove.to.x !== x || g.lastMove.to.y !== y) return {}

                          const elapsed = Date.now() - g.lastMove.moveNumber
                          const FLASH_MS = 800
                          if (elapsed > FLASH_MS) return {}

                          const alpha = Math.max(0, 1 - elapsed / FLASH_MS)
                          return {
                            boxShadow: `0 0 0 ${3 * alpha}px rgba(238, 72, 76, ${0.9 * alpha}), 0 8px 20px rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4)`,
                            transform: `scale(${1 + 0.1 * alpha})`,
                          }
                        })(),
                        transition: "box-shadow 0.15s ease-out, transform 0.15s ease-out",
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })
        })}
      </div>
    )
  }

  return (
    <ErrBoundary>
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      minHeight: "100vh", 
      background: "#1f2937",
      width: "100%",
      padding: isMobile ? 0 : 16
    }}>
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #1f2937;
        }

        .token-blue {
          background: radial-gradient(circle at 30% 30%, #5de8f7, #4bb3d4 20%, #3296ab 40%, #247a91 65%, #1a5a6d);
          box-shadow: 
            inset -3px -3px 12px rgba(0, 0, 0, 0.5),
            inset 3px 3px 12px rgba(255, 255, 255, 0.6),
            inset 0 0 30px rgba(50, 150, 171, 0.2),
            0 8px 20px rgba(0, 0, 0, 0.6),
            0 4px 8px rgba(0, 0, 0, 0.4);
          transform: translateZ(0);
          filter: drop-shadow(0 2px 0 rgba(0,0,0,0.22));
        }

        .token-white {
          background: radial-gradient(circle at 30% 30%, #ffffff, #f5f5f5 15%, #c8c8c8 40%, #8e8e8e 65%, #5a5a5a);
          box-shadow: 
            inset -4px -4px 14px rgba(0, 0, 0, 0.45),
            inset 4px 4px 14px rgba(255, 255, 255, 1),
            inset 0 0 30px rgba(0, 0, 0, 0.15),
            0 8px 20px rgba(0, 0, 0, 0.6),
            0 4px 8px rgba(0, 0, 0, 0.4);
          transform: translateZ(0);
          filter: drop-shadow(0 2px 0 rgba(0,0,0,0.22));
        }

        .token-blue::before,
        .token-white::before {
          content: '';
          position: absolute;
          inset: 2px;
          border-radius: 50%;
          box-shadow:
            inset 0 1px 2px rgba(255,255,255,0.35),
            inset 0 -3px 4px rgba(0,0,0,0.45);
          pointer-events: none;
        }

        .token-blue::after,
        .token-white::after {
          content: '';
          position: absolute;
          top: 14%;
          left: 18%;
          width: 46%;
          height: 38%;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%,
            rgba(255,255,255,0.75) 0%,
            rgba(255,255,255,0.28) 28%,
            rgba(255,255,255,0.00) 70%
          );
          filter: blur(2px);
          pointer-events: none;
        }

        .token-ghost {
          opacity: 0.3;
        }

        .token-mini {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #ffffff, #f0f0f0 45%, #d8d8d8);
          box-shadow: 0 1px 2px rgba(0,0,0,0.5);
          display: inline-block;
        }

        .token-mini-blue {
          background: radial-gradient(circle at 30% 30%, #4bb3d4, #3296ab 45%, #247a91);
        }

        .modal-backdrop{
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          display: grid;
          place-items: center;
          z-index: 9999;
        }

        .modal{
          background: #121212;
          color: #eee;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 12px;
          padding: 16px;
          width: min(520px, calc(100vw - 24px));
          box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        }

        .modal-title{
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 10px;
        }

        .modal-stats{ display: grid; gap: 8px; margin: 12px 0; }
        .stat-row{ display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

        .modal-actions{ display: flex; justify-content: flex-end; gap: 10px; }
      `}</style>

      {!started && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
          }}
        >
          <div style={{ width: 520, maxWidth: "92vw", padding: 18, borderRadius: 14, background: "white", border: "2px solid #111" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => setAiDifficulty("beginner")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "2px solid #111",
                  background: aiDifficulty === "beginner" ? "#111" : "white",
                  color: aiDifficulty === "beginner" ? "white" : "#111",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Beginner AI
              </button>
              <button
                onClick={() => setAiDifficulty("intermediate")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "2px solid #111",
                  background: aiDifficulty === "intermediate" ? "#111" : "white",
                  color: aiDifficulty === "intermediate" ? "white" : "#111",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Intermediate AI
              </button>
            </div>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Start Game</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 14, lineHeight: 1.35 }}>
              Select your opponent's difficulty level and begin a new game.
            </div>
            <button
              onClick={async () => {
                await unlockAudio()
                setStarted(true)
                try {
                  if (audioReady) playSound(sounds.click)
                } catch {}
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "2px solid #111",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{
        width: "100%",
        borderBottom: "1px solid #374151",
        padding: isMobile ? "8px 12px" : "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#111827",
        marginBottom: isMobile ? 0 : 12,
      }}>
        <div style={{ fontWeight: 900, fontSize: isMobile ? 16 : 20, color: "#f9fafb" }}>Vekke</div>
      </div>

      {/* GAME INFO BAR */}
      <div style={{
        width: "100%",
        maxWidth: isMobile ? "100%" : 1200,
        padding: isMobile ? "6px 12px" : "8px 16px",
        fontSize: isMobile ? 10 : 13,
        textAlign: "center",
        background: "#374151",
        borderRadius: isMobile ? 0 : 8,
        marginBottom: isMobile ? 0 : 16,
        color: "#d1d5db",
        alignSelf: "center"
      }}>
        <b>Phase:</b> {g.phase} | <b>Round:</b> {g.round} | <b>Void:</b> {g.void.W + g.void.B}
      </div>

      {/* CONDITIONAL RENDERING BASED ON SCREEN SIZE */}
      {isMobile ? (
        /* MOBILE LAYOUT */
        <div style={{ width: "100%", flex: 1, display: "flex", flexDirection: "column", overflow: "auto", padding: 8 }}>
          {/* White player */}
          <div style={{
            padding: "6px 8px",
            background: "#374151",
            borderRadius: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 11,
            marginBottom: 6,
            color: "#d1d5db",
            boxShadow: g.player === "W" ? "0 0 0 2px #3296ab" : "none"
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              color: "white",
              fontSize: 16
            }}>{whitePlayer.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 12, color: "#f9fafb" }}>{whitePlayer.username}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>⭐ {whitePlayer.elo} ELO</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 9, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Res</span>
                {Array.from({ length: g.reserves.W }).map((_, i) => (
                  <span key={i} className="token-mini" />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 9, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Cap</span>
                {Array.from({ length: g.captives.W }).map((_, i) => (
                  <span key={i} className="token-mini token-mini-blue" />
                ))}
              </div>
            </div>
          </div>

          {/* White routes */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 6 }}>
            {g.routes.W.map((r) => {
              const isActive = g.player === "W"
              const used = isActive && g.phase === "ACTION" && g.usedRoutes.includes(r.id)
              const pickedForSwap =
                isActive && (g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)) && g.pendingSwap.handRouteId === r.id

              return (
                <button
                  key={`W-${r.id}`}
                  onClick={() => {
                    if (!isActive || g.gameOver) return

                    if (g.phase === "ACTION") {
                      if (earlySwapArmed) {
                        update((s) => chooseSwapHandRoute(s, r.id))
                        return
                      }
                      if (!selectedTokenId) {
                        update((s) => (s.warning = "NO-NO: select a token first." as any))
                        return
                      }
                      update((s) => applyRouteMove(s, selectedTokenId, r.id))
                    } else if (g.phase === "SWAP") {
                      update((s) => chooseSwapHandRoute(s, r.id))
                    }
                  }}
                  disabled={!isActive || used}
                  style={{
                    padding: "6px 4px",
                    borderRadius: 6,
                    border: pickedForSwap ? "2px solid #3296ab" : "1px solid #4b5563",
                    background: used ? "#1f2937" : "#374151",
                    fontWeight: 900,
                    fontSize: 10,
                    textAlign: "center",
                    cursor: isActive && !used ? "pointer" : "default",
                    minHeight: 44,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#f9fafb",
                    opacity: !isActive ? 0.5 : used ? 0.3 : 1
                  }}
                >
                  <RouteIcon route={r} />
                  <div style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>{r.id}</div>
                </button>
              )
            })}
          </div>

          {/* Board */}
          <div style={{ marginBottom: 6 }}>
            <BoardComponent mobile={true} />
            <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 4, textAlign: "center" }}>
              {g.phase === "REINFORCE" ? (
                <>
                  Reinforcement — <b style={{ color: "#d1d5db" }}>{g.player}</b> place {g.reinforcementsToPlace} token(s)
                </>
              ) : g.phase === "OPENING" ? (
                <>
                  Opening — <b style={{ color: "#d1d5db" }}>{g.player}</b> places (B {g.openingPlaced.B}/3, W {g.openingPlaced.W}/3)
                </>
              ) : (
                <>
                  Selected: <b style={{ color: "#d1d5db" }}>{selected ? `${selected.id} (${toSq(selected.pos)})` : "none"}</b>
                </>
              )}
            </div>
          </div>

          {/* Blue routes */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 6 }}>
            {g.routes.B.map((r) => {
              const isActive = g.player === "B"
              const used = isActive && g.phase === "ACTION" && g.usedRoutes.includes(r.id)
              const pickedForSwap =
                isActive && (g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)) && g.pendingSwap.handRouteId === r.id

              return (
                <button
                  key={`B-${r.id}`}
                  onClick={() => {
                    if (!isActive || g.gameOver) return

                    if (g.phase === "ACTION") {
                      if (earlySwapArmed) {
                        update((s) => chooseSwapHandRoute(s, r.id))
                        return
                      }
                      if (!selectedTokenId) {
                        update((s) => (s.warning = "NO-NO: select a token first." as any))
                        return
                      }
                      update((s) => applyRouteMove(s, selectedTokenId, r.id))
                    } else if (g.phase === "SWAP") {
                      update((s) => chooseSwapHandRoute(s, r.id))
                    }
                  }}
                  disabled={!isActive || used}
                  style={{
                    padding: "6px 4px",
                    borderRadius: 6,
                    border: pickedForSwap ? "2px solid #3296ab" : "1px solid #4b5563",
                    background: used ? "#1f2937" : "#374151",
                    fontWeight: 900,
                    fontSize: 10,
                    textAlign: "center",
                    cursor: isActive && !used ? "pointer" : "default",
                    minHeight: 44,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#f9fafb",
                    opacity: !isActive ? 0.5 : used ? 0.3 : 1
                  }}
                >
                  <RouteIcon route={r} />
                  <div style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>{r.id}</div>
                </button>
              )
            })}
          </div>

          {/* Blue player */}
          <div style={{
            padding: "6px 8px",
            background: "#374151",
            borderRadius: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 11,
            marginBottom: 6,
            color: "#d1d5db",
            boxShadow: g.player === "B" ? "0 0 0 2px #3296ab" : "none"
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #4bb3d4 0%, #247a91 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              color: "white",
              fontSize: 16
            }}>{bluePlayer.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 12, color: "#4bb3d4" }}>{bluePlayer.username}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>⭐ {bluePlayer.elo} ELO</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 9, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Res</span>
                {Array.from({ length: g.reserves.B }).map((_, i) => (
                  <span key={i} className="token-mini token-mini-blue" />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 9, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Cap</span>
                {Array.from({ length: g.captives.B }).map((_, i) => (
                  <span key={i} className="token-mini" />
                ))}
              </div>
            </div>
          </div>

          {/* Queue */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 11, marginBottom: 4, color: "#f9fafb", textAlign: "center" }}>Queue</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {g.queue.map((r, idx) => {
                const picked = canPickQueueForSwap && g.pendingSwap.queueIndex === idx

                return (
                  <button
                    key={`${r.id}-${idx}`}
                    onClick={() => update((s) => chooseSwapQueueIndex(s, idx))}
                    disabled={!canPickQueueForSwap}
                    style={{
                      padding: "6px 4px",
                      borderRadius: 6,
                      border: picked ? "2px solid #3296ab" : "1px solid #4b5563",
                      background: "#374151",
                      fontWeight: 900,
                      fontSize: 10,
                      textAlign: "center",
                      cursor: canPickQueueForSwap ? "pointer" : "default",
                      minHeight: 44,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#f9fafb",
                      opacity: canPickQueueForSwap ? 1 : 0.6
                    }}
                  >
                    <RouteIcon route={r} />
                    <div style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>{r.id}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* SWAP CONFIRMATION BUTTON */}
          {g.phase === "SWAP" && (
            <button
              onClick={() => update((s) => confirmSwapAndEndTurn(s))}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "2px solid #3296ab",
                background: "#374151",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                color: "#f9fafb",
                marginBottom: 4
              }}
            >
              Confirm Swap & End Turn
            </button>
          )}

          {/* EARLY SWAP BUTTONS */}
          {g.phase === "ACTION" && earlySwapArmed && (
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <button
                onClick={() => update((s) => confirmEarlySwap(s))}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  border: "2px solid #3296ab",
                  background: "#374151",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                  color: "#f9fafb",
                }}
              >
                Confirm Early Swap
              </button>
              <button
                onClick={() => update((s) => cancelEarlySwap(s))}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "1px solid #4b5563",
                  background: "transparent",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                  color: "#f9fafb",
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {g.phase === "ACTION" && !g.gameOver && (
            <button
              onClick={() => update((s) => buyExtraReinforcement(s))}
              disabled={!canBuyExtraReinforcement}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "2px solid #111",
                background: "white",
                fontWeight: 900,
                fontSize: 12,
                cursor: canBuyExtraReinforcement ? "pointer" : "default",
                opacity: canBuyExtraReinforcement ? 1 : 0.6,
                marginBottom: 4,
              }}
              title={`Pay ${EXTRA_REINFORCEMENT_COST} reserve token(s) → your Void to buy +1 reinforcement this turn.`}
            >
              Buy +1 Reinforcement
            </button>
          )}

          {/* FORCED YIELD */}
          {forcedYieldAvailable && (
            <button
              onClick={() => update((s) => yieldForcedIfNoUsableRoutes(s))}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "2px solid #4b5563",
                background: "#374151",
                fontWeight: 900,
                fontSize: 11,
                cursor: "pointer",
                color: "#f9fafb",
                marginBottom: 4
              }}
            >
              No usable routes — Yield {remainingRoutes.length} to Void
            </button>
          )}

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "2px solid #4b5563",
                background: "#374151",
                fontWeight: 900,
                fontSize: 12,
                cursor: "pointer",
                color: "#f9fafb",
              }}
              onClick={() => setShowActionsMenu(true)}
            >
              ☰ Special Actions
            </button>
            <button
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "2px solid #4b5563",
                background: "#374151",
                fontWeight: 900,
                fontSize: 12,
                cursor: "pointer",
                color: "#f9fafb",
              }}
              onClick={() => setShowLogOverlay(true)}
            >
              📜 Game Log
            </button>
          </div>
        </div>
      ) : (
        /* DESKTOP LAYOUT */
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "center", maxWidth: 1400, width: "100%", alignSelf: "center" }}>
          {/* LEFT - Log */}
          <div style={{ width: 350 }}>
            <div style={{ padding: 12, border: "1px solid #4b5563", borderRadius: 10, background: "#374151" }}>
              <div style={{ fontWeight: 900, marginBottom: 8, color: "#f9fafb" }}>Log</div>
              <div
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  lineHeight: 1.4,
                  maxHeight: 600,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  color: "#d1d5db",
                }}
              >
                {g.log.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Click squares to place opening tokens (Blue first). Then play.</div>
                ) : (
                  g.log.map((l, i) => <div key={i}>{l}</div>)
                )}
              </div>
            </div>
          </div>

          {/* MIDDLE - Board */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* White player */}
            <div style={{
              padding: "10px 12px",
              background: "#374151",
              borderRadius: 10,
              display: "flex",
              gap: 12,
              alignItems: "center",
              fontSize: 13,
              color: "#d1d5db",
              boxShadow: g.player === "W" ? "0 0 0 3px #3296ab" : "none"
            }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "white",
                fontSize: 18
              }}>{whitePlayer.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#f9fafb" }}>{whitePlayer.username}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>⭐ {whitePlayer.elo} ELO</div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Res</span>
                  {Array.from({ length: g.reserves.W }).map((_, i) => (
                    <span key={i} className="token-mini" />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Cap</span>
                  {Array.from({ length: g.captives.W }).map((_, i) => (
                    <span key={i} className="token-mini token-mini-blue" />
                  ))}
                </div>
              </div>
            </div>

            {/* Board */}
            <div>
              {g.warning && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: 10,
                    border: "2px solid #ef4444",
                    background: "#fee2e2",
                    fontWeight: 900,
                    color: "#991b1b",
                  }}
                >
                  {g.warning}
                </div>
              )}

              <BoardComponent mobile={false} />

              <div style={{ marginTop: 10, fontSize: 13, color: "#d1d5db" }}>
                {g.phase === "REINFORCE" ? (
                  <>
                    Reinforcement — <b>{g.player}</b> place {g.reinforcementsToPlace} token(s) (empty spaces only).
                  </>
                ) : g.phase === "OPENING" ? (
                  <>
                    Opening placement — <b>{g.player}</b> places now. (Placed: B {g.openingPlaced.B}/3, W{" "}
                    {g.openingPlaced.W}/3)
                  </>
                ) : (
                  <>
                    Selected: <b>{selected ? `${selected.id} (${toSq(selected.pos)})` : "none"}</b>
                  </>
                )}
              </div>
            </div>

            {/* Blue player */}
            <div style={{
              padding: "10px 12px",
              background: "#374151",
              borderRadius: 10,
              display: "flex",
              gap: 12,
              alignItems: "center",
              fontSize: 13,
              color: "#d1d5db",
              boxShadow: g.player === "B" ? "0 0 0 3px #3296ab" : "none"
            }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #4bb3d4 0%, #247a91 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "white",
                fontSize: 18
              }}>{bluePlayer.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#4bb3d4" }}>{bluePlayer.username}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>⭐ {bluePlayer.elo} ELO</div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Res</span>
                  {Array.from({ length: g.reserves.B }).map((_, i) => (
                    <span key={i} className="token-mini token-mini-blue" />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af", marginRight: 3, fontWeight: 600 }}>Cap</span>
                  {Array.from({ length: g.captives.B }).map((_, i) => (
                    <span key={i} className="token-mini" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT - Routes */}
          <div style={{ width: 460, opacity: started ? 1 : 0.6, pointerEvents: started ? "auto" : "none" }}>
            {/* Queue */}
            <div style={{ padding: 12, border: "1px solid #4b5563", borderRadius: 10, background: "#374151", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8, color: "#f9fafb" }}>Route Queue</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {g.queue.map((r, idx) => {
                  const picked = canPickQueueForSwap && g.pendingSwap.queueIndex === idx

                  return (
                    <button
                      key={`${r.id}-${idx}`}
                      onClick={() => update((s) => chooseSwapQueueIndex(s, idx))}
                      disabled={!canPickQueueForSwap}
                      style={{
                        padding: "12px 8px",
                        borderRadius: 8,
                        border: picked ? "2px solid #3296ab" : "1px solid #4b5563",
                        background: "#374151",
                        fontWeight: 900,
                        fontSize: 11,
                        textAlign: "center",
                        cursor: canPickQueueForSwap ? "pointer" : "default",
                        minHeight: 60,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#f9fafb",
                        opacity: canPickQueueForSwap ? 1 : 0.6
                      }}
                    >
                      <RouteIcon route={r} />
                      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{r.id}</div>
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
                Tournament mode: queue is always visible.
              </div>
            </div>

            {forcedYieldAvailable && (
              <button
                onClick={() => update((s) => yieldForcedIfNoUsableRoutes(s))}
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "2px solid #4b5563",
                  background: "#374151",
                  fontWeight: 900,
                  cursor: "pointer",
                  width: "100%",
                  color: "#f9fafb",
                }}
              >
                No usable routes — Yield {remainingRoutes.length} to Void (forced)
              </button>
            )}

            {g.phase === "ACTION" && !g.gameOver && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => update((s) => armEarlySwap(s))}
                  disabled={!canEarlySwap}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "2px solid #4b5563",
                    background: "#374151",
                    fontWeight: 900,
                    cursor: canEarlySwap ? "pointer" : "default",
                    opacity: canEarlySwap ? 1 : 0.5,
                    flex: 1,
                    fontSize: 12,
                    color: "#f9fafb",
                  }}
                >
                  Early Route Swap
                </button>

                <button
                  onClick={() => update((s) => buyExtraReinforcement(s))}
                  disabled={!canBuyExtraReinforcement}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "2px solid #4b5563",
                    background: "#374151",
                    fontWeight: 900,
                    cursor: canBuyExtraReinforcement ? "pointer" : "default",
                    opacity: canBuyExtraReinforcement ? 1 : 0.5,
                    fontSize: 12,
                    color: "#f9fafb",
                  }}
                  title={`Pay ${EXTRA_REINFORCEMENT_COST} reserve token(s) → your Void to buy +1 reinforcement this turn.`}
                >
                  +1 Reinforcement
                </button>

                {earlySwapArmed && (
                  <>
                    <button
                      onClick={() => update((s) => confirmEarlySwap(s))}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "2px solid #4b5563",
                        background: "#374151",
                        fontWeight: 900,
                        cursor: "pointer",
                        fontSize: 12,
                        color: "#f9fafb",
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => update((s) => cancelEarlySwap(s))}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #4b5563",
                        background: "transparent",
                        fontWeight: 900,
                        cursor: "pointer",
                        fontSize: 12,
                        color: "#f9fafb",
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Routes */}
            <div style={{ padding: 12, border: "1px solid #4b5563", borderRadius: 10, background: "#374151" }}>
              <div style={{ fontWeight: 900, marginBottom: 8, color: "#f9fafb" }}>Routes (Tournament: Open Hands)</div>

              {g.phase === "OPENING" ? (
                <div style={{ fontSize: 12, color: "#9ca3af" }}>Routes are dealt after opening placement.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {/* WHITE */}
                  <div style={{ padding: 10, border: "1px solid #4b5563", borderRadius: 10, background: "#1f2937" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 12, color: "#f9fafb" }}>W Route Set</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                      {g.routes.W.map((r) => {
                        const isActive = g.player === "W"
                        const used = isActive && g.phase === "ACTION" && g.usedRoutes.includes(r.id)
                        const pickedForSwap =
                          isActive && (g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)) && g.pendingSwap.handRouteId === r.id

                        return (
                          <button
                            key={`W-${r.id}`}
                            onClick={(e) => {
                              if (!isActive) return
                              if (g.gameOver) return

                              if (g.phase === "ACTION") {
                                if (earlySwapArmed) {
                                  update((s) => chooseSwapHandRoute(s, r.id))
                                  return
                                }

                                if (!selectedTokenId) {
                                  update((s) => (s.warning = "NO-NO: select a token first." as any))
                                  return
                                }

                                update((s) => applyRouteMove(s, selectedTokenId, r.id))
                              } else if (g.phase === "SWAP") {
                                update((s) => chooseSwapHandRoute(s, r.id))
                              }
                            }}
                            disabled={!isActive || (g.phase === "ACTION" ? used : g.phase !== "SWAP")}
                            style={{
                              padding: "12px 8px",
                              borderRadius: 8,
                              border: pickedForSwap ? "2px solid #3296ab" : "1px solid #4b5563",
                              background: used ? "#1f2937" : "#374151",
                              fontWeight: 900,
                              fontSize: 11,
                              textAlign: "center",
                              cursor: isActive && ((g.phase === "ACTION" && !used) || g.phase === "SWAP") ? "pointer" : "default",
                              minHeight: 60,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#f9fafb",
                              opacity: !isActive ? 0.5 : used ? 0.3 : 1
                            }}
                          >
                            <RouteIcon route={r} />
                            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{r.id}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* BLUE */}
                  <div style={{ padding: 10, border: "1px solid #4b5563", borderRadius: 10, background: "#1f2937" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 12, color: "#4bb3d4" }}>B Route Set</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                      {g.routes.B.map((r) => {
                        const isActive = g.player === "B"
                        const used = isActive && g.phase === "ACTION" && g.usedRoutes.includes(r.id)
                        const pickedForSwap =
                          isActive && (g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)) && g.pendingSwap.handRouteId === r.id

                        return (
                          <button
                            key={`B-${r.id}`}
                            onClick={() => {
                              if (!isActive) return
                              if (g.gameOver) return

                              if (g.phase === "ACTION") {
                                if (earlySwapArmed) {
                                  update((s) => chooseSwapHandRoute(s, r.id))
                                  return
                                }

                                if (!selectedTokenId) {
                                  update((s) => (s.warning = "NO-NO: select a token first." as any))
                                  return
                                }
                                update((s) => applyRouteMove(s, selectedTokenId, r.id))
                              } else if (g.phase === "SWAP") {
                                update((s) => chooseSwapHandRoute(s, r.id))
                              }
                            }}
                            disabled={!isActive || (g.phase === "ACTION" ? used : g.phase !== "SWAP")}
                            style={{
                              padding: "12px 8px",
                              borderRadius: 8,
                              border: pickedForSwap ? "2px solid #3296ab" : "1px solid #4b5563",
                              background: used ? "#1f2937" : "#374151",
                              fontWeight: 900,
                              fontSize: 11,
                              textAlign: "center",
                              cursor: isActive && ((g.phase === "ACTION" && !used) || g.phase === "SWAP") ? "pointer" : "default",
                              minHeight: 60,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#f9fafb",
                              opacity: !isActive ? 0.5 : used ? 0.3 : 1
                            }}
                          >
                            <RouteIcon route={r} />
                            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{r.id}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Swap confirm */}
                  {g.phase === "SWAP" && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => update((s) => confirmSwapAndEndTurn(s))}
                        style={{
                          padding: "12px 12px",
                          borderRadius: 10,
                          border: "2px solid #4b5563",
                          background: "#374151",
                          fontWeight: 900,
                          cursor: "pointer",
                          color: "#f9fafb",
                        }}
                      >
                        Confirm Swap & End Turn
                      </button>
                      <div style={{ fontSize: 11, color: "#9ca3af", alignSelf: "center" }}>
                        Pick 1 from your hand and 1 from the queue.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE-ONLY OVERLAYS */}
      {isMobile && (
        <>
          <div style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#374151",
            borderTop: "2px solid #4b5563",
            borderRadius: "12px 12px 0 0",
            padding: 16,
            boxShadow: "0 -4px 12px rgba(0,0,0,0.5)",
            transform: showActionsMenu ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.3s",
            zIndex: 2000,
            maxHeight: "50vh",
            overflowY: "auto"
          }}>
            <button onClick={() => setShowActionsMenu(false)} style={{
              width: "100%",
              padding: 12,
              margin: "6px 0",
              border: "1px solid #4b5563",
              borderRadius: 8,
              background: "#4b5563",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
              textAlign: "left",
              color: "#f9fafb",
            }}>✕ Close</button>
            <button
              onClick={() => {
                if (canEarlySwap) {
                  update((s) => armEarlySwap(s))
                  setShowActionsMenu(false)
                }
              }}
              disabled={!canEarlySwap}
              style={{
                width: "100%",
                padding: 12,
                margin: "6px 0",
                border: "1px solid #4b5563",
                borderRadius: 8,
                background: "#1f2937",
                fontWeight: 900,
                fontSize: 13,
                cursor: canEarlySwap ? "pointer" : "default",
                textAlign: "left",
                color: "#f9fafb",
                opacity: canEarlySwap ? 1 : 0.5
              }}
            >
              🔄 Early Route Swap
            </button>
            <button disabled style={{
              width: "100%",
              padding: 12,
              margin: "6px 0",
              border: "1px solid #4b5563",
              borderRadius: 8,
              background: "#1f2937",
              fontWeight: 900,
              fontSize: 13,
              cursor: "default",
              textAlign: "left",
              color: "#f9fafb",
              opacity: 0.5
            }}>➕ Extra Reinforcement</button>
            <button disabled style={{
              width: "100%",
              padding: 12,
              margin: "6px 0",
              border: "1px solid #4b5563",
              borderRadius: 8,
              background: "#1f2937",
              fontWeight: 900,
              fontSize: 13,
              cursor: "default",
              textAlign: "left",
              color: "#f9fafb",
              opacity: 0.5
            }}>🏃 Evasion</button>
            <button disabled style={{
              width: "100%",
              padding: 12,
              margin: "6px 0",
              border: "1px solid #4b5563",
              borderRadius: 8,
              background: "#1f2937",
              fontWeight: 900,
              fontSize: 13,
              cursor: "default",
              textAlign: "left",
              color: "#f9fafb",
              opacity: 0.5
            }}>🔀 Mulligan</button>
          </div>

          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            display: showLogOverlay ? "flex" : "none",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20
          }} onClick={(e) => {
            if (e.target === e.currentTarget) setShowLogOverlay(false)
          }}>
            <div style={{
              background: "#374151",
              borderRadius: 12,
              padding: 16,
              maxWidth: "90vw",
              maxHeight: "70vh",
              overflowY: "auto",
              border: "2px solid #4b5563"
            }}>
              <div style={{
                fontWeight: 900,
                fontSize: 16,
                color: "#f9fafb",
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                Game Log
                <button onClick={() => setShowLogOverlay(false)} style={{
                  background: "#4b5563",
                  border: "none",
                  color: "#f9fafb",
                  fontSize: 20,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>×</button>
              </div>
              <div style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                color: "#d1d5db",
                lineHeight: 1.6
              }}>
                {g.log.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>No log entries yet.</div>
                ) : (
                  g.log.map((l, i) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid rgba(75, 85, 99, 0.3)" }}>{l}</div>)
                )}
              </div>
            </div>
          </div>
        </>
      )}
    {g.gameOver && (
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Game Over"
      >
        <div
          className="modal"
          style={{
            background: "#374151",
            border: "1px solid #4b5563",
            borderRadius: 12,
            padding: 16,
            color: "#f9fafb",
            width: "min(520px, calc(100vw - 24px))",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          }}
        >
          {/* Title */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 0.5 }}>
              GAME OVER
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #4b5563",
                background: "#1f2937",
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              <span className={g.gameOver.winner === "W" ? "token-mini" : "token-mini token-mini-blue"} />
              <span style={{ color: g.gameOver.winner === "W" ? "#f9fafb" : "#4bb3d4" }}>
                {g.gameOver.winner === "B" ? "BLUE" : "WHITE"} WINS
              </span>
            </div>
          </div>

          {/* Summary strip */}
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #4b5563",
              background: "#1f2937",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              fontSize: 12,
              color: "#d1d5db",
            }}
          >
            <div>
              <div style={{ opacity: 0.7, fontWeight: 800, marginBottom: 4 }}>Rounds</div>
              <div style={{ fontWeight: 900, fontSize: 16, color: "#f9fafb" }}>{g.round}</div>
            </div>

            <div>
              <div style={{ opacity: 0.7, fontWeight: 800, marginBottom: 4 }}>Mode</div>
              <div style={{ fontWeight: 900, fontSize: 16, color: "#f9fafb" }}>Tournament</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8, color: "#f9fafb" }}>Match Stats</div>

            <div
              style={{
                border: "1px solid #4b5563",
                background: "#1f2937",
                borderRadius: 10,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <StatRow label="Sieges" w={g.stats.sieges.W} b={g.stats.sieges.B} />
              <StatRow label="Drafts" w={g.stats.drafts.W} b={g.stats.drafts.B} />
              <StatRow label="Captures" w={g.stats.captures.W} b={g.stats.captures.B} />
              <StatRow label="Invades" w={g.stats.invades.W} b={g.stats.invades.B} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <button
              onClick={() => {
                setG(newGame())
                setSelectedTokenId(null)
                prevRef.current = null
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "2px solid #111",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              New Game
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  </ErrBoundary>
  )
}

export default App