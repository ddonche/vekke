import React, { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { GridBoard } from "../GridBoard"
import { Header } from "../components/Header"

type Player = "W" | "B"

type ReplayLogRow = {
  game_id: string
  created_at: string
  ended_at: string | null
  wake_id: string
  brake_id: string
  mode: string | null
  time_control: string | null
  winner: "W" | "B" | null
  reason: string | null
  vgn: string | null
  logs: (string | { text: string; step: number })[] | null
  winner_id: string | null
  loser_id: string | null
  is_vs_ai: boolean | null
}

type BoardToken = {
  id: string
  owner: Player
  square: string
}

type ReplayState = {
  board: Record<string, BoardToken>
  reserves: Record<Player, number>
  captives: Record<Player, number>
  voids: Record<Player, number>
  round: number
  lastText: string
}

type ReplayStep = {
  label: string
  state: ReplayState
  isNote?: boolean
}

type ParsedEvent =
  | { kind: "round"; n: number }
  | { kind: "note"; text: string }
  | {
      kind: "transfer"
      p?: Player
      from: string
      to: string
      route?: string
      count?: number
      yieldCount?: number
      winner?: Player
      loser?: Player
      winType?: string
      notes: string[]
      raw: string
    }

function emptyState(): ReplayState {
  return {
    board: {},
    reserves: { W: 18, B: 18 },
    captives: { W: 0, B: 0 },
    voids: { W: 0, B: 0 },
    round: 1,
    lastText: "Start",
  }
}

function cloneState(s: ReplayState): ReplayState {
  return {
    board: { ...s.board },
    reserves: { ...s.reserves },
    captives: { ...s.captives },
    voids: { ...s.voids },
    round: s.round,
    lastText: s.lastText,
  }
}

function isSquare(v: string) {
  return /^[A-F][1-6]$/.test(v)
}

function squareKey(x: number, y: number) {
  return `${String.fromCharCode(65 + x)}${y + 1}`
}

// Convert replay board (keyed "A1"…"F6") → GridBoard's Map<"x,y", Token>
function boardMapFromState(board: Record<string, BoardToken>): Map<string, { id: string; owner: Player }> {
  const map = new Map<string, { id: string; owner: Player }>()
  for (const [sq, tok] of Object.entries(board)) {
    const col = sq.charCodeAt(0) - 65   // A→0 … F→5
    const row = parseInt(sq[1], 10) - 1  // 1→0 … 6→5
    if (col >= 0 && col < 6 && row >= 0 && row < 6) {
      map.set(`${col},${row}`, { id: tok.id, owner: tok.owner })
    }
  }
  return map
}

function extractNotes(parts: string[]): string[] {
  const notes: string[] = []
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "NOTE" && i + 1 < parts.length && parts[i + 1].startsWith("text=")) {
      let text = parts[i + 1].slice(5)
      if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1)
      text = text.replace(/\\"/g, '"')
      notes.push(text)
      i++ // skip the text= part
    }
  }
  return notes
}

