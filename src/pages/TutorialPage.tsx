// src/components/TutorialPage.tsx
// Full tutorial walkthrough — scripted, interactive, matches game look & feel.

import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Header } from "../components/Header"
import { sounds } from "../sounds"
import { supabase } from "../services/supabase"
import { MatchIntroOverlay } from "../components/MatchIntroOverlay"
import { RouteIcon } from "../RouteIcon"

// ─── Props ────────────────────────────────────────────────────────────────────

interface TutorialPageProps {
  onComplete: () => void
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
function applyRoute(pos: Cell, route: TutRoute): Cell {
  const DIRS: Record<number, [number, number]> = {
    1: [0, 1],
    2: [1, 1],
    3: [1, 0],
    4: [1, -1],
    5: [0, -1],
    6: [-1, -1],
    7: [-1, 0],
    8: [-1, 1],
  }
  const [dx, dy] = DIRS[route.dir]
  return {
    x: ((pos.x + dx * route.dist) % SIZE + SIZE) % SIZE,
    y: ((pos.y + dy * route.dist) % SIZE + SIZE) % SIZE,
  }
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

// ─── Sound helper ─────────────────────────────────────────────────────────────

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

// ─── Loading screen ───────────────────────────────────────────────────────────

type IntroProfileRow = {
  id: string
  username: string | null
  avatar_url: string | null
  country_code: string | null
  account_tier: string | null
  is_ai: boolean | null
}

type IntroStatsRow = {
  user_id: string
  elo_standard: number | null
}

function LoadingScreen({ onDone, leftUserId }: { onDone: () => void; leftUserId: string | null }) {
  const [rightUserId, setRightUserId] = useState<string | null>(null)
  const [leftProfile, setLeftProfile] = useState<IntroProfileRow | null>(null)
  const [rightProfile, setRightProfile] = useState<IntroProfileRow | null>(null)
  const [leftStats, setLeftStats] = useState<IntroStatsRow | null>(null)
  const [rightStats, setRightStats] = useState<IntroStatsRow | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: rookie, error: rookieErr } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, country_code, account_tier, is_ai")
        .eq("is_ai", true)
        .ilike("username", "rookie")
        .limit(1)
      if (cancelled) return
      if (!rookieErr && rookie && rookie.length > 0) { setRightUserId(rookie[0].id); return }
      const { data: anyAi, error: anyAiErr } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, country_code, account_tier, is_ai")
        .eq("is_ai", true)
        .limit(1)
      if (cancelled) return
      if (!anyAiErr && anyAi && anyAi.length > 0) setRightUserId(anyAi[0].id)
      else setRightUserId(null)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ids: string[] = []
      if (leftUserId) ids.push(leftUserId)
      if (rightUserId) ids.push(rightUserId)
      if (ids.length === 0) return

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, country_code, account_tier, is_ai")
        .in("id", ids)
      if (cancelled) return
      if (profs?.length) {
        const map = new Map<string, IntroProfileRow>()
        for (const p of profs as any) map.set(p.id, p)
        setLeftProfile(leftUserId ? map.get(leftUserId) ?? null : null)
        setRightProfile(rightUserId ? map.get(rightUserId) ?? null : null)
      }

      const { data: stats } = await supabase
        .from("player_stats")
        .select("user_id, elo_standard")
        .in("user_id", ids)
      if (cancelled) return
      if (stats?.length) {
        const map = new Map<string, IntroStatsRow>()
        for (const s of stats as any) map.set(s.user_id, s)
        setLeftStats(leftUserId ? map.get(leftUserId) ?? null : null)
        setRightStats(rightUserId ? map.get(rightUserId) ?? null : null)
      }
    })()
    return () => { cancelled = true }
  }, [leftUserId, rightUserId])

  const isAI = !!rightProfile?.is_ai
  const rightName = rightProfile?.username ?? (isAI ? "Rookie" : "Opponent")

  return (
    <MatchIntroOverlay
      onDone={onDone}
      left={{
        username: leftProfile?.username ?? "You",
        avatar_url: leftProfile?.avatar_url ?? null,
        country_code: leftProfile?.country_code ?? null,
        elo: leftStats?.elo_standard ?? null,
        tag: "YOU",
        account_tier: leftProfile?.account_tier ?? null,
        accent: "#5de8f7",
      }}
      right={{
        username: rightName,
        avatar_url: rightProfile?.avatar_url ?? null,
        country_code: rightProfile?.country_code ?? null,
        elo: rightStats?.elo_standard ?? null,
        tag: isAI ? "AI" : null,
        account_tier: rightProfile?.account_tier ?? null,
        accent: "#b8966a",
      }}
      subtitleLine={`Now playing vs ${rightName}`}
      labels={[
        "Preparing your match...",
        `Loading ${rightName}...`,
        "Shuffling route cards...",
        "Placing opening tokens...",
        "Starting game...",
      ]}
    />
  )
}

