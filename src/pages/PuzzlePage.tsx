// src/pages/PuzzlePage.tsx
import React, { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { GamePage } from "../components/GamePage"
import { newGame, type GameState, type Token } from "../engine/state"

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
  is_tutorial: boolean
}

type PuzzleResult = "solved" | "failed" | null

const PUZZLE_PREVIEW_STORAGE_KEY = "puzzle_preview_payload"

// ── Hydration ─────────────────────────────────────────────────────────────────

function hydratePuzzleState(bs: any): GameState {
  const base = newGame()

  const tokens: Token[] = (bs.board ?? []).map(([key, t]: [string, any]) => {
    const [x, y] = key.split(",").map(Number)
    return {
      id: t.id ?? `${t.owner}-${key}`,
      owner: t.owner,
      pos: { x, y },
      in: "BOARD" as const,
    }
  })

  const wCount = tokens.filter(t => t.owner === "W").length
  const bCount = tokens.filter(t => t.owner === "B").length

  return {
    ...base,
    phase: "ACTION",
    player: bs.startingPlayer ?? "B",
    tokens,
    tokenSerial: { W: wCount, B: bCount },
    reserves: bs.reserves ?? { W: 0, B: 0 },
    captives: bs.captives ?? { W: 0, B: 0 },
    void: bs.void ?? { W: 0, B: 0 },
    routes: {
      W: (bs.routesW ?? []).filter(Boolean),
      B: (bs.routesB ?? []).filter(Boolean),
    },
    queue: (bs.queue ?? []).filter(Boolean),
    usedRoutes: [],
    openingPlaced: { W: 99, B: 99 },
    mulliganReady: { W: true, B: true },
    log: [],
    lastMove: null,
    gameOver: null,
  }
}

// ── Win condition check ────────────────────────────────────────────────────────

function checkWinConditions(g: GameState, conditions: string[]): boolean {
  if (g.gameOver) {
    if (conditions.includes(g.gameOver.reason) && g.gameOver.winner === "B") return true
  }
  for (const cond of conditions) {
    switch (cond) {
      case "double_siege": {
        const boardMap = new Map(
          g.tokens.filter(t => t.in === "BOARD").map(t => [`${t.pos.x},${t.pos.y}`, t])
        )
        let sieged = 0
        for (const t of g.tokens.filter(t => t.in === "BOARD" && t.owner === "W")) {
          const dirs = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]]
          const enemyNeighbors = dirs.filter(
            ([dx, dy]) => boardMap.get(`${t.pos.x+dx},${t.pos.y+dy}`)?.owner === "B"
          ).length
          if (enemyNeighbors >= 4) sieged++
        }
        if (sieged >= 2) return true
        break
      }
      case "draft":
        if (g.stats.drafts.B > 0) return true
        break
    }
  }
  return false
}

// ── Difficulty colors ──────────────────────────────────────────────────────────

const DIFF_COLOR: Record<string, string> = {
  easy: "#4ade80", medium: "#facc15", hard: "#f97316", grandmaster: "#ee484c",
}

const DIFF_LABELS: Record<string, string> = {
  easy: "Easy", medium: "Medium", hard: "Hard", grandmaster: "GM",
}

const WIN_LABELS: Record<string, string> = {
  elimination:  "Achieve Elimination",
  siegemate:    "Achieve Siegemate",
  collapse:     "Cause Collapse",
  double_siege: "Achieve Double Siege",
  draft:        "Achieve a Draft",
  survive_turn: "Survive the Turn",
}