function parseVgn(vgn: string): ParsedEvent[] {
  const out: ParsedEvent[] = []
  const lines = vgn.split("\n").map((x) => x.trim()).filter(Boolean)

  for (const line of lines) {
    if (line.startsWith("META|")) continue

    const parts = line.split("|").map((p) => p.trim()).filter(Boolean)
    const body = parts.filter((p) => !p.startsWith("t=") && !p.startsWith("dt="))

    if (body.length === 0) continue

    if (body[0].startsWith("ROUND")) {
      const nPart = body.find((p) => p.startsWith("n="))
      const notes = extractNotes(parts)
      out.push({ kind: "round", n: Number(nPart?.slice(2) ?? "1") })
      for (const text of notes) out.push({ kind: "note", text })
      continue
    }

    // Standalone NOTE line (legacy / fallback)
    if (body[0] === "NOTE") {
      const notes = extractNotes(parts)
      for (const text of notes) out.push({ kind: "note", text })
      continue
    }

    if (body[0].startsWith("WIN") || body[0].startsWith("LOSS")) {
      const winType = body.find((p) => p.startsWith("type="))?.slice(5)
      const winner = body.find((p) => p.startsWith("winner="))?.slice(7) as Player | undefined
      const loser = body.find((p) => p.startsWith("loser="))?.slice(6) as Player | undefined
      const notes = extractNotes(parts)
      out.push({ kind: "transfer", raw: line, from: "", to: "", winner, loser, winType, notes })
      continue
    }

    const p = body.find((x) => x.startsWith("p="))?.slice(2) as Player | undefined
    const from = body.find((x) => x.startsWith("from="))?.slice(5) ?? ""
    const to = body.find((x) => x.startsWith("to="))?.slice(3) ?? ""
    const route = body.find((x) => x.startsWith("route="))?.slice(6)
    const countStr = body.find((x) => x.startsWith("count="))?.slice(6)
    const yieldStr = body.find((x) => x.startsWith("yield="))?.slice(6)
    const notes = extractNotes(parts)

    out.push({
      kind: "transfer",
      p, from, to, route,
      count: countStr ? Number(countStr) : undefined,
      yieldCount: yieldStr ? Number(yieldStr) : undefined,
      notes,
      raw: line,
    })
  }

  return out
}

function makeTokenId(owner: Player, n: number) {
  return `${owner}${n}`
}

function replayFromVgn(vgn: string): ReplayStep[] {
  const events = parseVgn(vgn)
  const steps: ReplayStep[] = []
  let state = emptyState()
  let serial: Record<Player, number> = { W: 0, B: 0 }

  let pendingCapturedOwner: Player | null = null

  steps.push({
    label: "Start",
    state: cloneState(state),
  })

  function addStep(label: string) {
    const s = cloneState(state)
    s.lastText = label
    steps.push({
      label,
      state: s,
    })
  }

  function addNotes(notes: string[]) {
    if (notes.length === 0) return
    for (const text of notes) {
      const s = cloneState(state)
      s.lastText = text
      steps.push({ label: text, state: s, isNote: true })
    }
  }

  for (const ev of events) {
    if (ev.kind === "round") {
      state.round = ev.n
      // Don't add a visible step for round markers — notes on the same line will
      continue
    }

    if (ev.kind === "note") {
      // Standalone note (legacy format)
      const s = cloneState(state)
      s.lastText = ev.text
      steps.push({ label: ev.text, state: s, isNote: true })
      continue
    }

    if (ev.winner && ev.loser && ev.winType) {
      addNotes(ev.notes.length > 0 ? ev.notes : [`${ev.winner} wins by ${ev.winType}`])
      continue
    }

    const p = ev.p
    const from = ev.from
    const to = ev.to

    // Route transfers (DECK↔HAND, QUEUE↔HAND, DECK→QUEUE) have no board
    // state effect in the replay — skip them silently.
    if (ev.route && !ev.p && (from === "DECK" || to === "QUEUE")) {
      continue
    }
    if (ev.route && ev.p && (from === "DECK" || from === "QUEUE" || from === "HAND" || to === "HAND" || to === "DECK")) {
      continue
    }

    if (!from && !to) {
      addNotes(ev.notes.length > 0 ? ev.notes : [ev.raw])
      continue
    }

    if (p && isSquare(from) && isSquare(to)) {
      const moving = state.board[from]
      if (moving && moving.owner === p) {
        const occupant = state.board[to]
        if (occupant && occupant.owner !== p) {
          // Capture is implicit in the movement — remove the token and credit captives
          delete state.board[to]
          state.captives[p] += 1
        }
        delete state.board[from]
        state.board[to] = { ...moving, square: to }
        addNotes(ev.notes)
        continue
      }
    }

    if (p && from === "RESERVE" && isSquare(to)) {
      serial[p] += 1
      state.reserves[p] = Math.max(0, state.reserves[p] - 1)
      state.board[to] = { id: makeTokenId(p, serial[p]), owner: p, square: to }
      addNotes(ev.notes.length > 0 ? ev.notes : [`${p} placed at ${to}`])
      continue
    }

    if (p && isSquare(from) && to === "RESERVE") {
      const tok = state.board[from]
      if (tok && tok.owner === p) {
        delete state.board[from]
        state.reserves[p] += ev.count ?? 1
      }
      addNotes(ev.notes.length > 0 ? ev.notes : [`${p} ${from} → RESERVE`])
      continue
    }

    if (p && from === "CAPTIVE" && to === "VOID") {
      const amt = ev.yieldCount ?? ev.count ?? 1
      state.captives[p] = Math.max(0, state.captives[p] - amt)
      state.voids[p] += amt
      addNotes(ev.notes)
      continue
    }

    if (p && from === "RESERVE" && to === "VOID") {
      const amt = ev.yieldCount ?? ev.count ?? 1
      state.reserves[p] = Math.max(0, state.reserves[p] - amt)
      state.voids[p] += amt
      addNotes(ev.notes)
      continue
    }

    if (p && from === "VOID" && to === "RESERVE") {
      const amt = ev.count ?? 1
      state.voids[p] = Math.max(0, state.voids[p] - amt)
      state.reserves[p] += amt
      addNotes(ev.notes)
      continue
    }

    if (p && from === "VOID" && to === "CAPTIVE") {
      const amt = ev.count ?? 1
      const enemy = p === "W" ? "B" : "W"
      state.voids[enemy] = Math.max(0, state.voids[enemy] - amt)
      state.captives[p] += amt
      addNotes(ev.notes)
      continue
    }

    // Unrecognised transfer — emit notes if present, else raw
    addNotes(ev.notes.length > 0 ? ev.notes : [ev.raw])
  }

  return steps
}

