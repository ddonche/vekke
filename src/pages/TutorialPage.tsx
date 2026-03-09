// src/components/TutorialPage.tsx
// Full tutorial walkthrough — scripted, interactive, matches game look & feel.

import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Header } from "../components/Header"
import { sounds } from "../sounds"
import { supabase } from "../services/supabase"
import { RouteIcon } from "../RouteIcon"
import { newGame } from "../engine/state"

// ─── Props ────────────────────────────────────────────────────────────────────

interface TutorialPageProps {
  onComplete: (gameId: string) => void
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = "W" | "B"
type Cell = { x: number; y: number }
type TokOnBoard = { id: string; x: number; y: number; owner: Player; sieged?: boolean }
type TutRoute = { dir: number; dist: number }

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE = 6
const COLS = ["A", "B", "C", "D", "E", "F"]
const CELL = 64      // was 90
const CELL_SM = 48   // was 56

// Pre-defined B auto-placement positions for opening phase
const B_AUTO_POSITIONS: Cell[] = [{ x: 4, y: 4 }, { x: 1, y: 1 }, { x: 5, y: 3 }, { x: 0, y: 5 }, { x: 3, y: 0 }]

// Action phase: 2 tokens, 3 routes
const ACTION_TOKENS_START: TokOnBoard[] = [
  { id: "w1", x: 2, y: 2, owner: "W" },
  { id: "w2", x: 3, y: 3, owner: "W" },
]
const ACTION_ROUTES: TutRoute[] = [
  { dir: 1, dist: 1 }, // N1
  { dir: 3, dist: 2 }, // E2
  { dir: 5, dist: 1 }, // S1
]

// Compute dest from a position applying a route (wraps like the real game)
// ─── Flanking movement (ported directly from engine/move.ts) ─────────────────

const FLANK_DIR: Record<number, { dx: number; dy: number }> = {
  1: { dx:  0, dy:  1 }, // N
  2: { dx:  1, dy:  1 }, // NE
  3: { dx:  1, dy:  0 }, // E
  4: { dx:  1, dy: -1 }, // SE
  5: { dx:  0, dy: -1 }, // S
  6: { dx: -1, dy: -1 }, // SW
  7: { dx: -1, dy:  0 }, // W
  8: { dx: -1, dy:  1 }, // NW
}

function stepFlank(pos: Cell, dir: number): Cell {
  const { dx, dy } = FLANK_DIR[dir]
  const nx = pos.x + dx
  const ny = pos.y + dy

  if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) return { x: nx, y: ny }

  const { x, y } = pos

  if (dy === 0) {
    if (nx < 0)      return { x: SIZE - 1, y }
    if (nx >= SIZE)  return { x: 0, y }
  }
  if (dx === 0) {
    if (ny < 0)      return { x, y: SIZE - 1 }
    if (ny >= SIZE)  return { x, y: 0 }
  }

  if (dx === dy) {
    const d    = x - y
    const minX = Math.max(0, d)
    const maxX = Math.min(SIZE - 1, (SIZE - 1) + d)
    const endA = { x: minX, y: minX - d }
    const endB = { x: maxX, y: maxX - d }
    return dx === 1 ? endA : endB
  }

  const s    = x + y
  const minX = Math.max(0, s - (SIZE - 1))
  const maxX = Math.min(SIZE - 1, s)
  const endA = { x: minX, y: s - minX }
  const endB = { x: maxX, y: s - maxX }
  return dx === 1 ? endA : endB
}

function traceRoute(pos: Cell, route: TutRoute): Cell[] {
  const out: Cell[] = []
  let cur = pos
  for (let i = 0; i < route.dist; i++) {
    cur = stepFlank(cur, route.dir)
    out.push(cur)
  }
  return out
}

function applyRoute(pos: Cell, route: TutRoute): Cell {
  // Use proper Vekke flanking movement (not simple torus)
  let cur = pos
  for (let i = 0; i < route.dist; i++) cur = stepFlank(cur, route.dir)
  return cur
}

// Invasion phase: W at (1,2), B at (3,2) — route E2 invades
const INV_W: Cell = { x: 1, y: 2 }
const INV_B: Cell = { x: 3, y: 2 }
const INV_ROUTES: TutRoute[] = [
  { dir: 3, dist: 2 }, // E2 → lands on (3,2) = B's square → INVADE
  { dir: 1, dist: 1 }, // N1 → miss
  { dir: 5, dist: 2 }, // S2 → miss
]

// Siege boards
const SIEGE1_TOKENS: TokOnBoard[] = [
  { id: "w1", x: 2, y: 2, owner: "W", sieged: true },
  { id: "b1", x: 2, y: 3, owner: "B" },
  { id: "b2", x: 2, y: 1, owner: "B" },
  { id: "b3", x: 1, y: 2, owner: "B" },
  { id: "b4", x: 3, y: 2, owner: "B" },
]
const SIEGE2_PRE_TOKENS: TokOnBoard[] = [
  { id: "w1", x: 2, y: 2, owner: "W" },
  { id: "b1", x: 2, y: 3, owner: "B" },
  { id: "b2", x: 2, y: 1, owner: "B" },
  { id: "b3", x: 1, y: 2, owner: "B" },
]
const SIEGE2_POST_TOKENS: TokOnBoard[] = [
  ...SIEGE2_PRE_TOKENS.map((t) => (t.id === "w1" ? { ...t, sieged: true } : t)),
  { id: "b4", x: 3, y: 2, owner: "B" as Player },
]

const SIEGE3_W_START = { x: 1, y: 3 }
const SIEGE3_ROUTES: TutRoute[] = [
  { dir: 1, dist: 2 }, // wrong — north 2
  { dir: 3, dist: 3 }, // correct — east 3 lands on (4,3)
  { dir: 5, dist: 1 }, // wrong — south 1
]
const SIEGE3_PRE_TOKENS: TokOnBoard[] = [
  { id: "wm", x: 1, y: 3, owner: "W" },
  { id: "w1", x: 3, y: 2, owner: "W" },
  { id: "w2", x: 2, y: 3, owner: "W" },
  { id: "w3", x: 3, y: 4, owner: "W" },
  { id: "b1", x: 3, y: 3, owner: "B" },
]
const SIEGE3_POST_TOKENS: TokOnBoard[] = [
  { id: "wm", x: 4, y: 3, owner: "W" },
  { id: "w1", x: 3, y: 2, owner: "W" },
  { id: "w2", x: 2, y: 3, owner: "W" },
  { id: "w3", x: 3, y: 4, owner: "W" },
  { id: "b1", x: 3, y: 3, owner: "B", sieged: true },
]



function playPlace() { try { sounds.place.play() } catch {} }
function playCapture() { try { sounds.capture.play() } catch {} }
function playClick() { try { sounds.click.play() } catch {} }

// ─── Token visual (small standalone use only — board renders tokens inline) ──

function TokenDisc({
  owner,
  size = 70,
}: {
  owner: Player
  size?: number
}) {
  return (
    <div
      className={owner === "W" ? "skin-token-default-w" : "skin-token-default-b"}
      style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }}
    />
  )
}

// ─── Tutorial Board ───────────────────────────────────────────────────────────