// ─── STEP ID enum ─────────────────────────────────────────────────────────────

type StepId =
  | "welcome"
  | "opening_intro"
  | "opening"
  | "action_intro"
  | "action"
  | "invasion_intro"
  | "invasion"
  | "friendly_fire"
  | "reinforce_intro"
  | "reinforce"
  | "swap_intro"
  | "swap"
  | "siege1"
  | "siege2"
  | "special_actions"
  | "invite"
  | "orders"

const STEP_ORDER: StepId[] = [
  "welcome", "opening_intro", "opening", "action_intro", "action",
  "invasion_intro", "invasion", "friendly_fire", "reinforce_intro", "reinforce",
  "swap_intro", "swap", "siege1", "siege2", "special_actions", "invite", "orders",
]

const PHASE_FOR_STEP: Record<StepId, string> = {
  welcome: "Intro",
  opening_intro: "Opening",
  opening: "Opening",
  action_intro: "Action",
  action: "Action",
  invasion_intro: "Action",
  invasion: "Action",
  friendly_fire: "Action",
  reinforce_intro: "Reinforce",
  reinforce: "Reinforce",
  swap_intro: "Swap",
  swap: "Swap",
  siege1: "Siege",
  siege2: "Siege",
  special_actions: "Special Actions",
  invite: "Invite",
  orders: "Orders",
}

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
  const [loading, setLoading] = useState(false)
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
  }, [stepId])

  function showWarning(msg: string) {
    setWarning(msg)
    if (warningTimer.current) clearTimeout(warningTimer.current)
    warningTimer.current = setTimeout(() => setWarning(null), 2500)
  }
  function advance() {
    if (stepIdx >= STEP_ORDER.length - 1) setLoading(true)
    else setStepIdx((i) => i + 1)
  }
  function goBack() { if (stepIdx > 0) setStepIdx((i) => i - 1) }
  function restartTutorial() { clearAllTimeouts(); setLoading(false); setStepIdx(0) }
  function skipTutorial() { clearAllTimeouts(); setLoading(true) }

  const [isMobile, setIsMobile] = useState(window.innerWidth < 600)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 600)
    window.addEventListener("resize", h)
    return () => window.removeEventListener("resize", h)
  }, [])
  const cellSize = isMobile ? CELL_SM : CELL

  if (loading) return <LoadingScreen onDone={onComplete} leftUserId={currentUserId} />

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

      {/* Main scroll area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 20px 32px", gap: 20 }}>

        {stepId === "welcome" && (
          <StaticStep
            title="Welcome to Vekke"
            body="Vekke is a fast strategic board game for two players — Wake (W) versus Brake (B). Each game lasts around 5–10 minutes. This walkthrough teaches you everything you need to start playing."
            onNext={advance} nextLabel="Let's go →"
            board={<TutBoard tokens={[]} pulse={pulse} onCell={() => {}} cellSizePx={cellSize} />}
          />
        )}

        {stepId === "opening_intro" && (
          <StaticStep
            title="Opening Phase"
            body="The game begins with an opening phase. Players alternate placing tokens on the board — you place one, your opponent places one, until both sides have 3 tokens. Click any empty square to place yours."
            onNext={advance} nextLabel="Got it →"
            board={<TutBoard tokens={[]} pulse={pulse} onCell={() => {}} cellSizePx={cellSize} />}
          />
        )}

        {stepId === "opening" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Place Your Tokens"
              body={
                openingBPending
                  ? "Brake is placing their token..."
                  : openingWCount >= 3
                    ? "Opening complete!"
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

        {stepId === "invasion_intro" && (
          <StaticStep
            title="Invading — Capturing Enemy Tokens"
            body="To capture an enemy token, move your token onto the same square. You don't click the enemy — you select your token and play a route that lands on them. Think about which route reaches the enemy."
            onNext={advance} nextLabel="Try it →"
            board={
              <TutBoard
                tokens={[{ id: "w1", x: INV_W.x, y: INV_W.y, owner: "W" }, { id: "b1", x: INV_B.x, y: INV_B.y, owner: "B" }]}
                pulse={pulse} onCell={() => {}} cellSizePx={cellSize}
              />
            }
          />
        )}

        {stepId === "invasion" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Invade the Enemy"
              body={
                invBCaptured
                  ? "Captured! The Brake token goes to your Captives."
                  : !invSelected
                    ? "Select your Wake token, then figure out which route will land on the Brake token."
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

        {stepId === "reinforce_intro" && (
          <StaticStep
            title="Reinforcement Phase"
            body="After completing your 3 moves, you get 1 free reinforcement each turn. Place a new token from your reserve anywhere on the board — any unoccupied square."
            onNext={advance} nextLabel="Try it →"
            board={
              <TutBoard
                tokens={[{ id: "w1", x: 4, y: 2, owner: "W" }, { id: "w2", x: 2, y: 4, owner: "W" }, { id: "b1", x: 3, y: 3, owner: "B" }, { id: "b2", x: 1, y: 1, owner: "B" }]}
                pulse={pulse} onCell={() => {}} cellSizePx={cellSize}
              />
            }
          />
        )}

        {stepId === "reinforce" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard title="Place Your Reinforcement" body={reinforcedPos ? "Reinforcement placed!" : "Click any empty square to place your reinforcement token."} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TokenDisc owner="W" size={28} />
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: "0.15em", color: "#b8966a", textTransform: "uppercase" }}>Reserve — 1 to place</span>
            </div>
            <TutBoard tokens={reinforceTokens} pulse={pulse} onCell={handleReinforceCell} cellSizePx={cellSize} />
            {!reinforcedPos && <HintLabel>↑ Click any empty square</HintLabel>}
          </div>
        )}

        {stepId === "swap_intro" && (
          <StaticStep
            title="Route Swap Phase"
            body="At the end of every turn, you swap one route card. Discard one from your hand into the queue, and pick one up from the queue. This keeps your options fresh each turn."
            onNext={advance} nextLabel="Try it →"
          />
        )}

        {stepId === "swap" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}>
            <InstructionCard
              title="Route Swap"
              body={swapDone ? "Swap complete! Your new route is in your hand." : swapDiscardIdx === null ? "Select a route from your hand (right) to discard." : "Now select a route from the queue (left) to pick up."}
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

        {stepId === "siege1" && (
          <StaticStep
            title="Siege — Surrounded Tokens"
            body="When a token is surrounded on 4 or more sides by enemy tokens, it is under siege. Sieged tokens cannot move until the siege is broken. Siege can happen through movement."
            onNext={advance} nextLabel="Got it →"
            board={<TutBoard tokens={SIEGE1_TOKENS} pulse={pulse} onCell={() => {}} cellSizePx={cellSize} />}
            belowText="This Wake token is surrounded on all 4 orthogonal sides. It cannot move."
          />
        )}

        {stepId === "siege2" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
            <InstructionCard
              title="Siege via Reinforcement"
              body={siege2Done ? "Siege! The Wake token is now locked and cannot move." : "Reinforcements can also complete a siege. Place the Brake reinforcement to lock the Wake token."}
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
            <button onClick={advance} style={nextBtnStyle}>Play vs Rookie →</button>
          </div>
        )}

      </div>
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
  const iconStroke = "#ee484c"
  const actions = [
    { label: "Early Swap", hint: "Swap a route card before making your moves.", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg> },
    { label: "Extra Reinf.", hint: "Spend void tokens to place an extra reinforcement.", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="M9 12h6" /><path d="M12 9v6" /></svg> },
    { label: "Ransom", hint: "Spend captives to retrieve your token from void.", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="M12 22V2" /></svg> },
    { label: "Defection", hint: "Sacrifice a token to claim one from the enemy void.", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="7" /><circle cx="15" cy="15" r="7" /></svg> },
    { label: "Recoil", hint: "Move one of your tokens 1 space during your opponent's turn.", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2"><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" /></svg> },
  ]
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 520, width: "100%" }}>
      {actions.map((a, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "rgba(184,150,106,0.09)", border: "1px solid rgba(184,150,106,0.25)", borderRadius: 10, padding: "14px 12px", width: isMobile ? "42%" : 90, textAlign: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#0d0d10", border: "1px solid #6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