function TokenChip({ owner }: { owner: Player }) {
  const bg = owner === "W" ? "#e8e4d8" : "#5de8f7"
  const fg = owner === "W" ? "#111" : "#02171a"
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "999px",
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Cinzel', serif",
        fontWeight: 700,
        fontSize: 12,
        border: "1px solid rgba(0,0,0,0.35)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
      }}
    >
      {owner}
    </div>
  )
}

function BoardView({ state }: { state: ReplayState }) {
  const rows = []
  for (let y = 5; y >= 0; y--) {
    const cells = []
    for (let x = 0; x < 6; x++) {
      const sq = squareKey(x, y)
      const tok = state.board[sq]
      const dark = (x + y) % 2 === 1
      cells.push(
        <div
          key={sq}
          style={{
            width: 72,
            height: 72,
            border: "1px solid rgba(255,255,255,0.08)",
            background: dark ? "#13131a" : "#171720",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 7,
              fontSize: 10,
              color: "#6b6558",
              fontFamily: "monospace",
            }}
          >
            {sq}
          </div>
          {tok ? <TokenChip owner={tok.owner} /> : null}
        </div>
      )
    }
    rows.push(
      <div key={y} style={{ display: "flex" }}>
        {cells}
      </div>
    )
  }
  return <div>{rows}</div>
}

type PlayerInfo = {
  username: string
  avatar_url: string | null
  country_code: string | null
}