function TutBoard({
  tokens,
  highlightCells = [],
  selectedCell,
  pulse,
  onCell,
  cellSizePx,
}: {
  tokens: TokOnBoard[]
  highlightCells?: Cell[]
  selectedCell?: Cell | null
  pulse: boolean
  onCell: (x: number, y: number) => void
  cellSizePx: number
}) {
  const mobile = cellSizePx <= 56
  const tokenMap = new Map(tokens.map((t) => [`${t.x},${t.y}`, t]))
  const isHighlighted = (x: number, y: number) => highlightCells.some((c) => c.x === x && c.y === y)
  const isSelected = (x: number, y: number) => selectedCell?.x === x && selectedCell?.y === y

  // Sizing matches GridBoard exactly
  const gap = mobile ? "2px" : "5px"
  const padding = mobile ? "6px" : "16px"
  const boardRadius = mobile ? "12px" : "20px"
  const cellRadius = mobile ? "8px" : "14px"
  const tokenSize = Math.round(cellSizePx * 0.72)
  const notationTop = mobile ? 2 : 4
  const notationLeft = mobile ? 3 : 6
  const notationSize = mobile ? 7 : 10

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${SIZE}, ${cellSizePx}px)`,
        gridTemplateRows: `repeat(${SIZE}, ${cellSizePx}px)`,
        gap,
        padding,
        backgroundColor: "rgba(184,150,106,0.12)",
        border: "1px solid rgba(184,150,106,0.30)",
        borderRadius: boardRadius,
        boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}
    >
      {Array.from({ length: SIZE }, (_, ry) => {
        const y = SIZE - 1 - ry
        return Array.from({ length: SIZE }, (_, x) => {
          const tok = tokenMap.get(`${x},${y}`)
          const hl = isHighlighted(x, y)
          const sel = isSelected(x, y)
          const notation = `${COLS[x]}${y + 1}`

          return (
            <div
              key={`${x},${y}`}
              onClick={() => onCell(x, y)}
              style={{
                width: cellSizePx,
                height: cellSizePx,
                backgroundColor: sel
                  ? "rgba(0,0,0,0.35)"
                  : hl
                    ? "rgba(93,232,247,0.10)"
                    : "rgba(184,150,106,0.28)",
                borderRadius: cellRadius,
                boxShadow: sel
                  ? `0 0 0 ${mobile ? "2px" : "3px"} #5de8f7`
                  : hl
                    ? `0 0 0 ${mobile ? "2px" : "3px"} rgba(93,232,247,${pulse ? 0.85 : 0.3})`
                    : "0 2px 4px rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor: hl || tok ? "pointer" : "default",
                transition: "box-shadow 0.4s ease",
              }}
            >
              {/* Notation label */}
              <div
                style={{
                  position: "absolute",
                  top: notationTop,
                  left: notationLeft,
                  fontSize: notationSize,
                  fontWeight: 900,
                  color: "#6b6558",
                  fontFamily: "monospace",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {notation}
              </div>

              {/* Token */}
              {tok && (
                <div style={{ position: "relative", width: tokenSize, height: tokenSize }}>
                  <div
                    className={tok.owner === "W" ? "skin-token-default-w" : "skin-token-default-b"}
                    style={{ width: tokenSize, height: tokenSize, borderRadius: "50%" }}
                  />
                  {/* Siege ring */}
                  {tok.sieged && (
                    <div
                      style={{
                        position: "absolute",
                        inset: mobile ? -3 : -4,
                        borderRadius: "50%",
                        border: "2px dashed #ee484c",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {/* Selected ring */}
                  {sel && (
                    <div
                      style={{
                        position: "absolute",
                        inset: mobile ? -4 : -5,
                        borderRadius: "50%",
                        border: "2px solid #5de8f7",
                        pointerEvents: "none",
                        opacity: 0.7,
                      }}
                    />
                  )}
                </div>
              )}

              {/* Empty highlight ring — placement target */}
              {hl && !tok && (
                <div
                  style={{
                    width: tokenSize,
                    height: tokenSize,
                    borderRadius: "50%",
                    border: `2px dashed rgba(93,232,247,${pulse ? 0.8 : 0.3})`,
                    transition: "border-color 0.4s ease",
                  }}
                />
              )}
            </div>
          )
        })
      })}
    </div>
  )
}

// ─── Route domino ─────────────────────────────────────────────────────────────
// Wraps the real RouteIcon/RouteDomino so tutorial dominos are pixel-identical
// to the ones in-game. State mapping:
//   active -> selected (cyan glow border)
//   used   -> opacity 0.25, no pointer events
//   dim    -> opacity 0.5

function RouteDomino({
  route,
  active,
  used,
  onClick,
  dim,
}: {
  route: TutRoute
  active?: boolean
  used?: boolean
  pulse?: boolean   // kept in signature so call sites need no changes; unused
  onClick?: () => void
  dim?: boolean
}) {
  const opacity = used ? 0.25 : dim ? 0.5 : 1
  const cursor  = active && !used ? "pointer" : "default"

  return (
    <div
      onClick={active && !used ? onClick : undefined}
      style={{ opacity, cursor, flexShrink: 0, transition: "opacity 0.25s", userSelect: "none" }}
    >
      <RouteIcon
        route={route}
        selected={!!active && !used}
        highlightColor="#5de8f7"
        style={{ width: 56, cursor }}
      />
    </div>
  )
}

const nextBtnStyle: React.CSSProperties = {
  padding: "13px 34px",
  borderRadius: 10,
  border: "2px solid #3296ab",
  background: "rgba(50,150,171,0.10)",
  color: "#e8e4d8",
  fontFamily: "'Cinzel', serif",
  fontSize: "0.82rem",
  fontWeight: 700,
  letterSpacing: "0.14em",
  cursor: "pointer",
  textTransform: "uppercase",
}


// ─── All 28 route dominos ─────────────────────────────────────────────────────
// All 8 dirs × dist 1–3 = 24; orthogonals (1,3,5,7) × dist 4 = 4 → total 28

const ALL_28_ROUTES: TutRoute[] = (() => {
  const out: TutRoute[] = []
  for (let dir = 1; dir <= 8; dir++) {
    for (let dist = 1; dist <= 3; dist++) out.push({ dir, dist })
  }
  for (const dir of [1, 3, 5, 7]) out.push({ dir, dist: 4 })
  return out
})()

const DIR_LABEL: Record<number, string>  = { 1:"N", 2:"NE", 3:"E", 4:"SE", 5:"S", 6:"SW", 7:"W", 8:"NW" }
const DIR_ARROW: Record<number, string>  = { 1:"↑", 2:"↗", 3:"→", 4:"↘", 5:"↓", 6:"↙", 7:"←", 8:"↖" }
const FILES_ARR = ["A","B","C","D","E","F"]

const READER_TOKEN: Cell = { x: 2, y: 2 }

