import { useEffect, useMemo, useState } from "react"
import { SIZE, toSq, Coord } from "./engine/coords"
import { newGame, GameState, Player, Token } from "./engine/state"
import { traceByRoute } from "./engine/move"
import type { Route } from "./engine/move"
import { aiStep } from "./engine/ai"
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
  const AI_DELAY_MS = 1200

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
    const coord: Coord = { x, y }

    if (g.phase === "OPENING") {
      update((s) => placeOpeningToken(s, coord))
      return
    }

    if (g.phase === "REINFORCE") {
      update((s) => placeReinforcement(s, coord))
      return
    }

    const t = boardMap.get(`${x},${y}`)
    if (t) {
      if (t.owner !== g.player && (g.phase === "ACTION" || g.phase === "SWAP")) {
        update((s) => (s.warning = "NO-NO: you can only select your own tokens." as any))
        return
      }
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
    g.phase === "ACTION"
      ? g.routes[g.player].filter((r) => !g.usedRoutes.includes(r.id))
      : []

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
    const sel = selectedTokenId
      ? g.tokens.find(t => t.in === "BOARD" && t.id === selectedTokenId)
      : null

    if (g.phase === "ACTION" || g.phase === "SWAP") {
      if (!sel || sel.owner !== g.player) {
        const firstFriendly = g.tokens.find(t => t.in === "BOARD" && t.owner === g.player)
        setSelectedTokenId(firstFriendly ? firstFriendly.id : null)
      }
    }
  }, [g.player, g.phase, g.tokens, selectedTokenId])

  useEffect(() => {
    if (g.gameOver) return
    if (g.player !== ai) return

    const t = window.setTimeout(() => {
      update((s) => aiStep(s, ai))
    }, AI_DELAY_MS)

    return () => window.clearTimeout(t)
  }, [
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

  const selected =
    selectedTokenId ? g.tokens.find((t) => t.id === selectedTokenId && t.in === "BOARD") ?? null : null

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ margin: "0 0 10px 0" }}>Vekke — Tournament (Local)</h1>

      <button
        onClick={() => {
          const side = Math.random() < 0.5 ? "W" : "B"
          setHuman(side)
          setSelectedTokenId(null)
          setG(newGame())
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
        {g.player === ai && !g.gameOver ? "Computer thinking…" : "\u00A0"}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* BOARD */}
        <div>
          <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.85 }}>
            <b>Phase:</b> {g.phase} &nbsp;|&nbsp; <b>Player:</b> {g.player} &nbsp;|&nbsp; <b>Round:</b> {g.round}
          </div>

          <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.85 }}>
            <b>Reserves:</b> B {g.reserves.B} / W {g.reserves.W}
            &nbsp;|&nbsp; <b>Captives:</b> B {g.captives.B} / W {g.captives.W}
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
              display: "grid",
              gridTemplateColumns: `repeat(${SIZE}, 64px)`,
              gridTemplateRows: `repeat(${SIZE}, 64px)`,
              border: "2px solid #111",
              userSelect: "none",
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
                    style={{
                      position: "relative",
                      border: "1px solid #444",
                      background: (x + y) % 2 === 0 ? "white" : "rgba(0,0,0,0.04)",
                      cursor: g.phase === "OPENING" || t ? "pointer" : "default",
                    }}
                    title={sq}
                  >
                    <div style={{ position: "absolute", top: 4, left: 6, fontSize: 11, opacity: 0.55 }}>
                      {sq}
                    </div>

                    {t && (
                      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            border: isSelected ? "3px solid #111" : "2px solid #333",
                            background: t.owner === "W" ? "#f5f5f5" : "#2b55ff",
                            color: t.owner === "W" ? "#111" : "white",
                            fontWeight: 900,
                          }}
                        >
                          {t.owner}
                        </div>
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
                Opening placement — <b>{g.player}</b> places now. (Placed: B {g.openingPlaced.B}/3, W {g.openingPlaced.W}/3)
              </>
            ) : (
              <>
                Selected:{" "}
                <b>{selected ? `${selected.id} (${toSq(selected.pos)})` : "none"}</b>
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ width: 460 }}>
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
                    {r.id}
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
                            cursor: isActive && g.phase === "ACTION" && !used ? "pointer" : isActive && g.phase === "SWAP" ? "pointer" : "default",
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
                          {r.id}
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
                            cursor: isActive && g.phase === "ACTION" && !used ? "pointer" : isActive && g.phase === "SWAP" ? "pointer" : "default",
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
                          {r.id}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Swap confirm (only shows when in SWAP) */}
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

          {/* Log */}
          <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Log</div>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                lineHeight: 1.4,
                maxHeight: 360,
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {g.log.length === 0 ? (
                <div style={{ opacity: 0.7 }}>
                  Click squares to place opening tokens (Blue first). Then play.
                </div>
              ) : (
                g.log.map((l, i) => <div key={i}>{l}</div>)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App