export function ReplayPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<ReplayLogRow | null>(null)
  const [moveIndex, setMoveIndex] = useState(0)
  const [wakeInfo, setWakeInfo] = useState<PlayerInfo | null>(null)
  const [brakeInfo, setBrakeInfo] = useState<PlayerInfo | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<{ username?: string; avatar_url?: string | null } | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const activeLogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null
      setCurrentUserId(uid)
      if (!uid) return
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", uid)
        .maybeSingle()
      if (profile) setUserProfile(profile)
    })
  }, [])

  useEffect(() => {
    if (!gameId) {
      setError("Missing game id")
      setLoading(false)
      return
    }

    let mounted = true

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from("game_logs")
          .select(
            "game_id, created_at, ended_at, wake_id, brake_id, mode, time_control, winner, reason, vgn, logs, winner_id, loser_id, is_vs_ai"
          )
          .eq("game_id", gameId)
          .limit(1)

        if (error) throw error
        if (!mounted) return

        const first = Array.isArray(data) ? data[0] : null
        if (!first) throw new Error("Replay not found")

        let safeLogs: (string | { text: string; step: number })[] | null = null

        const rawLogs = (first as any)?.logs

        const isValidEntry = (x: unknown) =>
          typeof x === "string" ||
          (typeof x === "object" && x !== null && "text" in x && "step" in x)

        if (Array.isArray(rawLogs)) {
          safeLogs = rawLogs.filter(isValidEntry)
        } else if (typeof rawLogs === "string") {
          try {
            const parsed = JSON.parse(rawLogs)
            safeLogs = Array.isArray(parsed) ? parsed.filter(isValidEntry) : null
          } catch {
            safeLogs = null
          }
        }

        setRow({
          ...(first as ReplayLogRow),
          logs: safeLogs,
        })

        // Fetch player profiles for both sides
        const playerIds = [first.wake_id, first.brake_id].filter(Boolean) as string[]
        if (playerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, avatar_url, country_code")
            .in("id", playerIds)
          if (profiles && mounted) {
            const byId = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p]))
            if (first.wake_id && byId[first.wake_id]) setWakeInfo(byId[first.wake_id])
            if (first.brake_id && byId[first.brake_id]) setBrakeInfo(byId[first.brake_id])
          }
        }

        setLoading(false)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message ?? String(e))
        setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [gameId])

  const replay = useMemo(() => {
    if (!row?.vgn) return null
    try {
      return replayFromVgn(row.vgn)
    } catch (e: any) {
      return { error: e?.message ?? String(e) } as any
    }
  }, [row?.vgn])

  const humanLogs = useMemo(() => row?.logs ?? [], [row?.logs])

  // Build the log panel from NOTE steps in the VGN — oldest first.
  // Each entry carries the step index so highlighting is exact.
  const noteLogs = useMemo(() => {
    if (!replay || "error" in replay) return []
    return replay
      .map((step, i) => ({ text: step.label, stepIndex: i }))
      .filter((_, i) => replay[i].isNote)
  }, [replay])

  const logText = (entry: any): string =>
    typeof entry === "object" && entry !== null && "text" in entry
      ? entry.text
      : String(entry)

  // The active log entry is the last NOTE whose stepIndex <= moveIndex.
  const activeLogIndex = useMemo(() => {
    if (moveIndex === 0 || noteLogs.length === 0) return -1
    let found = -1
    for (let i = 0; i < noteLogs.length; i++) {
      if (noteLogs[i].stepIndex <= moveIndex) found = i
      else break
    }
    return found
  }, [moveIndex, noteLogs])
  const logContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMoveIndex(0)
  }, [row?.game_id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!replay || "error" in replay) return
      if (e.key === "ArrowLeft") {
        setMoveIndex((i) => Math.max(0, i - 1))
      } else if (e.key === "ArrowRight") {
        setMoveIndex((i) => Math.min(replay.length - 1, i + 1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [replay])

  useEffect(() => {
    const container = logContainerRef.current
    const el = activeLogRef.current
    if (!container || !el) return
    const elTop = el.offsetTop
    const elBottom = elTop + el.offsetHeight
    const containerTop = container.scrollTop
    const containerBottom = containerTop + container.clientHeight
    if (elTop < containerTop) {
      container.scrollTop = elTop - 8
    } else if (elBottom > containerBottom) {
      container.scrollTop = elBottom - container.clientHeight + 8
    }
  }, [moveIndex])

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8", padding: 24 }}>
        Loading replay...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8", padding: 24 }}>
        <div style={{ color: "#f87171", marginBottom: 12 }}>Error: {error}</div>
        <button onClick={() => navigate(-1)}>Back</button>
      </div>
    )
  }

  if (!row) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8", padding: 24 }}>
        Replay not found.
      </div>
    )
  }

  if (!row.vgn) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8", padding: 24 }}>
        This game has no VGN.
      </div>
    )
  }

  if (replay && "error" in replay) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8", padding: 24 }}>
        <div style={{ color: "#f87171", marginBottom: 12 }}>Replay parse failed: {replay.error}</div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#111",
            padding: 16,
            borderRadius: 8,
            overflow: "auto",
          }}
        >
          {row.vgn}
        </pre>
      </div>
    )
  }

  const steps = replay ?? []
  const current = steps[Math.min(moveIndex, Math.max(0, steps.length - 1))]?.state ?? emptyState()

  const goFirst = () => setMoveIndex(0)
  const goPrev  = () => setMoveIndex((i) => Math.max(0, i - 1))
  const goNext  = () => setMoveIndex((i) => Math.min(steps.length - 1, i + 1))
  const goLast  = () => setMoveIndex(steps.length - 1)

  const atStart = moveIndex === 0
  const atEnd   = moveIndex === steps.length - 1

  const winner = row.winner // "W" | "B" | null

  function renderPlayerPanel(side: Player) {
    const info = side === "W" ? wakeInfo : brakeInfo
    const isWinner = winner === side
    const borderColor = side === "W" ? "#e8e4d8" : "#5de8f7"
    const tokenBg    = side === "W" ? "#e8e4d8" : "#5de8f7"
    const tokenFg    = side === "W" ? "#0d0d10" : "#02171a"
    const reserves   = current.reserves[side]
    const captives   = current.captives[side]

    return (
      <div
        style={{
          padding: 12,
          backgroundColor: "rgba(184,150,106,0.18)",
          borderRadius: 8,
          border: isWinner
            ? `2px solid ${borderColor}`
            : "1px solid rgba(184,150,106,0.30)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              backgroundColor: tokenBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
              color: tokenFg,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {info?.avatar_url ? (
              <img src={info.avatar_url} alt={info.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : side}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 15, color: "#e8e4d8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {info?.username ?? (side === "W" ? "Wake" : "Brake")}
              {isWinner && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "#b8966a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Winner</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: tokenBg, flexShrink: 0 }} />
              <span style={{ color: "#b0aa9e", fontSize: 13 }}>{side === "W" ? "Wake" : "Brake"}</span>
            </div>
          </div>
        </div>

        {/* Reserves / Captives */}
        <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>Reserves</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
              {Array.from({ length: Math.min(reserves, 18) }).map((_, i) => (
                <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: tokenBg, flexShrink: 0 }} />
              ))}
              {reserves === 0 && <span style={{ fontSize: 11, color: "#6b6558" }}>—</span>}
            </div>
          </div>
          <div style={{ width: 1, background: "linear-gradient(180deg, transparent, #b8966a, transparent)", alignSelf: "stretch", margin: "0 10px" }} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>Captives</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
              {Array.from({ length: Math.min(captives, 18) }).map((_, i) => {
                const capBg = side === "W" ? "#5de8f7" : "#e8e4d8"
                return <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: capBg, flexShrink: 0 }} />
              })}
              {captives === 0 && <span style={{ fontSize: 11, color: "#6b6558" }}>—</span>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 8,
    border: disabled ? "1px solid rgba(184,150,106,0.15)" : "1px solid rgba(184,150,106,0.50)",
    background: disabled ? "transparent" : "rgba(184,150,106,0.12)",
    color: disabled ? "#3a3830" : "#e8e4d8",
    fontFamily: "'Cinzel', serif",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.06em",
    cursor: disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
  })

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0c",
        color: "#e8e4d8",
        fontFamily: "'EB Garamond', Georgia, serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header
        isLoggedIn={!!currentUserId}
        userId={currentUserId ?? undefined}
        username={userProfile?.username}
        avatarUrl={userProfile?.avatar_url ?? null}
        activePage={null}
        onSignOut={async () => { await supabase.auth.signOut() }}
      />

      {/* Main content — mirror GamePage desktop layout */}
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          padding: 20,
          overflow: "hidden",
          alignItems: "flex-start",
          gap: 12,
          justifyContent: "center",
        }}
      >
        {/* Left Column — Wake player + (empty chat placeholder matches GamePage) */}
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, alignSelf: "stretch" }}>
          {renderPlayerPanel("W")}
        </div>

        {/* Queue — show void tokens as decorative column, same width as GamePage */}
        <div
          style={{
            backgroundColor: "rgba(184,150,106,0.18)",
            border: "1px solid rgba(184,150,106,0.30)",
            color: "#e8e4d8",
            padding: 12,
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
            boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
            flexShrink: 0,
            width: 74,
          }}
        >
          <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a", marginBottom: 6 }}>Round</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: 28, color: "#e8e4d8", lineHeight: 1 }}>{current.round}</div>
        </div>

        {/* Center: Nav controls + Board */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flexShrink: 0 }}>

          {/* Step counter — sits where the timer bar lives in GamePage */}
          <div
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              padding: "12px 24px",
              backgroundColor: "rgba(184,150,106,0.18)",
              border: "1px solid rgba(184,150,106,0.30)",
              borderRadius: 12,
              boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
            }}
          >
            {/* hourglass icon matching GamePage timer icon position */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="#b0aa9e">
              <path d="M160 64C142.3 64 128 78.3 128 96C128 113.7 142.3 128 160 128L160 139C160 181.4 176.9 222.1 206.9 252.1L274.8 320L206.9 387.9C176.9 417.9 160 458.6 160 501L160 512C142.3 512 128 526.3 128 544C128 561.7 142.3 576 160 576L480 576C497.7 576 512 561.7 512 544C512 526.3 497.7 512 480 512L480 501C480 458.6 463.1 417.9 433.1 387.9L365.2 320L433.1 252.1C463.1 222.1 480 181.4 480 139L480 128C497.7 128 512 113.7 512 96C512 78.3 497.7 64 480 64L160 64zM224 139L224 128L416 128L416 139C416 158 410.4 176.4 400 192L240 192C229.7 176.4 224 158 224 139zM240 448C243.5 442.7 247.6 437.7 252.1 433.1L320 365.2L387.9 433.1C392.5 437.7 396.5 442.7 400.1 448L240 448z"/>
            </svg>
            <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: 24, color: "#e8e4d8", letterSpacing: "0.04em" }}>
              {moveIndex + 1}
              <span style={{ fontSize: 16, color: "#6b6558", fontWeight: 400, marginLeft: 4 }}>/ {steps.length}</span>
            </div>
          </div>

          {/* Nav controls — where the phase banner / action buttons live in GamePage */}
          <div style={{ width: "100%", maxWidth: 597, display: "flex", flexDirection: "column", gap: 6, marginBottom: 2 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={goFirst} disabled={atStart} style={navBtnStyle(atStart)}>⏮</button>
              <button onClick={goPrev}  disabled={atStart} style={{ ...navBtnStyle(atStart), flex: 1 }}>◀ Prev</button>
              <button onClick={goNext}  disabled={atEnd}   style={{ ...navBtnStyle(atEnd),   flex: 1 }}>Next ▶</button>
              <button onClick={goLast}  disabled={atEnd}   style={navBtnStyle(atEnd)}>⏭</button>
            </div>

            {/* Current step label — where the phase text lives in GamePage */}
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                padding: "6px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.52rem", letterSpacing: "0.35em", textTransform: "uppercase", color: "#3a3830" }}>
                Step {moveIndex}
              </span>
              <span style={{ color: "rgba(184,150,106,0.4)", fontSize: 13 }}>—</span>
              <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 13, letterSpacing: "0.04em", color: "#b0aa9e" }}>
                {current.lastText}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${steps.length > 1 ? (moveIndex / (steps.length - 1)) * 100 : 100}%`,
                  background: "linear-gradient(90deg, #b8966a, #5de8f7)",
                  borderRadius: 2,
                  transition: "width 0.15s ease",
                }}
              />
            </div>
          </div>

          {/* Board */}
          <GridBoard
            boardMap={boardMapFromState(current.board) as any}
            selectedTokenId={null}
            ghost={null}
            started={true}
            phase="ACTION"
            onSquareClick={() => {}}
            GHOST_MS={0}
          />

          {/* Info row — matches GamePage's info row below board */}
          <div
            style={{
              fontSize: 13,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#b0aa9e",
              paddingLeft: 8,
              paddingRight: 8,
              width: "100%",
              maxWidth: 597,
            }}
          >
            <div style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}>
              {current.lastText}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: "#6b6558", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                ← → to navigate
              </span>
            </div>
          </div>
        </div>

        {/* Void column — matches GamePage's Void panel */}
        <div
          style={{
            backgroundColor: "rgba(184,150,106,0.18)",
            color: "#e8e4d8",
            padding: 12,
            border: "1px solid rgba(184,150,106,0.30)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "center",
            boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
            flexShrink: 0,
            width: 74,
          }}
        >
          <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a", marginBottom: 6 }}>Void</div>
          <div style={{ display: "flex", gap: 6, width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Array.from({ length: Math.min(current.voids.W, 8) }).map((_, i) => (
                <div key={`vw${i}`} style={{ width: 18, height: 18, borderRadius: "50%", background: "#e8e4d8" }} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Array.from({ length: Math.min(current.voids.B, 8) }).map((_, i) => (
                <div key={`vb${i}`} style={{ width: 18, height: 18, borderRadius: "50%", background: "#5de8f7" }} />
              ))}
            </div>
          </div>
          {current.voids.W === 0 && current.voids.B === 0 && (
            <span style={{ fontSize: 11, color: "#3a3830" }}>—</span>
          )}
        </div>

        {/* Right Column — Brake player + Game Log (human logs) */}
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, alignSelf: "stretch" }}>
          {renderPlayerPanel("B")}

          {/* Game Log — exact same panel as GamePage, fed with humanLogs */}
          <div
            style={{
              backgroundColor: "rgba(184,150,106,0.18)",
              borderRadius: 8,
              border: "1px solid rgba(184,150,106,0.30)",
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                backgroundColor: "#0d0d10",
                borderBottom: "1px solid rgba(184,150,106,0.30)",
                fontFamily: "'Cinzel', serif",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#b8966a",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Log</span>
              <span style={{ fontSize: 11, color: "#6b6558", fontFamily: "monospace", letterSpacing: 0, textTransform: "none" }}>
                {noteLogs.length} entries
              </span>
            </div>
            <div
              ref={logContainerRef}
              style={{
                padding: 12,
                fontSize: 11,
                color: "#b0aa9e",
                fontFamily: "monospace",
                overflowY: "auto",
                flexGrow: 1,
                minHeight: 0,
                lineHeight: 1.5,
              }}
            >
              {noteLogs.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No log entries for this game.</div>
              ) : (
                noteLogs.map((l, i) => (
                  <div
                    key={i}
                    ref={i === activeLogIndex ? activeLogRef : null}
                    style={{
                      marginBottom: 6,
                      whiteSpace: "pre-wrap",
                      padding: "3px 6px",
                      borderRadius: 4,
                      background: i === activeLogIndex ? "rgba(93,232,247,0.10)" : "transparent",
                      borderLeft: i === activeLogIndex ? "2px solid #5de8f7" : "2px solid transparent",
                      color: i === activeLogIndex ? "#e8e4d8" : "#b0aa9e",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {l.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}