function RouteReaderStep({ cellSizePx, onNext }: { cellSizePx: number; onNext: () => void }) {
  const [dir, setDir]   = useState<number | null>(null)
  const [dist, setDist] = useState<number | null>(null)

  const isDiagonal    = dir !== null && [2, 4, 6, 8].includes(dir)
  const effectiveDist = isDiagonal && dist === 4 ? null : dist

  const selected: TutRoute | null =
    dir !== null && effectiveDist !== null ? { dir, dist: effectiveDist } : null

  const trace   = selected ? traceRoute(READER_TOKEN, selected) : []
  const dest    = trace.length ? trace[trace.length - 1] : null
  const flanked = selected !== null && trace.some((step, i) => {
    const prev = i === 0 ? READER_TOKEN : trace[i - 1]
    const { dx, dy } = FLANK_DIR[selected.dir]
    return step.x !== prev.x + dx || step.y !== prev.y + dy
  })

  const tokens: TokOnBoard[]  = [{ id: "w1", x: READER_TOKEN.x, y: READER_TOKEN.y, owner: "W" }]
  const highlightCells: Cell[] = dest ? [dest] : []

  function selectDir(d: number) {
    setDir(d)
    if ([2, 4, 6, 8].includes(d) && dist === 4) setDist(null)
  }

  // All 8 directions shown as dist-1 dominos (arrow is visible, pips = 1)
  const DIR_ORDER = [8, 1, 2, 7, 3, 6, 5, 4] // NW N NE / W E / SW S SE — compass layout

  // Distance dominos use current dir (or dir 1 as placeholder when none selected)
  const previewDir = dir ?? 1

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%" }}>

      {/* Title */}
      <div style={{ textAlign: "center", maxWidth: 500 }}>
        <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "1.05rem", fontWeight: 700, color: "#e8e4d8", margin: "0 0 4px", letterSpacing: "0.05em" }}>How to Read a Route</h2>
        <p style={{ fontSize: "0.88rem", color: "#b0aa9e", lineHeight: 1.55, margin: 0 }}>
          Pick a <span style={{ color: "#e8e4d8" }}>direction</span> and a <span style={{ color: "#e8e4d8" }}>distance</span> to see where the token lands. If it goes off the edge, it continues from the opposite end — this is called <span style={{ color: "#b8966a" }}>flanking</span>.
        </p>
      </div>

      {/* Mobile: stack directions / board / distances. Desktop: side by side */}
      {cellSizePx <= CELL_SM ? (
        // ── MOBILE LAYOUT ──
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>

          {/* Direction row — 8 dominos in a single row */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b6558" }}>Direction</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[8, 1, 2, 7, 3, 6, 5, 4].map((d) => {
                const active = dir === d
                return (
                  <div key={d} onClick={() => selectDir(d)} style={{ cursor: "pointer", borderRadius: 6, outline: active ? "2px solid #5de8f7" : "2px solid transparent", outlineOffset: 2, opacity: active ? 1 : 0.55 }}>
                    <RouteIcon route={{ dir: d, dist: effectiveDist ?? 1 }} selected={false} style={{ width: 36 }} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Board */}
          <TutBoard tokens={tokens} highlightCells={highlightCells} pulse={false} onCell={() => {}} cellSizePx={cellSizePx} />

          {/* Distance row */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b6558" }}>Distance</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4].map((d) => {
                const disabled = isDiagonal && d === 4
                const active   = dist === d && !disabled
                return (
                  <div key={d} onClick={() => !disabled && setDist(d)} style={{ cursor: disabled ? "default" : "pointer", borderRadius: 6, outline: active ? "2px solid #5de8f7" : "2px solid transparent", outlineOffset: 2, opacity: disabled ? 0.15 : active ? 1 : 0.55 }}>
                    <RouteIcon route={{ dir: previewDir, dist: d }} selected={false} style={{ width: 36 }} />
                  </div>
                )
              })}
            </div>
            {isDiagonal && <div style={{ fontSize: "0.7rem", color: "#6b6558", fontFamily: "'EB Garamond',serif", fontStyle: "italic" }}>Diagonals max at 3</div>}
          </div>

          {/* Readout */}
          <div style={{ minHeight: 18 }}>
            {selected && dest ? (
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.75rem", letterSpacing: "0.1em", color: flanked ? "#b8966a" : "#5de8f7", textTransform: "uppercase" }}>
                {selected.dir}/{selected.dist} → {FILES_ARR[dest.x]}{dest.y + 1}{flanked ? "  ·  flanked" : ""}
              </span>
            ) : (
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.7rem", letterSpacing: "0.08em", color: "rgba(93,232,247,0.30)", textTransform: "uppercase" }}>
                {dir === null ? "pick a direction" : "pick a distance"}
              </span>
            )}
          </div>
        </div>
      ) : (
        // ── DESKTOP LAYOUT ── selectors left, board right
        <div style={{ display: "flex", flexDirection: "row", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>

            {/* Direction — 3×3 compass grid */}
            <div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b6558", marginBottom: 6 }}>Direction</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 48px)", gap: 4 }}>
                {[8, 1, 2, 7, null, 3, 6, 5, 4].map((d, i) => {
                  if (d === null) return <div key={i} style={{ width: 48, height: 48 }} />
                  const active = dir === d
                  return (
                    <div key={i} onClick={() => selectDir(d)} style={{ cursor: "pointer", borderRadius: 8, outline: active ? "2px solid #5de8f7" : "2px solid transparent", outlineOffset: 2, transition: "outline 0.12s", opacity: active ? 1 : 0.55 }}>
                      <RouteIcon route={{ dir: d, dist: effectiveDist ?? 1 }} selected={false} style={{ width: 48 }} />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Distance — 4 dominos */}
            <div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b6558", marginBottom: 6 }}>Distance</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4].map((d) => {
                  const disabled = isDiagonal && d === 4
                  const active   = dist === d && !disabled
                  return (
                    <div key={d} onClick={() => !disabled && setDist(d)} style={{ cursor: disabled ? "default" : "pointer", borderRadius: 8, outline: active ? "2px solid #5de8f7" : "2px solid transparent", outlineOffset: 2, transition: "outline 0.12s", opacity: disabled ? 0.15 : active ? 1 : 0.55 }}>
                      <RouteIcon route={{ dir: previewDir, dist: d }} selected={false} style={{ width: 48 }} />
                    </div>
                  )
                })}
              </div>
              {isDiagonal && <div style={{ fontSize: "0.7rem", color: "#6b6558", fontFamily: "'EB Garamond',serif", fontStyle: "italic", marginTop: 4 }}>Diagonals max at 3</div>}
            </div>

            {/* Readout */}
            <div style={{ minHeight: 18 }}>
              {selected && dest ? (
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.75rem", letterSpacing: "0.1em", color: flanked ? "#b8966a" : "#5de8f7", textTransform: "uppercase" }}>
                  {selected.dir}/{selected.dist} → {FILES_ARR[dest.x]}{dest.y + 1}{flanked ? "  ·  flanked" : ""}
                </span>
              ) : (
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.7rem", letterSpacing: "0.08em", color: "rgba(93,232,247,0.30)", textTransform: "uppercase" }}>
                  {dir === null ? "pick a direction" : "pick a distance"}
                </span>
              )}
            </div>
          </div>

          <TutBoard tokens={tokens} highlightCells={highlightCells} pulse={false} onCell={() => {}} cellSizePx={cellSizePx} />
        </div>
      )}

      {/* Flanking callout */}
      <div style={{ minHeight: 28 }}>
        {flanked && (
          <div style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.35)", background: "rgba(184,150,106,0.07)", fontSize: "0.82rem", fontFamily: "'EB Garamond',serif", color: "#b8966a", textAlign: "center", fontStyle: "italic" }}>
            This route flanked — it continued from the opposite end of the same line.
          </div>
        )}
      </div>

      <button onClick={onNext} style={nextBtnStyle}>Got it →</button>
    </div>
  )
}

// ─── STEP ID enum ─────────────────────────────────────────────────────────────

type StepId =
  | "welcome"
  | "opening"
  | "action_intro"
  | "route_reader"
  | "action"
  | "mulligan"
  | "invasion"
  | "friendly_fire"
  | "reinforce"
  | "swap"
  | "siege2"
  | "siege3"
  | "special_actions"
  | "invite"
  | "orders"

const STEP_ORDER: StepId[] = [
  "welcome", "opening", "action_intro", "route_reader", "action", "mulligan",
  "invasion", "friendly_fire", "reinforce",
  "swap", "siege2", "siege3", "special_actions", "invite", "orders",
]

const PHASE_FOR_STEP: Record<StepId, string> = {
  welcome: "Intro",
  opening: "Opening",
  action_intro: "Action",
  route_reader: "Action",
  action: "Action",
  mulligan: "Opening",
  invasion: "Action",
  friendly_fire: "Action",
  reinforce: "Reinforce",
  swap: "Swap",
  siege2: "Siege",
  siege3: "Siege",
  special_actions: "Special Actions",
  invite: "Invite",
  orders: "Orders",
}

const LABEL_FOR_STEP: Record<StepId, string> = {
  welcome:         "Welcome",
  opening:         "Place Your Tokens",
  action_intro:    "Action Phase",
  route_reader:    "How to Read a Route",
  action:          "Move Your Tokens",
  mulligan:        "Mulligan",
  invasion:        "Capture Enemy Tokens",
  friendly_fire:   "Friendly Fire",
  reinforce:       "Reinforcements",
  swap:            "Route Swap",
  siege2:          "Siege",
  siege3:          "Siege by Movement",
  special_actions: "Special Actions",
  invite:          "Challenge a Friend",
  orders:          "Join an Order",
}

// Groups for TOC display
const TOC_GROUPS: { label: string; steps: StepId[] }[] = [
  { label: "Intro",           steps: ["welcome"] },
  { label: "Opening",         steps: ["opening", "mulligan"] },
  { label: "Action",          steps: ["action_intro", "route_reader", "action", "invasion", "friendly_fire"] },
  { label: "Reinforce",       steps: ["reinforce"] },
  { label: "Swap",            steps: ["swap"] },
  { label: "Siege",           steps: ["siege2", "siege3"] },
  { label: "Special Actions", steps: ["special_actions"] },
  { label: "Community",       steps: ["invite", "orders"] },
]

// ─── Main Tutorial component ──────────────────────────────────────────────────

