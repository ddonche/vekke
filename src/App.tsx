import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Howler } from "howler"
import { SIZE, toSq, Coord } from "./engine/coords"
import { newGame, GameState, Player, Token } from "./engine/state"
import { traceByRoute } from "./engine/move"
import type { Route } from "./engine/move"
import { aiStep } from "./engine/ai"
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
} from "./engine/game"

function App() {
  const [g, setG] = useState<GameState>(() => newGame())
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [human, setHuman] = useState<Player>(() => (Math.random() < 0.5 ? "W" : "B"))
  const ai: Player = human === "W" ? "B" : "W"
  const prevRef = useRef<GameState | null>(null)
  const AI_DELAY_MS = 1200

  const [started, setStarted] = useState(false)
  const [audioReady, setAudioReady] = useState(false)

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
      update((s) => aiStep(s, ai))
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
  ])

  useEffect(() => {
    if (!started) return
    if (g.player !== ai) return
    if (!g.lastMove) return
    
    // Update selection to show which token the AI just moved
    setSelectedTokenId(g.lastMove.tokenId)
  }, [g.lastMove?.moveNumber, g.player, ai, started])

  const selected =
    selectedTokenId ? g.tokens.find((t) => t.id === selectedTokenId && t.in === "BOARD") ?? null : null

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <style>{`
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

        .token-blue-small {
          background: radial-gradient(circle at 30% 30%, #5de8f7, #4bb3d4 20%, #3296ab 40%, #247a91 65%, #1a5a6d);
          box-shadow: 
            inset -1px -1px 5px rgba(0, 0, 0, 0.5),
            inset 1px 1px 5px rgba(255, 255, 255, 0.6),
            inset 0 0 12px rgba(50, 150, 171, 0.2),
            0 3px 8px rgba(0, 0, 0, 0.6),
            0 2px 3px rgba(0, 0, 0, 0.4);
          transform: translateZ(0);
          filter: drop-shadow(0 1px 0 rgba(0,0,0,0.22));
        }

        .token-white-small {
          background: radial-gradient(circle at 30% 30%, #ffffff, #f5f5f5 15%, #c8c8c8 40%, #8e8e8e 65%, #5a5a5a);
          box-shadow: 
            inset -2px -2px 6px rgba(0, 0, 0, 0.45),
            inset 2px 2px 6px rgba(255, 255, 255, 1),
            inset 0 0 12px rgba(0, 0, 0, 0.15),
            0 3px 8px rgba(0, 0, 0, 0.6),
            0 2px 3px rgba(0, 0, 0, 0.4);
          transform: translateZ(0);
          filter: drop-shadow(0 1px 0 rgba(0,0,0,0.22));
        }

        .token-blue-small::before,
        .token-white-small::before {
          content: '';
          position: absolute;
          inset: 1px;
          border-radius: 50%;
          box-shadow:
            inset 0 0.5px 1px rgba(255,255,255,0.35),
            inset 0 -1px 2px rgba(0,0,0,0.45);
          pointer-events: none;
        }

        .token-blue-small::after,
        .token-white-small::after {
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
          filter: blur(1px);
          pointer-events: none;
        }

        .grid-square:hover {
          background: #6b7280 !important;
        }

        .grid-square:hover:has(.token-blue),
        .grid-square:hover:has(.token-white) {
          background: #4b5563 !important;
        }
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
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Start Game</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 14, lineHeight: 1.35 }}>
              Click start to enable audio. This is required by browsers so the very first computer placement can play sound.
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

      <h1 style={{ margin: "0 0 10px 0" }}>Vekke — Tournament (Local)</h1>

      <button
        onClick={() => {
          const side = Math.random() < 0.5 ? "W" : "B"
          setHuman(side)
          setSelectedTokenId(null)
          setG(newGame())
          prevRef.current = null
          setStarted(false)
          setAudioReady(false)
        }}
        style={{
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #333",
          background: "white",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        New Game (random side)
      </button>

      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>
        <b>You:</b> {human} &nbsp;|&nbsp; <b>Computer:</b> {ai}
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
        {started && g.player === ai && !g.gameOver ? "Computer thinking…" : "\u00A0"}
      </div>

      {/* 3-COLUMN LAYOUT */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "center" }}>
        {/* LEFT COLUMN - Log */}
        <div style={{ width: 350 }}>
          <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Log</div>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                lineHeight: 1.4,
                maxHeight: 600,
                overflow: "auto",
                whiteSpace: "pre-wrap",
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

        {/* MIDDLE COLUMN - Board with player areas */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* WHITE RESERVES & CAPTIVES */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10, background: "#f9f9f9" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>W Reserves: {g.reserves.W}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, width: 180, minHeight: 40 }}>
                {Array.from({ length: g.reserves.W }).map((_, i) => (
                  <div
                    key={i}
                    className="token-white-small"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      position: "relative",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10, background: "#f9f9f9" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>W Captives: {g.captives.W}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, width: 180, minHeight: 40 }}>
                {Array.from({ length: g.captives.W }).map((_, i) => (
                  <div
                    key={i}
                    className="token-blue-small"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      position: "relative",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* BOARD */}
          <div>
            <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.85 }}>
              <b>Phase:</b> {g.phase} &nbsp;|&nbsp; <b>Player:</b> {g.player} &nbsp;|&nbsp; <b>Round:</b> {g.round}
              &nbsp;|&nbsp; <b>Void:</b> {g.voidCount}
            </div>

            {g.warning && (
              <div
                style={{
                  marginBottom: 10,
                  padding: 10,
                  borderRadius: 10,
                  border: "2px solid #111",
                  background: "#fff2f2",
                  fontWeight: 900,
                }}
              >
                {g.warning}
              </div>
            )}

            <div
              style={{
                display: "inline-grid",
                gridTemplateColumns: `repeat(${SIZE}, 64px)`,
                gridTemplateRows: `repeat(${SIZE}, 64px)`,
                gap: 12,
                padding: 24,
                background: "#374151",
                borderRadius: 12,
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                userSelect: "none",
                opacity: started ? 1 : 0.6,
                pointerEvents: started ? "auto" : "none",
              }}
            >
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
                      className="grid-square"
                      style={{
                        position: "relative",
                        width: 64,
                        height: 64,
                        borderRadius: 8,
                        background: isSelected ? "#1f2937" : "#4b5563",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
                        cursor: g.phase === "OPENING" || t ? "pointer" : "default",
                        transition: "all 0.2s",
                      }}
                      title={sq}
                    >
                      <div style={{ position: "absolute", top: 4, left: 6, fontSize: 11, opacity: 0.55, color: "#9ca3af", fontWeight: 600 }}>
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
                                  width: 48,
                                  height: 48,
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
                              width: 48,
                              height: 48,
                              borderRadius: "50%",
                              position: "relative",
                              ...(() => {
                                if (!g.lastMove) return {}
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

            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
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

          {/* BLUE RESERVES & CAPTIVES */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10, background: "#f9f9f9" }}>
              <div style={{ fontWeight: 900, marginBottom: 6, color: "#3296ab" }}>B Reserves: {g.reserves.B}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, width: 180, minHeight: 40 }}>
                {Array.from({ length: g.reserves.B }).map((_, i) => (
                  <div
                    key={i}
                    className="token-blue-small"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      position: "relative",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10, background: "#f9f9f9" }}>
              <div style={{ fontWeight: 900, marginBottom: 6, color: "#3296ab" }}>B Captives: {g.captives.B}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, width: 180, minHeight: 40 }}>
                {Array.from({ length: g.captives.B }).map((_, i) => (
                  <div
                    key={i}
                    className="token-white-small"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      position: "relative",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Routes */}
        <div style={{ width: 460, opacity: started ? 1 : 0.6, pointerEvents: started ? "auto" : "none" }}>
          {/* Queue */}
          <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Route Queue (Face-Up)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {g.queue.map((r, idx) => {
                const picked = g.phase === "SWAP" && g.pendingSwap.queueIndex === idx
                return (
                  <button
                    key={`${r.id}-${idx}`}
                    onClick={() => update((s) => chooseSwapQueueIndex(s, idx))}
                    disabled={g.phase !== "SWAP"}
                    style={{
                      padding: "14px 10px",
                      borderRadius: 10,
                      border: picked ? "3px solid #111" : "1px solid #333",
                      background: "white",
                      fontWeight: 900,
                      cursor: g.phase === "SWAP" ? "pointer" : "default",
                      opacity: g.phase === "SWAP" ? 1 : 0.6,
                    }}
                    title="Pick this queue route for your end-of-turn swap"
                  >
                    <RouteIcon route={r} />
                    <div style={{ fontSize: 11, marginTop: 4 }}>{r.id}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              Tournament mode: queue is always visible. No peek action exists.
            </div>
          </div>

          {forcedYieldAvailable && (
            <button
              onClick={() => update((s) => yieldForcedIfNoUsableRoutes(s))}
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "2px solid #111",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
              title="Forced only: none of your remaining routes are usable by any token."
            >
              No usable routes — Yield {remainingRoutes.length} to Void (forced)
            </button>
          )}

          {/* Hand */}
          <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Routes (Tournament: Open Hands)</div>

            {g.phase === "OPENING" ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>Routes are dealt after opening placement.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {/* WHITE */}
                <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>W Route Set</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                    {g.routes.W.map((r) => {
                      const isActive = g.player === "W"
                      const used = isActive && g.phase === "ACTION" && g.usedRoutes.includes(r.id)
                      const pickedForSwap = isActive && g.phase === "SWAP" && g.pendingSwap.handRouteId === r.id

                      return (
                        <button
                          key={`W-${r.id}`}
                          onClick={(e) => {
                            if (!isActive) return
                            if (g.gameOver) return

                            if (g.phase === "ACTION") {
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
                            borderRadius: 10,
                            border: pickedForSwap ? "3px solid #111" : "1px solid #333",
                            background: used ? "rgba(0,0,0,0.06)" : "white",
                            fontWeight: 900,
                            cursor:
                              isActive && g.phase === "ACTION" && !used
                                ? "pointer"
                                : isActive && g.phase === "SWAP"
                                  ? "pointer"
                                  : "default",
                            opacity: !isActive ? 0.6 : used ? 0.5 : 1,
                          }}
                          title={
                            !isActive
                              ? "Opponent routes (visible in tournament)"
                              : g.phase === "ACTION"
                                ? used
                                  ? "Already used this turn"
                                  : "Click to apply to selected token"
                                : "Pick this hand route to swap out"
                          }
                        >
                          <RouteIcon route={r} />
                          <div style={{ fontSize: 11, marginTop: 4 }}>{r.id}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* BLUE */}
                <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>B Route Set</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                    {g.routes.B.map((r) => {
                      const isActive = g.player === "B"
                      const used = isActive && g.phase === "ACTION" && g.usedRoutes.includes(r.id)
                      const pickedForSwap = isActive && g.phase === "SWAP" && g.pendingSwap.handRouteId === r.id

                      return (
                        <button
                          key={`B-${r.id}`}
                          onClick={() => {
                            if (!isActive) return
                            if (g.gameOver) return

                            if (g.phase === "ACTION") {
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
                            borderRadius: 10,
                            border: pickedForSwap ? "3px solid #111" : "1px solid #333",
                            background: used ? "rgba(0,0,0,0.06)" : "white",
                            fontWeight: 900,
                            cursor:
                              isActive && g.phase === "ACTION" && !used
                                ? "pointer"
                                : isActive && g.phase === "SWAP"
                                  ? "pointer"
                                  : "default",
                            opacity: !isActive ? 0.6 : used ? 0.5 : 1,
                          }}
                          title={
                            !isActive
                              ? "Opponent routes (visible in tournament)"
                              : g.phase === "ACTION"
                                ? used
                                  ? "Already used this turn"
                                  : "Click to apply to selected token"
                                : "Pick this hand route to swap out"
                          }
                        >
                          <RouteIcon route={r} />
                          <div style={{ fontSize: 11, marginTop: 4 }}>{r.id}</div>
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
                        border: "2px solid #111",
                        background: "white",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      Confirm Swap & End Turn
                    </button>
                    <div style={{ fontSize: 12, opacity: 0.8, alignSelf: "center" }}>
                      Pick 1 from your hand and 1 from the queue.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App