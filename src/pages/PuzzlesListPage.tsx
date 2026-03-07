// src/pages/PuzzlesListPage.tsx
import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

// ── Types ─────────────────────────────────────────────────────────────────────

type PuzzleRow = {
  id: string
  title: string
  description: string | null
  difficulty: string
  point_value: number
  move_budget: number
  win_conditions: string[]
  board_state: any
  attempt_count: number
  solve_count: number
}

type CompletionMap = Record<string, boolean>
type DifficultyFilter = "all" | "easy" | "medium" | "hard" | "grandmaster"

// ── Constants ─────────────────────────────────────────────────────────────────

const DIFF_COLOR: Record<string, string> = {
  easy: "#4ade80", medium: "#facc15", hard: "#f97316", grandmaster: "#ee484c",
}

const DIFF_LABELS: Record<string, string> = {
  easy: "Easy", medium: "Medium", hard: "Hard", grandmaster: "GM",
}

const WIN_LABELS: Record<string, string> = {
  elimination:  "Elimination",
  siegemate:    "Siegemate",
  collapse:     "Collapse",
  double_siege: "Double Siege",
  draft:        "Draft",
}

// ── Board preview ─────────────────────────────────────────────────────────────
// Mirrors GridBoard: 6x6, uniform cells, y=SIZE-1 at top.

const BSIZE  = 6
const BCELL  = 18
const BGAP   = 1
const BPAD   = 5
const BSVG   = BPAD * 2 + BSIZE * BCELL + (BSIZE - 1) * BGAP  // 244

