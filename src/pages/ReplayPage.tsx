import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"

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
  logs: string[] | null
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

function splitVgnLine(line: string) {
  return line.split("|").map((p) => p.trim()).filter(Boolean)
}

function parseVgn(vgn: string): ParsedEvent[] {
  const out: ParsedEvent[] = []
  const lines = vgn.split("\n").map((x) => x.trim()).filter(Boolean)

  for (const line of lines) {
    if (line.startsWith("META|")) continue

    const parts = splitVgnLine(line)

    const body = parts.filter((p) => !p.startsWith("t=") && !p.startsWith("dt="))

    if (body.length === 0) continue

    if (body[0].startsWith("ROUND")) {
      const nPart = body.find((p) => p.startsWith("n="))
      out.push({ kind: "round", n: Number(nPart?.slice(2) ?? "1") })
      continue
    }

    if (body[0].startsWith("NOTE")) {
      const textPart = body.find((p) => p.startsWith("text=")) ?? ""
      let text = textPart.slice(5)
      if (text.startsWith('"') && text.endsWith('"')) {
        text = text.slice(1, -1)
      }
      text = text.replace(/\\"/g, '"')
      out.push({ kind: "note", text })
      continue
    }

    if (body[0].startsWith("WIN") || body[0].startsWith("LOSS")) {
      const winType = body.find((p) => p.startsWith("type="))?.slice(5)
      const winner = body.find((p) => p.startsWith("winner="))?.slice(7) as Player | undefined
      const loser = body.find((p) => p.startsWith("loser="))?.slice(6) as Player | undefined
      out.push({
        kind: "transfer",
        raw: line,
        from: "",
        to: "",
        winner,
        loser,
        winType,
      })
      continue
    }

    const p = body.find((x) => x.startsWith("p="))?.slice(2) as Player | undefined
    const from = body.find((x) => x.startsWith("from="))?.slice(5) ?? ""
    const to = body.find((x) => x.startsWith("to="))?.slice(3) ?? ""
    const route = body.find((x) => x.startsWith("route="))?.slice(6)
    const countStr = body.find((x) => x.startsWith("count="))?.slice(6)
    const yieldStr = body.find((x) => x.startsWith("yield="))?.slice(6)

    out.push({
      kind: "transfer",
      p,
      from,
      to,
      route,
      count: countStr ? Number(countStr) : undefined,
      yieldCount: yieldStr ? Number(yieldStr) : undefined,
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

  for (const ev of events) {
    if (ev.kind === "round") {
      state.round = ev.n
      addStep(`Round ${ev.n}`)
      continue
    }

    if (ev.kind === "note") {
      addStep(ev.text)
      continue
    }

    if (ev.winner && ev.loser && ev.winType) {
      addStep(`${ev.winner} wins by ${ev.winType}`)
      continue
    }

    const p = ev.p
    const from = ev.from
    const to = ev.to

    if (!from && !to) {
      addStep(ev.raw)
      continue
    }

    if (p && isSquare(from) && isSquare(to)) {
      const moving = state.board[from]
      if (moving && moving.owner === p) {
        const occupant = state.board[to]
        if (occupant && occupant.owner !== p) {
          pendingCapturedOwner = occupant.owner
          delete state.board[to]
        } else {
          pendingCapturedOwner = null
        }

        delete state.board[from]
        state.board[to] = { ...moving, square: to }
        addStep(`${p} ${from} → ${to}${ev.route ? ` (${ev.route})` : ""}`)
        continue
      }
    }

    if (p && from === "RESERVE" && isSquare(to)) {
      serial[p] += 1
      state.reserves[p] = Math.max(0, state.reserves[p] - 1)
      state.board[to] = {
        id: makeTokenId(p, serial[p]),
        owner: p,
        square: to,
      }
      addStep(`${p} placed at ${to}${ev.route ? ` (${ev.route})` : ""}`)
      continue
    }

    if (p && isSquare(from) && to === "RESERVE") {
      const tok = state.board[from]
      if (tok && tok.owner === p) {
        delete state.board[from]
        state.reserves[p] += ev.count ?? 1
      }
      addStep(`${p} ${from} → RESERVE`)
      continue
    }

    if (p && isSquare(from) && to === "CAPTIVE") {
      if (pendingCapturedOwner) {
        state.captives[p] += ev.count ?? 1
        pendingCapturedOwner = null
      } else {
        state.captives[p] += ev.count ?? 1
      }
      addStep(`${p} captured from ${from}`)
      continue
    }

    if (p && from === "CAPTIVE" && to === "VOID") {
      const amt = ev.yieldCount ?? ev.count ?? 1
      state.captives[p] = Math.max(0, state.captives[p] - amt)
      state.voids[p] += amt
      addStep(`${p} CAPTIVE → VOID x${amt}`)
      continue
    }

    if (p && from === "RESERVE" && to === "VOID") {
      const amt = ev.yieldCount ?? ev.count ?? 1
      state.reserves[p] = Math.max(0, state.reserves[p] - amt)
      state.voids[p] += amt
      addStep(`${p} RESERVE → VOID x${amt}`)
      continue
    }

    if (p && from === "VOID" && to === "RESERVE") {
      const amt = ev.count ?? 1
      state.voids[p] = Math.max(0, state.voids[p] - amt)
      state.reserves[p] += amt
      addStep(`${p} VOID → RESERVE x${amt}`)
      continue
    }

    if (p && from === "VOID" && to === "CAPTIVE") {
      const amt = ev.count ?? 1
      const enemy = p === "W" ? "B" : "W"
      state.voids[enemy] = Math.max(0, state.voids[enemy] - amt)
      state.captives[p] += amt
      addStep(`${p} VOID → CAPTIVE x${amt}`)
      continue
    }

    addStep(ev.raw)
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

export function ReplayPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<ReplayLogRow | null>(null)
  const [moveIndex, setMoveIndex] = useState(0)

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

        let safeLogs: string[] | null = null

        const rawLogs = (first as any)?.logs

        if (Array.isArray(rawLogs)) {
          safeLogs = rawLogs.filter((x: unknown) => typeof x === "string")
        } else if (typeof rawLogs === "string") {
          try {
            const parsed = JSON.parse(rawLogs)
            safeLogs = Array.isArray(parsed)
              ? parsed.filter((x: unknown) => typeof x === "string")
              : null
          } catch {
            safeLogs = null
          }
        }

        setRow({
          ...(first as ReplayLogRow),
          logs: safeLogs,
        })
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0c",
        color: "#e8e4d8",
        padding: "24px 16px 48px",
        fontFamily: "'EB Garamond', Georgia, serif",
      }}
    >
      <div style={{ maxWidth: 1600, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "1.3rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              Replay
            </div>
            <div style={{ color: "#9a9488", marginTop: 4, fontSize: 14 }}>
              {row.mode?.toUpperCase() ?? "GAME"} · {row.time_control ?? "standard"} · winner {row.winner ?? "—"} · {row.reason ?? "—"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => navigate(-1)}>Back</button>
            <button onClick={() => setMoveIndex(0)}>⏮ Start</button>
            <button onClick={() => setMoveIndex((i) => Math.max(0, i - 1))}>◀ Prev</button>
            <button onClick={() => setMoveIndex((i) => Math.min(steps.length - 1, i + 1))}>Next ▶</button>
            <button onClick={() => setMoveIndex(Math.max(0, steps.length - 1))}>End ⏭</button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 520px) minmax(320px, 420px) minmax(320px, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "#0f0f14",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 16,
            }}
          >
            <BoardView state={current} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 10,
                marginTop: 16,
              }}
            >
              <div
                style={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.12em", color: "#9a9488" }}>
                  Reserves
                </div>
                <div style={{ marginTop: 6 }}>W {current.reserves.W} · B {current.reserves.B}</div>
              </div>

              <div
                style={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.12em", color: "#9a9488" }}>
                  Captives
                </div>
                <div style={{ marginTop: 6 }}>W {current.captives.W} · B {current.captives.B}</div>
              </div>

              <div
                style={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.12em", color: "#9a9488" }}>
                  Void
                </div>
                <div style={{ marginTop: 6 }}>W {current.voids.W} · B {current.voids.B}</div>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                background: "#111",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.12em", color: "#9a9488" }}>
                Current Step
              </div>
              <div style={{ marginTop: 6, fontSize: 18 }}>
                {moveIndex + 1} / {steps.length}
              </div>
              <div style={{ marginTop: 8, color: "#d8d2c5" }}>{current.lastText}</div>
            </div>
          </div>

          <div
            style={{
              background: "#0f0f14",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 16,
              maxHeight: "75vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 14,
                letterSpacing: "0.14em",
                color: "#b8966a",
                marginBottom: 12,
              }}
            >
              Game Log
            </div>

            {humanLogs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {humanLogs.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#111",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#e8e4d8",
                      lineHeight: 1.35,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#9a9488",
                        marginBottom: 4,
                      }}
                    >
                      {humanLogs.length - i}
                    </div>
                    <div>{line}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#9a9488" }}>No human-readable logs saved for this game.</div>
            )}
          </div>

          <div
            style={{
              background: "#0f0f14",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 16,
              maxHeight: "75vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 14,
                letterSpacing: "0.14em",
                color: "#b8966a",
                marginBottom: 12,
              }}
            >
              Replay Timeline
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {steps.map((step, i) => (
                <button
                  key={i}
                  onClick={() => setMoveIndex(i)}
                  style={{
                    textAlign: "left",
                    background: i === moveIndex ? "rgba(93,232,247,0.08)" : "#111",
                    border: i === moveIndex
                      ? "1px solid rgba(93,232,247,0.35)"
                      : "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "#e8e4d8",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: i === moveIndex ? "#5de8f7" : "#9a9488",
                      marginBottom: 4,
                    }}
                  >
                    {i}
                  </div>
                  <div>{step.label}</div>
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  color: "#9a9488",
                  marginBottom: 8,
                }}
              >
                Raw VGN
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "#111",
                  borderRadius: 10,
                  padding: 12,
                  margin: 0,
                  color: "#cfc8bb",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {row.vgn}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}