function PuzzleInfoBanner({
  puzzle,
  onBack,
  isPreview,
}: {
  puzzle: PuzzleRow
  onBack: () => void
  isPreview?: boolean
}) {
  const diffColor  = DIFF_COLOR[puzzle.difficulty] ?? "#b8966a"
  const objectives = (puzzle.win_conditions ?? []).map(w => WIN_LABELS[w] ?? w).join(" or ")
  const objective  = puzzle.description
    ? puzzle.description
    : `${objectives} in ${puzzle.move_budget} ${puzzle.move_budget === 1 ? "move" : "moves"}.`

  const isMobile = typeof window !== "undefined" && window.innerWidth < 700

  return (
    <div
      style={{
        background: "#0d0d10",
        borderBottom: "1px solid rgba(184,150,106,0.18)",
        padding: isMobile ? "12px 20px" : "10px 20px",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        textAlign: isMobile ? "center" : "left",
        gap: isMobile ? 6 : 14,
        position: "relative",
        minHeight: isMobile ? undefined : 48,
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "#5a5550",
          cursor: "pointer",
          fontSize: 22,
          lineHeight: 1,
          position: isMobile ? "absolute" : "static",
          left: isMobile ? 20 : undefined,
          top: isMobile ? 12 : undefined,
          flexShrink: 0,
        }}
      >
        &#8249;
      </button>

      {isMobile ? (
        <>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {isPreview && (
              <span
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#5de8f7",
                  border: "1px solid rgba(93,232,247,0.25)",
                  borderRadius: 3,
                  padding: "2px 8px",
                }}
              >
                Preview
              </span>
            )}

            <span
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: diffColor,
                border: `1px solid ${diffColor}44`,
                borderRadius: 3,
                padding: "2px 8px",
              }}
            >
              {DIFF_LABELS[puzzle.difficulty] ?? puzzle.difficulty}
            </span>
          </div>

          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 16,
              fontWeight: 700,
              color: "#e8e4d8",
              letterSpacing: "0.04em",
              maxWidth: 640,
            }}
          >
            {puzzle.title}
          </div>

          <div
            style={{
              fontFamily: "'EB Garamond', serif",
              fontSize: 16,
              color: "#9a9488",
              fontStyle: "italic",
              maxWidth: 640,
              lineHeight: 1.45,
            }}
          >
            {objective}
          </div>
        </>
      ) : (
        <>
          {isPreview && (
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#5de8f7", border: "1px solid rgba(93,232,247,0.25)", borderRadius: 3, padding: "2px 8px", flexShrink: 0 }}>
              Preview
            </span>
          )}
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: diffColor, border: `1px solid ${diffColor}44`, borderRadius: 3, padding: "2px 8px", flexShrink: 0 }}>
            {DIFF_LABELS[puzzle.difficulty] ?? puzzle.difficulty}
          </span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 700, color: "#e8e4d8", letterSpacing: "0.04em", flexShrink: 0 }}>
            {puzzle.title}
          </span>
          <span style={{ color: "rgba(184,150,106,0.3)", flexShrink: 0 }}>·</span>
          <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 16, color: "#9a9488", fontStyle: "italic", minWidth: 0 }}>
            {objective}
          </span>
        </>
      )}
    </div>
  )
}

// ── Overlay ────────────────────────────────────────────────────────────────────