function PuzzleBoardPreview({ boardState, solved }: { boardState: any; solved: boolean }) {
  if (!boardState) return (
    <div style={{ width: "100%", aspectRatio: "1", background: "rgba(184,150,106,0.06)", borderRadius: 10 }} />
  )

  const board: Array<[string, { owner: string }]> = boardState.board ?? []
  const tokenMap = new Map(board.map(([k, t]) => [k, t]))

  const cells: React.ReactNode[] = []
  const tokens: React.ReactNode[] = []

  for (let ry = 0; ry < BSIZE; ry++) {
    const y = BSIZE - 1 - ry
    for (let x = 0; x < BSIZE; x++) {
      const px = BPAD + x * (BCELL + BGAP)
      const py = BPAD + ry * (BCELL + BGAP)
      cells.push(
        <rect key={`c${x}-${ry}`} x={px} y={py} width={BCELL} height={BCELL}
          fill="rgba(184,150,106,0.28)" rx={3} />
      )
      const t = tokenMap.get(`${x},${y}`)
      if (t) {
        tokens.push(
          <circle key={`t${x}-${y}`}
            cx={px + BCELL / 2} cy={py + BCELL / 2} r={BCELL * 0.32}
            fill={t.owner === "W" ? "#c8a96e" : "#1a1a2e"}
            stroke={t.owner === "W" ? "#f0d9a0" : "#4a4a7a"}
            strokeWidth={1.5}
          />
        )
      }
    }
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${BSVG} ${BSVG}`}
        width="100%"
        style={{ display: "block", borderRadius: 10 }}
      >
        <rect width={BSVG} height={BSVG} fill="rgba(184,150,106,0.10)" rx={10} />
        {cells}
        {tokens}
        {solved && (
          <>
            <rect width={BSVG} height={BSVG} fill="rgba(74,222,128,0.12)" rx={10} />
            <text
              x={BSVG / 2} y={BSVG / 2 + 14}
              textAnchor="middle"
              fontSize={48}
              fill="#4ade80"
              opacity={0.75}
            >
              ✓
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

// ── Solve rate bar ─────────────────────────────────────────────────────────────

function SolveRateBar({ solveCount, attemptCount, diffColor }: {
  solveCount: number
  attemptCount: number
  diffColor: string
}) {
  const pct = attemptCount === 0 ? 0 : Math.round((solveCount / attemptCount) * 100)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: diffColor, borderRadius: 99 }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#6b6558", whiteSpace: "nowrap", flexShrink: 0 }}>
        {solveCount}/{attemptCount}{" "}
        <span style={{ color: diffColor }}>{pct}%</span>
      </span>
    </div>
  )
}

// ── Puzzle card ────────────────────────────────────────────────────────────────

function PuzzleCard({ p, solved, onClick }: {
  p: PuzzleRow
  solved: boolean
  attempted: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const diffColor = DIFF_COLOR[p.difficulty] ?? "#b8966a"

  return (
    <div
      onClick={solved ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        border: `1px solid ${solved ? "rgba(74,222,128,0.22)" : hovered ? "rgba(184,150,106,0.28)" : "rgba(184,150,106,0.12)"}`,
        background: solved ? "rgba(74,222,128,0.03)" : hovered ? "rgba(184,150,106,0.05)" : "rgba(184,150,106,0.02)",
        cursor: solved ? "default" : "pointer",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.12s, background 0.12s, transform 0.12s, box-shadow 0.12s",
        transform: !solved && hovered ? "translateY(-2px)" : "none",
        boxShadow: !solved && hovered ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
      }}
    >
      {/* Board preview */}
      <div style={{ padding: "8px 8px 4px" }}>
        <PuzzleBoardPreview boardState={p.board_state} solved={solved} />
      </div>

      {/* Title + description */}
      <div style={{ padding: "8px 12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700, color: "#e8e4d8", lineHeight: 1.3 }}>
          {p.title}
        </div>
        {p.description && (
          <div style={{
            fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#6b6558",
            lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {p.description}
          </div>
        )}
      </div>

      {/* Bottom strip: difficulty · points · solve bar */}
      <div style={{
        padding: "8px 12px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{
          fontFamily: "'Cinzel', serif", fontSize: 8, letterSpacing: "0.15em",
          textTransform: "uppercase", color: diffColor,
          border: `1px solid ${diffColor}44`, borderRadius: 3, padding: "2px 6px",
          flexShrink: 0,
        }}>
          {DIFF_LABELS[p.difficulty] ?? p.difficulty}
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700, color: diffColor, flexShrink: 0 }}>
          +{p.point_value}<span style={{ fontSize: 7, opacity: 0.6, marginLeft: 1 }}>pts</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SolveRateBar solveCount={p.solve_count} attemptCount={p.attempt_count} diffColor={diffColor} />
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PuzzlesListPage() {
  const navigate = useNavigate()

  const [puzzles, setPuzzles]         = useState<PuzzleRow[]>([])
  const [completions, setCompletions] = useState<CompletionMap>({})
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<DifficultyFilter>("all")
  const [userId, setUserId]           = useState<string | null>(null)
  const [me, setMe]                   = useState<{ username: string; avatar_url: string | null } | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess.session?.user ?? null
      if (user) {
        setUserId(user.id)
        const { data: profile } = await supabase
          .from("profiles").select("username, avatar_url").eq("id", user.id).single()
        if (profile) setMe(profile as any)
      }

      const { data: pzls } = await supabase
        .from("puzzles")
        .select("id, title, description, difficulty, point_value, move_budget, win_conditions, board_state, attempt_count, solve_count")
        .eq("is_published", true)
        .order("difficulty", { ascending: true })

      setPuzzles((pzls ?? []) as PuzzleRow[])

      if (user) {
        const { data: comps } = await supabase
          .from("puzzle_completions").select("puzzle_id, solved").eq("player_id", user.id)
        const map: CompletionMap = {}
        for (const c of (comps ?? []) as any[]) {
          if (c.solved) map[c.puzzle_id] = true
          else if (!(c.puzzle_id in map)) map[c.puzzle_id] = false
        }
        setCompletions(map)
      }

      setLoading(false)
    })()
  }, [])

  const filtered       = filter === "all" ? puzzles : puzzles.filter(p => p.difficulty === filter)
  const solvedCount    = Object.values(completions).filter(Boolean).length
  const attemptedCount = Object.keys(completions).length

  const filterBtn = (f: DifficultyFilter): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 6,
    border: `1px solid ${filter === f
      ? (f === "all" ? "rgba(184,150,106,0.45)" : `${DIFF_COLOR[f]}55`)
      : "rgba(255,255,255,0.07)"}`,
    background: filter === f
      ? (f === "all" ? "rgba(184,150,106,0.10)" : `${DIFF_COLOR[f]}18`)
      : "transparent",
    fontFamily: "'Cinzel', serif", fontSize: 9, fontWeight: 600,
    letterSpacing: "0.12em", textTransform: "uppercase" as const,
    color: filter === f ? (f === "all" ? "#d4af7a" : DIFF_COLOR[f]) : "#5a5550",
    cursor: "pointer", transition: "all 0.1s",
  })

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8" }}>
      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        activePage="puzzles"
        onSignIn={() => window.location.assign("/?openAuth=1&returnTo=/puzzles")}
        onOpenProfile={() => navigate("/?openProfile=1")}
        onOpenSkins={() => navigate("/skins")}
        onSignOut={async () => { await supabase.auth.signOut(); navigate("/") }}
        onPlay={() => navigate("/")}
        onMyGames={() => navigate("/challenges")}
        onLeaderboard={() => navigate("/leaderboard")}
        onChallenges={() => navigate("/challenges")}
        onOrders={() => navigate("/orders")}
        onRules={() => navigate("/rules")}
        onTutorial={() => navigate("/tutorial")}
        onAnnouncements={() => navigate("/announcements")}
        onPuzzles={() => navigate("/puzzles")}
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>

        {/* Page header + filters */}
        <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: 26, fontWeight: 700, color: "#e8e4d8", margin: "0 0 6px", letterSpacing: "0.04em" }}>
              Puzzles
            </h1>
            {userId && attemptedCount > 0 ? (
              <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#6b6558" }}>
                {solvedCount} solved · {attemptedCount} attempted
              </div>
            ) : !userId ? (
              <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#4a4540" }}>
                Sign in to track your progress
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(["all", "easy", "medium", "hard", "grandmaster"] as DifficultyFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={filterBtn(f)}>
                {f === "all" ? "All" : DIFF_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Card grid */}
        {loading ? (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em", color: "#6b6558", textAlign: "center", padding: "64px 0" }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.12em", color: "#4a4540", textAlign: "center", padding: "64px 0" }}>
            No puzzles available.
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}>
            {filtered.map(p => (
              <PuzzleCard
                key={p.id}
                p={p}
                solved={completions[p.id] === true}
                attempted={p.id in completions && completions[p.id] !== true}
                onClick={() => navigate(`/puzzle/${p.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