export function TutorialPage({ onComplete }: TutorialPageProps) {
  const navigate = useNavigate()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<{ username?: string; avatar_url?: string | null; elo_standard?: number } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        supabase
          .from("profiles")
          .select("username, avatar_url, elo_standard")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => { if (data) setUserProfile(data) })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) setCurrentUserId(session.user.id)
      else { setCurrentUserId(null); setUserProfile(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const [stepIdx, setStepIdx] = useState(0)
  const [launching, setLaunching] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [pulse, setPulse] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)
  const warningTimer = useRef<ReturnType<typeof setTimeout>>()
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  function scheduleTimeout(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms)
    timeoutsRef.current.push(id)
    return id
  }
  function clearAllTimeouts() {
    for (const t of timeoutsRef.current) clearTimeout(t)
    timeoutsRef.current = []
  }
  useEffect(() => {
    return () => {
      clearAllTimeouts()
      if (warningTimer.current) clearTimeout(warningTimer.current)
    }
  }, [])

  // ── Sub-state ─────────────────────────────────────────────────────────────
  const [openingTokens, setOpeningTokens] = useState<TokOnBoard[]>([])
  const [openingWCount, setOpeningWCount] = useState(0)
  const [openingBPending, setOpeningBPending] = useState(false)

  const [actionTokens, setActionTokens] = useState<TokOnBoard[]>(ACTION_TOKENS_START)
  const [actionSelectedCell, setActionSelectedCell] = useState<Cell | null>(null)
  const [actionRoutesUsed, setActionRoutesUsed] = useState<number[]>([])

  const [invSelected, setInvSelected] = useState(false)
  const [invWPos, setInvWPos] = useState<Cell>(INV_W)
  const [invDone, setInvDone] = useState(false)
  const [invBCaptured, setInvBCaptured] = useState(false)

  const [reinforcedPos, setReinforcedPos] = useState<Cell | null>(null)

  const [swapDiscardIdx, setSwapDiscardIdx] = useState<number | null>(null)
  const [swapPickupIdx, setSwapPickupIdx] = useState<number | null>(null)
  const [swapDone, setSwapDone] = useState(false)

  const [siege2Done, setSiege2Done] = useState(false)
  const [siege3Selected, setSiege3Selected] = useState(false)
  const [siege3WPos, setSiege3WPos] = useState(SIEGE3_W_START)
  const [siege3Done, setSiege3Done] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 700)
    return () => clearInterval(t)
  }, [])

  const stepId = STEP_ORDER[stepIdx]
  const prevStepId = useRef<StepId | null>(null)
  useEffect(() => {
    if (prevStepId.current === stepId) return
    prevStepId.current = stepId
    clearAllTimeouts()
    setWarning(null)
    if (stepId === "opening") { setOpeningTokens([]); setOpeningWCount(0); setOpeningBPending(false) }
    if (stepId === "action") { setActionTokens(ACTION_TOKENS_START); setActionSelectedCell(null); setActionRoutesUsed([]) }
    if (stepId === "invasion") { setInvSelected(false); setInvWPos(INV_W); setInvDone(false); setInvBCaptured(false) }
    if (stepId === "reinforce") setReinforcedPos(null)
    if (stepId === "swap") { setSwapDiscardIdx(null); setSwapPickupIdx(null); setSwapDone(false) }
    if (stepId === "siege2") setSiege2Done(false)
    if (stepId === "siege3") { setSiege3Selected(false); setSiege3WPos(SIEGE3_W_START); setSiege3Done(false) }
  }, [stepId])

  async function launchGame() {
    if (launching) return
    if (!currentUserId) { navigate("/auth?returnTo=/tutorial"); return }
    setLaunching(true)
    try {
      const initialState = newGame()

      // Refresh token same way GamePage does
      const decodeExpMs = (jwt: string) => {
        const payloadB64 = jwt.split(".")[1]
        const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")))
        return (payloadJson.exp ?? 0) * 1000
      }
      const { data: sess0 } = await supabase.auth.getSession()
      if (!sess0.session?.access_token) { navigate("/auth?returnTo=/tutorial"); return }
      let token = sess0.session.access_token
      try {
        const expMs = decodeExpMs(token)
        if (!expMs || expMs <= Date.now() + 120_000) {
          const { data: refreshed } = await supabase.auth.refreshSession()
          if (refreshed.session?.access_token) token = refreshed.session.access_token
        }
      } catch { /* use token as-is */ }

      const { data, error } = await supabase.functions.invoke("create_ai_game", {
        body: {
          aiLevel: "novice",
          timeControl: "daily",
          initialState,
          vgnVersion: "1",
          humanSide: Math.random() < 0.5 ? "W" : "B",
        },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (error) throw error
      if (!data?.gameId) throw new Error("create_ai_game did not return gameId")
      onComplete(data.gameId)
    } catch (e) {
      console.error("Tutorial launchGame failed:", e)
      setLaunching(false)
    }
  }

  function showWarning(msg: string) {
    setWarning(msg)
    if (warningTimer.current) clearTimeout(warningTimer.current)
    warningTimer.current = setTimeout(() => setWarning(null), 2500)
  }
  function advance() {
    if (stepIdx >= STEP_ORDER.length - 1) launchGame()
    else setStepIdx((i) => i + 1)
  }
  function goBack() { if (stepIdx > 0) setStepIdx((i) => i - 1) }
  function restartTutorial() { clearAllTimeouts(); setLaunching(false); setStepIdx(0) }
  function skipTutorial() { clearAllTimeouts(); launchGame() }

  const [isMobile, setIsMobile] = useState(window.innerWidth < 600)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 600)
    window.addEventListener("resize", h)
    return () => window.removeEventListener("resize", h)
  }, [])
  const cellSize = isMobile ? CELL_SM : CELL

  if (launching) return <div style={{ minHeight: "100vh", background: "#0a0a0c" }} />

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleOpeningCell(x: number, y: number) {
    if (openingBPending || openingWCount >= 3) return
    if (openingTokens.some((t) => t.x === x && t.y === y)) {
      showWarning("That square is already occupied.")
      return
    }
    const newTok: TokOnBoard = { id: `w${openingWCount + 1}`, x, y, owner: "W" }
    const newTokens = [...openingTokens, newTok]
    setOpeningTokens(newTokens)
    setOpeningWCount((c) => c + 1)
    playPlace()

    const placeAutoB = (onDone?: () => void) => {
      setOpeningBPending(true)
      scheduleTimeout(() => {
        setOpeningTokens((prev) => {
          const bPos = B_AUTO_POSITIONS.find((p) => !prev.some((t) => t.x === p.x && t.y === p.y))!
          const bCountNow = prev.filter((t) => t.owner === "B").length
          const bTok: TokOnBoard = { id: `b${bCountNow + 1}`, x: bPos.x, y: bPos.y, owner: "B" }
          scheduleTimeout(() => { setOpeningBPending(false); playPlace(); if (onDone) onDone() }, 0)
          return [...prev, bTok]
        })
      }, 600)
    }

    if (openingWCount + 1 < 3) placeAutoB()
    else placeAutoB(() => scheduleTimeout(() => advance(), 500))
  }

  function handleActionCell(x: number, y: number) {
    const tok = actionTokens.find((t) => t.x === x && t.y === y && t.owner === "W")
    if (!tok) return
    setActionSelectedCell({ x, y })
    playClick()
  }

  function handleActionRoute(idx: number) {
    if (!actionSelectedCell) { showWarning("Select a token first."); return }
    if (actionRoutesUsed.includes(idx)) return
    const route = ACTION_ROUTES[idx]
    const sel = actionSelectedCell
    setActionTokens((prev) =>
      prev.map((t) => {
        if (t.owner === "W" && t.x === sel.x && t.y === sel.y) {
          const next = applyRoute({ x: t.x, y: t.y }, route)
          return { ...t, x: next.x, y: next.y }
        }
        return t
      }),
    )
    setActionRoutesUsed((prev) => [...prev, idx])
    setActionSelectedCell(null)
    playClick()
    if (actionRoutesUsed.length + 1 >= ACTION_ROUTES.length) scheduleTimeout(() => advance(), 600)
  }

  function handleInvasionCell(x: number, y: number) {
    if (invDone) return
    if (!invSelected) {
      if (x === invWPos.x && y === invWPos.y) { setInvSelected(true); playClick() }
      else showWarning("Click your Wake token to select it.")
    }
  }

  function handleInvasionRoute(idx: number) {
    if (!invSelected || invDone) return
    const dest = applyRoute(invWPos, INV_ROUTES[idx])
    if (dest.x === INV_B.x && dest.y === INV_B.y) {
      setInvWPos(dest); setInvSelected(false); setInvDone(true); setInvBCaptured(true)
      playCapture()
      scheduleTimeout(() => advance(), 1000)
    } else {
      setInvWPos(dest); setInvSelected(false)
      showWarning("No enemy there — try again. Select your token and play the right route.")
      scheduleTimeout(() => { setInvWPos(INV_W); setInvSelected(false) }, 800)
    }
  }

  const reinforceTokens: TokOnBoard[] = [
    { id: "w1", x: 4, y: 2, owner: "W" },
    { id: "w2", x: 2, y: 4, owner: "W" },
    { id: "b1", x: 3, y: 3, owner: "B" },
    { id: "b2", x: 1, y: 1, owner: "B" },
    ...(reinforcedPos ? [{ id: "wr", x: reinforcedPos.x, y: reinforcedPos.y, owner: "W" as Player }] : []),
  ]
  function handleReinforceCell(x: number, y: number) {
    if (reinforcedPos) return
    if (reinforceTokens.some((t) => t.x === x && t.y === y)) { showWarning("That square is already occupied."); return }
    setReinforcedPos({ x, y })
    playPlace()
    scheduleTimeout(() => advance(), 700)
  }

  function handleSiege3Cell(x: number, y: number) {
    if (siege3Done) return
    if (x === siege3WPos.x && y === siege3WPos.y) { setSiege3Selected(true); playClick() }
    else showWarning("Click your Wake token (W) to select it.")
  }

  function handleSiege3Route(idx: number) {
    if (!siege3Selected || siege3Done) return
    const dest = applyRoute(siege3WPos, SIEGE3_ROUTES[idx])
    const correct = dest.x === 4 && dest.y === 3
    setSiege3Selected(false)
    if (correct) {
      setSiege3WPos(dest)
      setSiege3Done(true)
      playPlace()
      scheduleTimeout(() => advance(), 1200)
    } else {
      setSiege3WPos(dest)
      showWarning("That route doesn't complete the siege — try again.")
      scheduleTimeout(() => { setSiege3WPos(SIEGE3_W_START); setSiege3Selected(false) }, 800)
    }
  }


  const SWAP_HAND: TutRoute[] = [{ dir: 1, dist: 2 }, { dir: 3, dist: 1 }, { dir: 7, dist: 3 }]
  const SWAP_QUEUE: TutRoute[] = [{ dir: 5, dist: 2 }, { dir: 2, dist: 3 }, { dir: 4, dist: 1 }]

  function handleSwapHandClick(idx: number) {
    if (swapDone) return
    setSwapDiscardIdx(idx)
    playClick()
  }
  function handleSwapQueueClick(idx: number) {
    if (swapDiscardIdx === null || swapDone) { showWarning("First select a route from your hand to discard."); return }
    setSwapPickupIdx(idx); setSwapDone(true); playClick()
    scheduleTimeout(() => advance(), 800)
  }

  const totalSteps = STEP_ORDER.length
  const isFirst = stepIdx === 0
  const phase = PHASE_FOR_STEP[stepId]

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#0a0a0c",
        color: "#e8e4d8",
        fontFamily: "'EB Garamond', Georgia, serif",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      <Header
        isLoggedIn={!!currentUserId}
        userId={currentUserId ?? undefined}
        username={userProfile?.username}
        avatarUrl={userProfile?.avatar_url ?? null}
        elo={userProfile?.elo_standard}
        activePage="tutorial"
      />

      {/* Phase badge + controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px 0", flexShrink: 0, gap: 12 }}>
        <button
          onClick={goBack}
          disabled={isFirst}
          style={{
            background: "none", border: "none",
            color: isFirst ? "rgba(184,150,106,0.2)" : "#b8966a",
            fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.15em",
            cursor: isFirst ? "default" : "pointer", padding: "4px 0",
          }}
        >
          ← Back
        </button>

        <span
          style={{
            fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.35em",
            textTransform: "uppercase", color: "#b8966a",
            border: "1px solid rgba(184,150,106,0.35)", borderRadius: 20,
            padding: "3px 14px", whiteSpace: "nowrap",
          }}
        >
          {phase}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.12em", color: "#6b6558", whiteSpace: "nowrap" }}>
            {stepIdx + 1}/{totalSteps}
          </span>
          <button onClick={restartTutorial} style={{ background: "none", border: "none", color: "#6b6558", fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "4px 0", textTransform: "uppercase" }} title="Restart tutorial">
            Restart
          </button>
          {isMobile && (
            <button onClick={() => setTocOpen(true)} style={{ background: "none", border: "none", color: "#6b6558", fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "4px 0", textTransform: "uppercase" }} title="Table of contents">
              Contents
            </button>
          )}
          <button onClick={skipTutorial} style={{ background: "none", border: "none", color: "#b8966a", fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "4px 0", textTransform: "uppercase" }} title="Skip tutorial">
            Skip →
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, margin: "8px 24px 0", backgroundColor: "rgba(184,150,106,0.12)", borderRadius: 1 }}>
        <div style={{ height: "100%", width: `${((stepIdx + 1) / totalSteps) * 100}%`, backgroundColor: "#5de8f7", borderRadius: 1, transition: "width 0.3s ease" }} />
      </div>

      {/* Warning banner */}
      <div
        style={{
          minHeight: warning ? "auto" : 0, overflow: "hidden", transition: "height 0.2s",
          margin: warning ? "8px 24px 0" : "0 24px",
          backgroundColor: "rgba(238,72,76,0.12)",
          border: warning ? "1px solid rgba(238,72,76,0.40)" : "none",
          borderRadius: 6, padding: warning ? "8px 12px" : 0,
          fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.1em",
          color: "#f87171", textAlign: "center",
        }}
      >
        {warning}
      </div>

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>

        {/* ── Desktop sidebar TOC ── */}
        {!isMobile && (
          <div style={{
            width: 260, flexShrink: 0, borderRight: "1px solid rgba(184,150,106,0.15)",
            overflowY: "auto", padding: "20px 0",
          }}>
            {TOC_GROUPS.map((group) => (
              <div key={group.label} style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "#6b6558", padding: "0 20px", marginBottom: 6 }}>{group.label}</div>
                {group.steps.map((id) => {
                  const idx = STEP_ORDER.indexOf(id)
                  const isCurrent = stepIdx === idx
                  const isVisited = idx < stepIdx
                  return (
                    <button
                      key={id}
                      onClick={() => setStepIdx(idx)}
                      style={{
                        width: "100%", background: isCurrent ? "rgba(93,232,247,0.07)" : "transparent",
                        border: "none", borderLeft: isCurrent ? "2px solid #5de8f7" : "2px solid transparent",
                        padding: "9px 20px", textAlign: "left", cursor: "pointer",
                        fontFamily: "'EB Garamond',serif", fontSize: "1.05rem",
                        color: isCurrent ? "#e8e4d8" : isVisited ? "#b0aa9e" : "#4a4a52",
                        display: "flex", alignItems: "center", gap: 10, lineHeight: 1.3,
                      }}
                    >
                      <span style={{ fontSize: 9, color: isVisited || isCurrent ? "#5de8f7" : "transparent", flexShrink: 0 }}>✓</span>
                      {LABEL_FOR_STEP[id]}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

      {/* Main scroll area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 20px 32px", gap: 20, overflowY: "auto" }}>

        {stepId === "welcome" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}>
            <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
              <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "1.15rem", fontWeight: 700, color: "#e8e4d8", marginBottom: 10, letterSpacing: "0.05em" }}>Welcome to Vekke</h2>
              <p style={{ fontSize: "1.05rem", color: "#b0aa9e", lineHeight: 1.75, margin: "0 0 16px 0" }}>
                Vekke is a fast strategic board game for two players — Wake (W) versus Brake (B). Each game lasts around 5–10 minutes. This walkthrough teaches you everything you need to start playing.
              </p>
              <p style={{ fontSize: "1.05rem", color: "#b0aa9e", lineHeight: 1.75, margin: 0 }}>
                The object of the game is to eliminate all your opponent's tokens, or lock them all by siege until they can no longer take action. You move your tokens using <span style={{ color: "#e8e4d8" }}>routes</span> — each route specifies a direction and a distance.
              </p>
            </div>
            <p style={{ fontSize: "0.78rem", color: "#6b6558", fontFamily: "'Cinzel',serif", letterSpacing: "0.08em", textAlign: "center", margin: 0 }}>
              Use <span style={{ color: "#b8966a", cursor: "pointer", textDecoration: "underline" }} onClick={() => setTocOpen(true)}>Contents</span> in the header to skip around or revisit any section later.
            </p>
            <button onClick={advance} style={nextBtnStyle}>Let's go →</button>
          </div>
        )}

        {stepId === "opening" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Opening Phase"
              body={
                openingBPending
                  ? "Brake is placing their token..."
                  : openingWCount >= 3
                    ? "Opening complete!"
                    : openingWCount === 0
                      ? "Players alternate placing tokens until each side has 3. Click any empty square to place your first Wake token."
                      : `Click any empty square to place your Wake token. (${3 - openingWCount} remaining)`
              }
            />
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TokenDisc owner="W" size={isMobile ? 24 : 28} />
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.15em", color: "#b0aa9e", textTransform: "uppercase" }}>You (Wake)</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TokenDisc owner="B" size={isMobile ? 24 : 28} />
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.15em", color: "#b0aa9e", textTransform: "uppercase" }}>Brake (AI)</span>
              </div>
            </div>
            <TutBoard tokens={openingTokens} pulse={pulse} onCell={handleOpeningCell} cellSizePx={cellSize} />
          </div>
        )}

        {stepId === "action_intro" && (
          <StaticStep
            title="Action Phase — Route Cards"
            body="Once opening is complete, turns begin. Each turn you play 3 route cards to move your tokens. Each card shows a direction (↑↗→…) and a distance (1–4). You can move any of your tokens with each card."
            onNext={advance} nextLabel="Got it →"
            board={<TutBoard tokens={ACTION_TOKENS_START} pulse={pulse} onCell={() => {}} cellSizePx={cellSize} />}
            below={
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b8966a" }}>Route Hand</span>
                <div style={{ display: "flex", gap: 10 }}>
                  {ACTION_ROUTES.map((r, i) => <RouteDomino key={i} route={r} pulse={pulse} />)}
                </div>
              </div>
            }
          />
        )}

        {stepId === "route_reader" && <RouteReaderStep cellSizePx={cellSize} onNext={advance} />}

        {stepId === "action" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Move Your Tokens"
              body={
                actionRoutesUsed.length === 0
                  ? actionSelectedCell ? "Token selected. Now click a route card to move it." : "Click any Wake token to select it."
                  : actionRoutesUsed.length >= ACTION_ROUTES.length
                    ? "Turn complete!"
                    : actionSelectedCell
                      ? "Nice. Now play a route to move the selected token."
                      : `Good! Select any Wake token and play another route. (${ACTION_ROUTES.length - actionRoutesUsed.length} remaining)`
              }
            />
            <TutBoard tokens={actionTokens} selectedCell={actionSelectedCell} pulse={pulse} onCell={handleActionCell} cellSizePx={cellSize} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b8966a" }}>Route Hand</span>
              <div style={{ display: "flex", gap: 10 }}>
                {ACTION_ROUTES.map((r, i) => (
                  <RouteDomino key={i} route={r} used={actionRoutesUsed.includes(i)} active={!!actionSelectedCell && !actionRoutesUsed.includes(i)} pulse={pulse} onClick={() => handleActionRoute(i)} />
                ))}
              </div>
            </div>
            {!!actionSelectedCell && <HintLabel>↑ Click a route card to move the selected token</HintLabel>}
            {!actionSelectedCell && actionRoutesUsed.length < ACTION_ROUTES.length && <HintLabel>↑ Click a Wake token first</HintLabel>}
          </div>
        )}

        {stepId === "mulligan" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}>
            <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
              <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "1.15rem", fontWeight: 700, color: "#e8e4d8", marginBottom: 10, letterSpacing: "0.05em" }}>Mulligan</h2>
              <p style={{ fontSize: "1.05rem", color: "#b0aa9e", lineHeight: 1.75, margin: 0 }}>Before the first turn, both players decide whether to Mulligan. You'll see two pulsing buttons — here's what they do.</p>
            </div>

            <div style={{ maxWidth: 520, width: "100%", background: "#0d0d10", border: "1px solid rgba(184,150,106,0.30)", borderRadius: 12, padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Mulligan section */}
              <div style={{ borderBottom: "1px solid rgba(184,150,106,0.20)", paddingBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em", textTransform: "uppercase", color: "#ee484c", margin: 0 }}>Mulligan</h3>
                </div>
                <div style={{ fontSize: "0.9rem", fontFamily: "'Cinzel', serif", letterSpacing: "0.06em", color: "#b8966a", fontWeight: 600, marginBottom: 8 }}>Cost: 1 Token Off the Board</div>
                <p style={{ fontSize: "1.05rem", fontFamily: "'EB Garamond', serif", color: "#e8e4d8", lineHeight: 1.5, margin: "0 0 12px 0" }}>
                  If you don't like your route hand, you can discard any or all of your routes and redraw — but you have to take one of your tokens off the board and return it to your reserves. You can Mulligan up to twice.
                </p>
                <div style={{ fontSize: "0.95rem", fontFamily: "'EB Garamond', serif", color: "#b0aa9e", fontStyle: "italic", lineHeight: 1.4, paddingLeft: 12, borderLeft: "2px solid rgba(184,150,106,0.30)" }}>
                  Use when: Your starting routes are weak or don't work together. A token in reserve is still useful — the trade is worth it for a better hand.
                </div>
              </div>

              {/* Continue section */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em", textTransform: "uppercase", color: "#ee484c", margin: 0 }}>Continue</h3>
                </div>
                <div style={{ fontSize: "0.9rem", fontFamily: "'Cinzel', serif", letterSpacing: "0.06em", color: "#b8966a", fontWeight: 600, marginBottom: 8 }}>No Cost — Keep Your Current Hand</div>
                <p style={{ fontSize: "1.05rem", fontFamily: "'EB Garamond', serif", color: "#e8e4d8", lineHeight: 1.5, margin: "0 0 12px 0" }}>
                  Skip the Mulligan and start the game with your tokens and routes as dealt. Both players must confirm before the first turn begins.
                </p>
                <div style={{ fontSize: "0.95rem", fontFamily: "'EB Garamond', serif", color: "#b0aa9e", fontStyle: "italic", lineHeight: 1.4, paddingLeft: 12, borderLeft: "2px solid rgba(184,150,106,0.30)" }}>
                  Use when: Your routes look solid and keeping all three tokens on the board is the stronger opening.
                </div>
              </div>

            </div>

            <button onClick={advance} style={nextBtnStyle}>Got it →</button>
          </div>
        )}

        {stepId === "invasion" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Capture Enemy Tokens"
              body={
                invBCaptured
                  ? "Captured! The Brake token goes to your Captives."
                  : !invSelected
                    ? "Moving your token onto an occupied enemy square is called invading. Select your Wake token, then figure out which route lands on the Brake token."
                    : "Which route reaches the enemy? Think about direction and distance."
              }
            />
            <TutBoard
              tokens={[
                ...(invBCaptured ? [] : [{ id: "b1", x: INV_B.x, y: INV_B.y, owner: "B" as Player }]),
                { id: "w1", x: invWPos.x, y: invWPos.y, owner: "W" },
              ]}
              selectedCell={invSelected ? invWPos : null}
              pulse={pulse} onCell={handleInvasionCell} cellSizePx={cellSize}
            />
            {!invBCaptured && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b8966a" }}>Route Hand</span>
                <div style={{ display: "flex", gap: 10 }}>
                  {INV_ROUTES.map((r, i) => <RouteDomino key={i} route={r} active={invSelected} pulse={pulse} onClick={() => handleInvasionRoute(i)} />)}
                </div>
              </div>
            )}
            {!invSelected && !invBCaptured && <HintLabel>↑ Click your Wake token first</HintLabel>}
            {invSelected && <HintLabel>↑ Pick the route that reaches the Brake token</HintLabel>}
          </div>
        )}

        {stepId === "friendly_fire" && (
          <StaticStep
            title="One Rule: No Friendly Fire"
            body="You cannot move a token onto a square already occupied by one of your own tokens. If a route would land there, it's blocked. Choose a different token or route."
            onNext={advance} nextLabel="Got it →"
            board={
              <TutBoard
                tokens={[{ id: "w1", x: 2, y: 2, owner: "W" }, { id: "w2", x: 3, y: 2, owner: "W" }, { id: "b1", x: 4, y: 4, owner: "B" }]}
                highlightCells={[{ x: 3, y: 2 }]}
                pulse={false} onCell={() => {}} cellSizePx={cellSize}
              />
            }
            belowText="The ← route from this token would land on your own piece — that's not allowed."
          />
        )}

        {stepId === "reinforce" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Reinforcement Phase"
              body={reinforcedPos ? "Reinforcement placed!" : "After your 3 moves, you place 1 free token from your reserves onto any empty square — you cannot place on top of an existing token. Click an empty square to place yours."}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TokenDisc owner="W" size={28} />
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: "0.15em", color: "#b8966a", textTransform: "uppercase" }}>Reserve — 1 to place</span>
            </div>
            <TutBoard tokens={reinforceTokens} pulse={pulse} onCell={handleReinforceCell} cellSizePx={cellSize} />
            {!reinforcedPos && <HintLabel>↑ Click any empty square</HintLabel>}
          </div>
        )}

        {stepId === "swap" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}>
            <InstructionCard
              title="Route Swap Phase"
              body={swapDone ? "Swap complete! Your new route is in your hand." : swapDiscardIdx === null ? "At the end of every turn, you swap one route. Discard one from your hand into the queue, then pick one up from the queue. Select a route from your hand to discard." : "Now select a route from the queue to pick up."}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 16 : 40, width: "100%", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b8966a" }}>Queue</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {SWAP_QUEUE.map((r, i) => (
                    <RouteDomino key={i} route={r} active={swapDiscardIdx !== null && !swapDone} pulse={pulse} onClick={() => handleSwapQueueClick(i)} dim={swapDone && swapPickupIdx !== i} />
                  ))}
                </div>
                {swapDiscardIdx !== null && !swapDone && <HintLabel>↑ Pick one up</HintLabel>}
              </div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 22, color: "rgba(184,150,106,0.4)", paddingTop: 24 }}>⇄</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b8966a" }}>Your Hand</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {SWAP_HAND.map((r, i) => (
                    <RouteDomino key={i} route={r} used={swapDone && swapDiscardIdx === i} active={swapDiscardIdx === null && !swapDone} pulse={pulse} onClick={() => handleSwapHandClick(i)} />
                  ))}
                </div>
                {swapDiscardIdx === null && !swapDone && <HintLabel>↑ Pick one to discard</HintLabel>}
              </div>
            </div>
          </div>
        )}

        {stepId === "siege2" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Siege"
              body={siege2Done ? "Siege! The Wake token is now locked and cannot move." : "When a token is surrounded on 4 or more sides by enemy tokens, it is sieged and cannot move. Sieges can be completed by movement or by placing a reinforcement. Click the highlighted square to complete this one."}
            />
            <TutBoard
              tokens={siege2Done ? SIEGE2_POST_TOKENS : SIEGE2_PRE_TOKENS}
              highlightCells={siege2Done ? [] : [{ x: 3, y: 2 }]}
              pulse={pulse}
              onCell={() => { if (!siege2Done) { setSiege2Done(true); playPlace() } }}
              cellSizePx={cellSize}
            />
            {!siege2Done && <HintLabel>↑ Click the highlighted square to place the B reinforcement</HintLabel>}
            {siege2Done && <button onClick={advance} style={nextBtnStyle}>Got it →</button>}
          </div>
        )}

        {stepId === "siege3" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Siege by Movement"
              body={
                siege3Done
                  ? "Siege! The Brake token is locked and cannot move."
                  : !siege3Selected
                    ? "Three of your tokens already surround the Brake token. Move the fourth Wake token to complete the siege. Select it to begin."
                    : "Pick the route that lands your token on the open side."
              }
            />
            <TutBoard
              tokens={siege3Done ? SIEGE3_POST_TOKENS : [
                ...SIEGE3_PRE_TOKENS.filter(t => t.id !== "wm"),
                { id: "wm", x: siege3WPos.x, y: siege3WPos.y, owner: "W" as Player },
              ]}
              selectedCell={siege3Selected ? siege3WPos : null}
              pulse={pulse}
              onCell={handleSiege3Cell}
              cellSizePx={cellSize}
            />
            {!siege3Done && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b8966a" }}>Route Hand</span>
                <div style={{ display: "flex", gap: 10 }}>
                  {SIEGE3_ROUTES.map((r, i) => (
                    <RouteDomino key={i} route={r} active={siege3Selected} pulse={pulse} onClick={() => handleSiege3Route(i)} />
                  ))}
                </div>
              </div>
            )}
            {!siege3Selected && !siege3Done && <HintLabel>↑ Click your Wake token to select it</HintLabel>}
            {siege3Selected && <HintLabel>↑ Pick the route that completes the siege</HintLabel>}
          </div>
        )}

        {stepId === "special_actions" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}>
            <InstructionCard title="Special Actions" body="During your turn you can spend resources on special actions. Here are the icons you'll see in the game — tap the ? button in-game for full details, or watch the video guide." />
            <SpecialActionsDisplay isMobile={isMobile} />
            <button onClick={advance} style={nextBtnStyle}>Got it →</button>
          </div>
        )}

        {stepId === "invite" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}>
            <InstructionCard title="Challenge Your Friends" body='Click your avatar in the top-right corner to open the menu. Tap "Copy Invite Link" and share it with anyone — they can jump straight into a game with you.' />
            <InviteDropdownMock />
            <button onClick={advance} style={nextBtnStyle}>Got it →</button>
          </div>
        )}

        {stepId === "orders" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}>
            <InstructionCard
              title="Join an Order"
              body="Orders are philosophies of play — each with unique token designs and strategic principles. Joining one gives you access to exclusive cosmetics and a community of players who share your approach to the game. Find the full list under Orders in the navigation menu."
            />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, background: "rgba(184,150,106,0.07)", border: "1px solid rgba(184,150,106,0.22)", borderRadius: 12, padding: "20px 28px", maxWidth: 360, width: "100%", textAlign: "center" }}>
              <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#b8966a" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: "#b8966a" }}>Orders</span>
              <span style={{ fontSize: "0.95rem", color: "#b0aa9e", lineHeight: 1.7 }}>
                Browse and join an Order from the <span style={{ color: "#e8e4d8", fontWeight: 500 }}>Orders</span> link in the top navigation. Each Order has its own doctrine, token style, and community.
              </span>
            </div>
            <button onClick={launchGame} style={nextBtnStyle}>Play vs Glen →</button>
          </div>
        )}

      </div>{/* end main scroll area */}
      </div>{/* end body row */}
      {tocOpen && (
        <div
          onClick={() => setTocOpen(false)}
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: "#0d0d10", border: "1px solid rgba(184,150,106,0.30)", borderRadius: 12, padding: 20, width: "100%", maxWidth: 420, maxHeight: "80vh", overflowY: "auto", color: "#e8e4d8" }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: "1rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#b8966a" }}>Contents</span>
              <button onClick={() => setTocOpen(false)} style={{ background: "none", border: "none", color: "#6b6558", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1, padding: 4 }}>×</button>
            </div>

            {/* Groups */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {TOC_GROUPS.map((group) => (
                <div key={group.label}>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "#6b6558", marginBottom: 6 }}>{group.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {group.steps.map((id) => {
                      const idx = STEP_ORDER.indexOf(id)
                      const isCurrent = stepIdx === idx
                      const isVisited = idx < stepIdx
                      return (
                        <button
                          key={id}
                          onClick={() => { setStepIdx(idx); setTocOpen(false) }}
                          style={{
                            background: isCurrent ? "rgba(93,232,247,0.08)" : "transparent",
                            border: "none",
                            borderLeft: isCurrent ? "2px solid #5de8f7" : "2px solid transparent",
                            borderRadius: "0 6px 6px 0",
                            padding: "8px 12px",
                            textAlign: "left",
                            cursor: "pointer",
                            fontFamily: "'EB Garamond',serif",
                            fontSize: "1rem",
                            color: isCurrent ? "#e8e4d8" : isVisited ? "#b0aa9e" : "#6b6558",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: isVisited ? "#5de8f7" : isCurrent ? "#5de8f7" : "#2e2e36", minWidth: 14 }}>
                            {isVisited || isCurrent ? "✓" : ""}
                          </span>
                          {LABEL_FOR_STEP[id]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => setTocOpen(false)} style={{ marginTop: 20, width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", color: "#b8966a", fontWeight: 700, fontFamily: "'Cinzel',serif", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontSize: "0.9rem" }}>
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Shared UI helpers ─────────────────────────────────────────────────────────

function InstructionCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
      <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "1.15rem", fontWeight: 700, color: "#e8e4d8", marginBottom: 10, letterSpacing: "0.05em" }}>
        {title}
      </h2>
      <p style={{ fontSize: "1.05rem", color: "#b0aa9e", lineHeight: 1.75, margin: 0 }}>{body}</p>
    </div>
  )
}

function HintLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "0.78rem", color: "rgba(93,232,247,0.60)", fontFamily: "'Cinzel', serif", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center", margin: 0 }}>
      {children}
    </p>
  )
}

function StaticStep({ title, body, onNext, nextLabel, board, below, belowText }: {
  title: string; body: string; onNext: () => void; nextLabel: string
  board?: React.ReactNode; below?: React.ReactNode; belowText?: string
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
      <InstructionCard title={title} body={body} />
      {board}
      {below}
      {belowText && <p style={{ fontSize: "0.9rem", color: "#6b6558", fontFamily: "'EB Garamond', serif", textAlign: "center", maxWidth: 480, fontStyle: "italic", margin: 0 }}>{belowText}</p>}
      <button onClick={onNext} style={nextBtnStyle}>{nextLabel}</button>
    </div>
  )
}

// ─── Special Actions display ──────────────────────────────────────────────────

function SpecialActionsDisplay({ isMobile }: { isMobile: boolean }) {
  const iconFill = "#ee484c"
  const actions = [
    {
      label: "Early Swap",
      hint: "Swap a route card before making your moves.",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill={iconFill}><path d="M576 160C576 210.2 516.9 285.1 491.4 315C487.6 319.4 482 321.1 476.9 320L384 320C366.3 320 352 334.3 352 352C352 369.7 366.3 384 384 384L480 384C533 384 576 427 576 480C576 533 533 576 480 576L203.6 576C212.3 566.1 222.9 553.4 233.6 539.2C239.9 530.8 246.4 521.6 252.6 512L480 512C497.7 512 512 497.7 512 480C512 462.3 497.7 448 480 448L384 448C331 448 288 405 288 352C288 299 331 256 384 256L423.8 256C402.8 224.5 384 188.3 384 160C384 107 427 64 480 64C533 64 576 107 576 160zM181.1 553.1C177.3 557.4 173.9 561.2 171 564.4L169.2 566.4L169 566.2C163 570.8 154.4 570.2 149 564.4C123.8 537 64 466.5 64 416C64 363 107 320 160 320C213 320 256 363 256 416C256 446 234.9 483 212.5 513.9C201.8 528.6 190.8 541.9 181.7 552.4L181.1 553.1zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM480 192C497.7 192 512 177.7 512 160C512 142.3 497.7 128 480 128C462.3 128 448 142.3 448 160C448 177.7 462.3 192 480 192z"/></svg>,
    },
    {
      label: "Extra Reinf.",
      hint: "Spend void tokens to place an extra reinforcement.",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill={iconFill}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64z"/></svg>,
    },
    {
      label: "Ransom",
      hint: "Spend captives to retrieve your token from void.",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill={iconFill}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64zM320 130.8L320 508.9C458 442.1 495.1 294.1 496 205.5L320 130.9L320 130.9z"/></svg>,
    },
    {
      label: "Defection",
      hint: "Sacrifice a token to claim one from the enemy void.",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill={iconFill}><path d="M512 320C512 214 426 128 320 128L320 512C426 512 512 426 512 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg>,
    },
    {
      label: "Recoil",
      hint: "Move one of your tokens 1 space during your opponent's turn.",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 640 640" fill={iconFill}><path d="M168.1 531.1L156.9 540.1C153.7 542.6 149.8 544 145.8 544C136 544 128 536 128 526.2L128 256C128 150 214 64 320 64C426 64 512 150 512 256L512 526.2C512 536 504 544 494.2 544C490.2 544 486.3 542.6 483.1 540.1L471.9 531.1C458.5 520.4 439.1 522.1 427.8 535L397.3 570C394 573.8 389.1 576 384 576C378.9 576 374.1 573.8 370.7 570L344.1 539.5C331.4 524.9 308.7 524.9 295.9 539.5L269.3 570C266 573.8 261.1 576 256 576C250.9 576 246.1 573.8 242.7 570L212.2 535C200.9 522.1 181.5 520.4 168.1 531.1zM288 256C288 238.3 273.7 224 256 224C238.3 224 224 238.3 224 256C224 273.7 238.3 288 256 288C273.7 288 288 273.7 288 256zM384 288C401.7 288 416 273.7 416 256C416 238.3 401.7 224 384 224C366.3 224 352 238.3 352 256C352 273.7 366.3 288 384 288z"/></svg>,
    },
  ]
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 520, width: "100%" }}>
      {actions.map((a, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "rgba(184,150,106,0.09)", border: "1px solid rgba(184,150,106,0.25)", borderRadius: 10, padding: "14px 12px", width: isMobile ? "42%" : 90, textAlign: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: "#0d0d10", border: "1px solid #6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {a.icon}
          </div>
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#b8966a" }}>{a.label}</span>
          <span style={{ fontSize: "0.78rem", color: "#7a7670", lineHeight: 1.4 }}>{a.hint}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Invite dropdown mock ────────────────────────────────────────────────────

function InviteDropdownMock() {
  return (
    <div style={{ position: "relative", width: 220 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(13,13,16,0.99)", border: "1px solid rgba(184,150,106,0.25)", borderRadius: "8px 8px 0 0" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(184,150,106,0.15)", border: "1px solid rgba(184,150,106,0.30)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, color: "#b8966a" }}>Y</div>
        <div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 600, color: "#e8e4d8", letterSpacing: "0.08em" }}>yourname</div>
          <div style={{ fontSize: "0.75rem", color: "#6b6558" }}>Adept · 850 Elo</div>
        </div>
      </div>
      {[
        { label: "Profile", dim: true },
        { label: "Skins", dim: true },
        null,
        { label: "Copy Invite Link", highlight: true },
        null,
        { label: "Sign Out", dim: true },
      ].map((item, i) =>
        item === null ? (
          <div key={i} style={{ height: 1, background: "rgba(255,255,255,0.07)", borderLeft: "1px solid rgba(184,150,106,0.25)", borderRight: "1px solid rgba(184,150,106,0.25)" }} />
        ) : (
          <div key={i} style={{ padding: "11px 16px", background: item.highlight ? "rgba(93,232,247,0.10)" : "rgba(13,13,16,0.99)", borderLeft: "1px solid rgba(184,150,106,0.25)", borderRight: "1px solid rgba(184,150,106,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: item.highlight ? "#5de8f7" : "#6b6558" }}>{item.label}</span>
            {item.highlight && <span style={{ fontSize: 12, color: "rgba(93,232,247,0.6)" }}>↗</span>}
          </div>
        ),
      )}
      <div style={{ height: 2, background: "rgba(13,13,16,0.99)", border: "1px solid rgba(184,150,106,0.25)", borderTop: "none", borderRadius: "0 0 8px 8px" }} />
      <div style={{ marginTop: 12, textAlign: "center", fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5de8f7" }}>
        ↑ Share this link to invite friends
      </div>
    </div>
  )
}

// end of file