function PuzzleOverlay({
  result,
  puzzle,
  movesUsed,
  onReset,
  onNext,
  isPreview,
  isTutorial,
}: {
  result: PuzzleResult
  puzzle: PuzzleRow
  movesUsed: number
  onReset: () => void
  onNext: () => void
  isPreview: boolean
  isTutorial: boolean
}) {
  if (!result) return null
  const solved = result === "solved"
  const diffColor = DIFF_COLOR[puzzle.difficulty] ?? "#b8966a"
  const showPoints = solved && !isPreview && !isTutorial && puzzle.point_value > 0
  const nextLabel = isPreview ? "Back to Editor" : isTutorial ? "Return to Tutorial" : "Back to Puzzles"

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: "#0d0d10",
        border: `1px solid ${solved ? "rgba(74,222,128,0.3)" : "rgba(238,72,76,0.3)"}`,
        borderRadius: 16,
        padding: "40px 48px",
        maxWidth: 440, width: "90%",
        textAlign: "center",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>
          {solved ? "◈" : "✕"}
        </div>
        <div style={{
          fontFamily: "'Cinzel', serif", fontSize: 18, fontWeight: 700,
          letterSpacing: "0.08em",
          color: solved ? "#4ade80" : "#ee484c",
        }}>
          {solved ? "Puzzle Solved" : "Out of Moves"}
        </div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: "#e8e4d8", letterSpacing: "0.04em" }}>
          {puzzle.title}
        </div>
        {solved && (
          <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#9a9488", lineHeight: 1.6 }}>
            Completed in {movesUsed} {movesUsed === 1 ? "move" : "moves"}
            {showPoints && (
              <>
                {" · "}
                <span style={{ color: diffColor }}>+{puzzle.point_value} pts</span>
              </>
            )}
          </div>
        )}
        {!solved && (
          <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#5a5550", lineHeight: 1.6 }}>
            Budget was {puzzle.move_budget} {puzzle.move_budget === 1 ? "move" : "moves"}.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8, justifyContent: "center" }}>
          {!solved && (
            <button onClick={onReset} style={{
              padding: "10px 22px", borderRadius: 8,
              border: "1px solid rgba(184,150,106,0.3)", background: "transparent",
              fontFamily: "'Cinzel', serif", fontSize: 10,
              letterSpacing: "0.15em", textTransform: "uppercase" as const,
              color: "#b8966a", cursor: "pointer",
            }}>
              Try Again
            </button>
          )}
          <button onClick={onNext} style={{
            padding: "10px 22px", borderRadius: 8,
            border: "1px solid rgba(184,150,106,0.3)", background: "rgba(184,150,106,0.08)",
            fontFamily: "'Cinzel', serif", fontSize: 10,
            letterSpacing: "0.15em", textTransform: "uppercase" as const,
            color: "#d4af7a", cursor: "pointer",
          }}>
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function PuzzlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const isPreview = searchParams.get("preview") === "1"

  const [puzzle, setPuzzle]               = useState<PuzzleRow | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [initialState, setInitialState]   = useState<GameState | null>(null)
  const [resetKey, setResetKey]           = useState(0)
  const [movesLeft, setMovesLeft]         = useState(0)
  const [movesUsed, setMovesUsed]         = useState(0)
  const [result, setResult]               = useState<PuzzleResult>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const resultRef     = useRef<PuzzleResult>(null)
  const movesLeftRef  = useRef(0)
  const puzzleRef     = useRef<PuzzleRow | null>(null)
  const recordRef     = useRef<((solved: boolean, moves: number) => Promise<void>) | null>(null)
  const moveFireCount = useRef(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
  }, [])

  // Load puzzle
  useEffect(() => {
    ;(async () => {
      if (isPreview) {
        try {
          const raw = sessionStorage.getItem(PUZZLE_PREVIEW_STORAGE_KEY)
          if (!raw) {
            setError("Preview payload missing.")
            setLoading(false)
            return
          }

          const preview = JSON.parse(raw) as PuzzleRow
          const p: PuzzleRow = {
            id: preview.id ?? "preview",
            title: preview.title ?? "Preview Puzzle",
            description: preview.description ?? null,
            difficulty: preview.difficulty ?? "easy",
            point_value: 0,
            move_budget: preview.move_budget ?? 1,
            win_conditions: preview.win_conditions ?? ["elimination"],
            board_state: preview.board_state ?? {},
            is_tutorial: !!preview.is_tutorial,
          }

          setPuzzle(p)
          puzzleRef.current = p
          movesLeftRef.current = p.move_budget
          setMovesLeft(p.move_budget)
          setInitialState(hydratePuzzleState(p.board_state))
          setLoading(false)
          return
        } catch {
          setError("Failed to load preview puzzle.")
          setLoading(false)
          return
        }
      }

      if (!id) {
        setError("Puzzle not found.")
        setLoading(false)
        return
      }

      const { data, error: err } = await supabase
        .from("puzzles")
        .select("id, title, description, difficulty, point_value, move_budget, win_conditions, board_state, is_tutorial")
        .eq("id", id)
        .single()

      if (err || !data) {
        setError("Puzzle not found.")
        setLoading(false)
        return
      }

      const p = data as PuzzleRow
      setPuzzle(p)
      puzzleRef.current = p
      movesLeftRef.current = p.move_budget
      setMovesLeft(p.move_budget)
      setInitialState(hydratePuzzleState(p.board_state))

      // Only normal puzzles get locked after solve
      if (!p.is_tutorial) {
        const userId = (await supabase.auth.getUser()).data.user?.id
        if (userId) {
          const { data: existing } = await supabase
            .from("puzzle_completions")
            .select("solved")
            .eq("player_id", userId)
            .eq("puzzle_id", id)
            .eq("solved", true)
            .maybeSingle()
          if (existing) {
            resultRef.current = "solved"
            setResult("solved")
          }
        }
      }

      setLoading(false)
    })()
  }, [id, isPreview])

  useEffect(() => {
    recordRef.current = async (solved: boolean, moves: number) => {
      if (!puzzleRef.current || !currentUserId) return
      if (isPreview) return
      if (puzzleRef.current.is_tutorial) return

      const { data: pts } = await supabase.rpc("record_puzzle_completion", {
        p_player_id:  currentUserId,
        p_puzzle_id:  puzzleRef.current.id,
        p_solved:     solved,
        p_moves_used: moves,
      })
      if (solved && pts && pts > 0) {
        await supabase.from("player_points").insert({
          player_id: currentUserId,
          amount:    pts,
          source:    "puzzle",
          source_id: puzzleRef.current.id,
        })
      }
    }
  }, [currentUserId, isPreview])

  const handleMoveComplete = useCallback((g: GameState) => {
    if (resultRef.current !== null) return
    const p = puzzleRef.current
    if (!p) return

    moveFireCount.current += 1
    if (moveFireCount.current === 1) return

    const left = movesLeftRef.current - 1
    const used = p.move_budget - left
    const isSurvivePuzzle = p.win_conditions.includes("survive_turn")

    if (!isSurvivePuzzle && checkWinConditions(g, p.win_conditions)) {
      resultRef.current = "solved"
      setResult("solved")
      setMovesUsed(used)
      setMovesLeft(0)
      recordRef.current?.(true, used)
      return
    }

    if (g.gameOver) {
      resultRef.current = "failed"
      setResult("failed")
      setMovesUsed(used)
      setMovesLeft(0)
      recordRef.current?.(false, used)
      return
    }

    if (left <= 0) {
      if (isSurvivePuzzle) {
        resultRef.current = "solved"
        setResult("solved")
        setMovesUsed(p.move_budget)
        setMovesLeft(0)
        recordRef.current?.(true, p.move_budget)
        return
      }

      resultRef.current = "failed"
      setResult("failed")
      setMovesUsed(p.move_budget)
      setMovesLeft(0)
      recordRef.current?.(false, p.move_budget)
      return
    }

    movesLeftRef.current = left
    setMovesLeft(left)
  }, [])

  function handleReset() {
    if (!puzzle) return
    resultRef.current = null
    moveFireCount.current = 0
    movesLeftRef.current = puzzle.move_budget
    setResult(null)
    setMovesLeft(puzzle.move_budget)
    setMovesUsed(0)
    setInitialState(hydratePuzzleState(puzzle.board_state))
    setResetKey(k => k + 1)
  }

  function handleBack() {
    if (isPreview) {
      navigate("/admin?section=puzzles")
      return
    }
    if (puzzle?.is_tutorial) {
      navigate("/tutorial")
      return
    }
    navigate("/puzzles")
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em", color: "#6b6558" }}>Loading puzzle…</span>
      </div>
    )
  }

  if (error || !puzzle || !initialState) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: "#6b6558" }}>{error ?? "Failed to load puzzle."}</span>
        <button onClick={handleBack} style={{
          fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
          padding: "8px 18px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.2)",
          background: "transparent", color: "#b8966a", cursor: "pointer",
        }}>
          {isPreview ? "Back to Editor" : puzzle?.is_tutorial ? "Return to Tutorial" : "Back to Puzzles"}
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      <GamePage
        key={resetKey}
        opponentType="ai"
        mySide="B"
        aiDifficulty="rookie"
        initialState={initialState}
        onMoveComplete={handleMoveComplete}
        puzzleMode
        puzzleMovesLeft={movesLeft}
        puzzleBanner={<PuzzleInfoBanner puzzle={puzzle} onBack={handleBack} isPreview={isPreview} />}
      />

      <PuzzleOverlay
        result={result}
        puzzle={puzzle}
        movesUsed={movesUsed}
        onReset={handleReset}
        onNext={handleBack}
        isPreview={isPreview}
        isTutorial={!!puzzle.is_tutorial}
      />
    </div>
  )
}
