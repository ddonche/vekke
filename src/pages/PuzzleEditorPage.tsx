// src/pages/PuzzleEditorPage.tsx
import React, { useState, useCallback, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { GridBoard } from "../GridBoard"
import { RouteIcon } from "../RouteIcon"
import type { Token, Player } from "../engine/state"
import type { Route } from "../engine/move"

// ── Route pool ────────────────────────────────────────────────────────────────
// Orthogonal dirs (N=1, E=3, S=5, W=7) have distances 1–4.
// Diagonal dirs (NE=2, SE=4, SW=6, NW=8) have distances 1–3.
const DIR_NAMES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
const ORTHOGONAL_DIRS = new Set([1, 3, 5, 7]) // dir indices (1-based)
const ALL_ROUTES: Route[] = DIR_NAMES.flatMap((name, i) => {
  const dir = (i + 1) as any
  const maxDist = ORTHOGONAL_DIRS.has(dir) ? 4 : 3
  return Array.from({ length: maxDist }, (_, j) => ({
    id: `${dir}/${j + 1}`,   // engine format: "1/2" not "N2"
    dir,
    dist: j + 1,
    _label: `${name}${j + 1}`, // display only
  }))
})

const PUZZLE_PREVIEW_STORAGE_KEY = "puzzle_preview_payload"

// ── Types ─────────────────────────────────────────────────────────────────────
type Brush = "W" | "B" | "erase"
type WinCondition =
  | "elimination"
  | "siegemate"
  | "collapse"
  | "double_siege"
  | "draft"
  | "siege_break"
  | "survive_turn"
  | "no_losses"

type Difficulty = "easy" | "medium" | "hard" | "grandmaster"

type PuzzleEditorState = {
  board: Map<string, Token>
  reserves: { W: number; B: number }
  captives: { W: number; B: number }
  voidCount: { W: number; B: number }
  routesW: (Route | null)[]
  routesB: (Route | null)[]
  queue: (Route | null)[]
  startingPlayer: Player
}

function freshState(): PuzzleEditorState {
  return {
    board: new Map(),
    reserves: { W: 0, B: 0 },
    captives: { W: 0, B: 0 },
    voidCount: { W: 0, B: 0 },
    routesW: [null, null, null],
    routesB: [null, null, null],
    queue: [null, null, null],
    startingPlayer: "B",
  }
}

function serializeBoardState(ps: PuzzleEditorState) {
  return {
    board: Array.from(ps.board.entries()),
    reserves: ps.reserves,
    captives: ps.captives,
    void: ps.voidCount,
    routesW: ps.routesW.filter(Boolean),
    routesB: ps.routesB.filter(Boolean),
    queue: ps.queue.filter(Boolean),
    startingPlayer: ps.startingPlayer,
  }
}

const DIFFICULTY_POINTS: Record<Difficulty, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
  grandmaster: 100,
}

const WIN_CONDITION_LABELS: Record<WinCondition, string> = {
  elimination:  "Elimination",
  siegemate:    "Siegemate",
  collapse:     "Collapse",
  double_siege: "Double Siege",
  draft:        "Draft Triggered",
  siege_break:  "Break the Siege",
  survive_turn: "Survive the Turn",
  no_losses:    "Lose No Tokens",
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function padToThree(arr: any[]): (any | null)[] {
  const result = [...arr]
  while (result.length < 3) result.push(null)
  return result.slice(0, 3)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stepper({
  label, value, onChange, min = 0, max = 20,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#b0aa9e", flex: 1, lineHeight: 1.2 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(184,150,106,0.25)", background: "transparent", color: "#b8966a", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
        >−</button>
        <span style={{ fontFamily: "monospace", fontSize: 13, color: "#e8e4d8", minWidth: 22, textAlign: "center" }}>{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(184,150,106,0.25)", background: "transparent", color: "#b8966a", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
        >+</button>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Cinzel', serif", fontSize: 9, fontWeight: 600,
      letterSpacing: "0.3em", textTransform: "uppercase",
      color: "#6b6558", marginBottom: 10,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
    </div>
  )
}

function RouteSlot({
  route,
  onPick,
  onClear,
}: {
  route: Route | null
  onPick: () => void
  onClear: () => void
}) {
  if (route) {
    return (
      <div style={{ position: "relative" }}>
        <RouteIcon
          route={route}
          style={{
            width: 36,
            cursor: "pointer",
            borderRadius: 6,
          }}
          onClick={onClear}
        />
        <div
          onClick={onClear}
          style={{
            position: "absolute", top: -5, right: -5,
            width: 14, height: 14, borderRadius: "50%",
            background: "#0d0d10", border: "1px solid rgba(184,150,106,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 8, color: "#6b6558", lineHeight: 1,
          }}
        >×</div>
      </div>
    )
  }
  return (
    <div
      onClick={onPick}
      style={{
        width: 36, height: 63,
        borderRadius: 6,
        border: "1px dashed rgba(184,150,106,0.2)",
        background: "rgba(184,150,106,0.03)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "#3a3530", fontSize: 20, lineHeight: 1,
        transition: "border-color 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(184,150,106,0.45)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(184,150,106,0.2)")}
    >+</div>
  )
}

function RoutePickerModal({ onSelect, onClose }: {
  onSelect: (route: Route) => void
  onClose: () => void
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#0d0d10", border: "1px solid rgba(184,150,106,0.25)", borderRadius: 14, padding: 24, width: 520, maxHeight: "80vh", overflow: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.25em", textTransform: "uppercase", color: "#b8966a", marginBottom: 18 }}>
          Select Route
        </div>

        {DIR_NAMES.map((dir, di) => {
          const dirNum = di + 1
          const isOrthogonal = [1, 3, 5, 7].includes(dirNum)
          const distances = isOrthogonal ? [1, 2, 3, 4] : [1, 2, 3]
          return (
            <div key={dir} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4a4540", marginBottom: 8 }}>{dir}</div>
              <div style={{ display: "flex", gap: 10 }}>
                {distances.map(dist => {
                  const r = ALL_ROUTES.find(x => x.dir === dirNum && x.dist === dist)!
                  return (
                    <div
                      key={dist}
                      onClick={() => { onSelect(r); onClose() }}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
                    >
                      <RouteIcon route={r} style={{ width: 40, cursor: "pointer" }} />
                      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a4540" }}>{(r as any)._label ?? r.id}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        <button
          onClick={onClose}
          style={{ marginTop: 8, fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.15)", background: "transparent", color: "#4a4540", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PuzzleEditorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get("id") // null = new puzzle, string = editing existing

  const [ps, setPs] = useState<PuzzleEditorState>(freshState)
  const [brush, setBrush] = useState<Brush>("W")

  // Puzzle metadata
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const [moveBudget, setMoveBudget] = useState(3)
  const [winConditions, setWinConditions] = useState<WinCondition[]>(["elimination"])
  const [isTutorial, setIsTutorial] = useState(false)

  // UI state
  const [pickerTarget, setPickerTarget] = useState<{ zone: "W" | "B" | "Q"; slot: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(!!editId)

  // Load existing puzzle when editing
  useEffect(() => {
    if (!editId) return
    ;(async () => {
      const { data, error } = await supabase
        .from("puzzles")
        .select("title, description, difficulty, move_budget, win_conditions, board_state, is_tutorial")
        .eq("id", editId)
        .single()

      if (error || !data) {
        setSaveError("Failed to load puzzle.")
        setLoadingEdit(false)
        return
      }

      const bs = data.board_state
      const board = new Map<string, any>((bs.board ?? []) as [string, any][])

      setPs({
        board,
        reserves: bs.reserves ?? { W: 0, B: 0 },
        captives: bs.captives ?? { W: 0, B: 0 },
        voidCount: bs.void ?? { W: 0, B: 0 },
        routesW: padToThree(bs.routesW ?? []),
        routesB: padToThree(bs.routesB ?? []),
        queue: padToThree(bs.queue ?? []),
        startingPlayer: bs.startingPlayer ?? "B",
      })
      setTitle(data.title)
      setDescription(data.description ?? "")
      setDifficulty(data.difficulty as Difficulty)
      setMoveBudget(data.move_budget)
      setWinConditions(data.win_conditions ?? ["elimination"])
      setIsTutorial(!!data.is_tutorial)
      setLoadingEdit(false)
    })()
  }, [editId])

  // ── Board interaction ──────────────────────────────────────────────────────
  const handleSquareClick = useCallback((x: number, y: number) => {
    const key = `${x},${y}`

    setPs(prev => {
      const next = new Map(prev.board)
      if (brush === "erase") {
        next.delete(key)
      } else {
        const existing = next.get(key)
        if (existing?.owner === brush) {
          next.delete(key) // clicking same side erases
        } else {
          next.set(key, { id: `tok_${brush}_${x}_${y}`, owner: brush })
        }
      }
      return { ...prev, board: next }
    })
  }, [brush, ps.board])

  // ── Zone helpers ───────────────────────────────────────────────────────────
  function setZone(
    zone: "reserves" | "captives" | "voidCount",
    side: "W" | "B",
    val: number
  ) {
    setPs(prev => ({ ...prev, [zone]: { ...prev[zone], [side]: val } }))
  }

  function assignRoute(zone: "W" | "B" | "Q", slot: number, route: Route) {
    setPs(prev => {
      if (zone === "W") {
        const r = [...prev.routesW]
        r[slot] = route
        return { ...prev, routesW: r }
      }
      if (zone === "B") {
        const r = [...prev.routesB]
        r[slot] = route
        return { ...prev, routesB: r }
      }
      const r = [...prev.queue]
      r[slot] = route
      return { ...prev, queue: r }
    })
  }

  function clearRoute(zone: "W" | "B" | "Q", slot: number) {
    setPs(prev => {
      if (zone === "W") {
        const r = [...prev.routesW]
        r[slot] = null
        return { ...prev, routesW: r }
      }
      if (zone === "B") {
        const r = [...prev.routesB]
        r[slot] = null
        return { ...prev, routesB: r }
      }
      const r = [...prev.queue]
      r[slot] = null
      return { ...prev, queue: r }
    })
  }

  function toggleWinCondition(wc: WinCondition) {
    setWinConditions(prev =>
      prev.includes(wc) ? prev.filter(w => w !== wc) : [...prev, wc]
    )
  }

  function buildPayload(isPublished: boolean) {
    return {
      title: title.trim(),
      description: description.trim() || null,
      difficulty,
      point_value: isTutorial ? 0 : DIFFICULTY_POINTS[difficulty],
      board_state: serializeBoardState(ps),
      win_conditions: winConditions,
      move_budget: moveBudget,
      is_published: isPublished,
      is_tutorial: isTutorial,
    }
  }

  function handlePreview() {
    setSaveError(null)
    if (!title.trim()) {
      setSaveError("Title is required to preview.")
      return
    }
    if (winConditions.length === 0) {
      setSaveError("Select at least one win condition.")
      return
    }

    const previewPayload = {
      id: editId ?? "preview",
      title: title.trim() || "Preview Puzzle",
      description: description.trim() || null,
      difficulty,
      point_value: 0,
      move_budget: moveBudget,
      win_conditions: winConditions,
      board_state: serializeBoardState(ps),
      is_tutorial: isTutorial,
      is_preview: true,
    }

    try {
      setPreviewing(true)
      sessionStorage.setItem(PUZZLE_PREVIEW_STORAGE_KEY, JSON.stringify(previewPayload))
      navigate("/puzzle/preview?preview=1")
    } catch (err: any) {
      setPreviewing(false)
      setSaveError(err?.message ?? "Failed to open preview.")
    }
  }

  // ── Save (insert or update) ────────────────────────────────────────────────
  async function handlePublish() {
    setSaveError(null)

    if (!title.trim()) {
      setSaveError("Title is required.")
      return
    }
    if (winConditions.length === 0) {
      setSaveError("Select at least one win condition.")
      return
    }

    setSaving(true)
    const payload = buildPayload(true)

    let error: any = null

    if (editId) {
      const { error: err } = await supabase.from("puzzles").update(payload).eq("id", editId)
      error = err
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: err } = await supabase.from("puzzles").insert({ ...payload, created_by: user?.id ?? null })
      error = err
    }

    setSaving(false)

    if (error) {
      setSaveError(error.message)
    } else {
      setSaveMsg(editId ? "Puzzle saved!" : "Puzzle published!")
      setTimeout(() => {
        setSaveMsg(null)
        if (!editId) {
          setPs(freshState())
          setTitle("")
          setDescription("")
          setDifficulty("easy")
          setMoveBudget(3)
          setWinConditions(["elimination"])
          setIsTutorial(false)
        }
      }, 1500)
      if (editId) navigate("/admin?section=puzzles")
    }
  }

  // ── Style helpers ──────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    background: "rgba(184,150,106,0.03)",
    border: "1px solid rgba(184,150,106,0.10)",
    borderRadius: 10,
    padding: "14px 14px 16px",
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(184,150,106,0.06)",
    border: "1px solid rgba(184,150,106,0.22)",
    borderRadius: 7,
    padding: "9px 11px",
    color: "#e8e4d8",
    fontFamily: "'EB Garamond', serif",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  }

  const chipBtn = (active: boolean): React.CSSProperties => ({
    padding: "6px 0",
    borderRadius: 6,
    border: `1px solid ${active ? "rgba(184,150,106,0.45)" : "rgba(255,255,255,0.07)"}`,
    background: active ? "rgba(184,150,106,0.10)" : "transparent",
    fontFamily: "'Cinzel', serif",
    fontSize: 9,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: active ? "#d4af7a" : "#5a5550",
    cursor: "pointer",
    transition: "all 0.1s",
    flex: 1,
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingEdit) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em", color: "#6b6558" }}>Loading puzzle…</span>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8", display: "flex", flexDirection: "column" }}>

      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "13px 22px",
        background: "#0d0d10",
        borderBottom: "1px solid rgba(184,150,106,0.13)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/admin?section=puzzles")}
          style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", padding: "6px 13px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.2)", background: "transparent", color: "#b8966a", cursor: "pointer" }}
        >
          ← Admin
        </button>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: "#e8e4d8", flex: 1 }}>
          {editId ? "Edit Puzzle" : "Puzzle Editor"}
        </div>
        <button
          onClick={handlePreview}
          disabled={saving || previewing}
          style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", padding: "8px 18px", borderRadius: 6, border: "1px solid rgba(93,232,247,0.35)", background: (saving || previewing) ? "transparent" : "rgba(93,232,247,0.08)", color: (saving || previewing) ? "#5a5550" : "#5de8f7", cursor: (saving || previewing) ? "default" : "pointer" }}
        >
          {previewing ? "Opening Preview…" : "Preview Puzzle"}
        </button>
        <button
          onClick={handlePublish}
          disabled={saving || previewing}
          style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", padding: "8px 20px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.45)", background: (saving || previewing) ? "transparent" : "rgba(184,150,106,0.10)", color: (saving || previewing) ? "#5a5550" : "#d4af7a", cursor: (saving || previewing) ? "default" : "pointer" }}
        >
          {saving ? "Saving…" : editId ? "Save Changes" : "Publish Puzzle"}
        </button>
      </div>

      {/* ── Three-column body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left palette ── */}
        <div style={{
          width: 264,
          flexShrink: 0,
          borderRight: "1px solid rgba(184,150,106,0.10)",
          overflowY: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>

          {/* Brush */}
          <div style={panelStyle}>
            <SectionLabel>Brush</SectionLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {(["W", "B", "erase"] as Brush[]).map(b => (
                <button key={b} onClick={() => setBrush(b)} style={chipBtn(brush === b)}>
                  {b === "W" ? "Wake" : b === "B" ? "Brake" : "Erase"}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: "#3a3530", marginTop: 8, lineHeight: 1.4 }}>
              Click a cell to place. Click occupied same-side to erase.
            </div>
          </div>

          {/* Token zones */}
          <div style={panelStyle}>
            <SectionLabel>Token Zones</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <Stepper label="Wake Reserves"  value={ps.reserves.W}  onChange={v => setZone("reserves",  "W", v)} />
              <Stepper label="Brake Reserves" value={ps.reserves.B}  onChange={v => setZone("reserves",  "B", v)} />
              <Stepper label="Wake Captives"  value={ps.captives.W}  onChange={v => setZone("captives",  "W", v)} />
              <Stepper label="Brake Captives" value={ps.captives.B}  onChange={v => setZone("captives",  "B", v)} />
              <Stepper label="Wake Void"      value={ps.voidCount.W} onChange={v => setZone("voidCount", "W", v)} />
              <Stepper label="Brake Void"     value={ps.voidCount.B} onChange={v => setZone("voidCount", "B", v)} />
            </div>
          </div>

          {/* Wake Hand */}
          <div style={panelStyle}>
            <SectionLabel>Wake Hand</SectionLabel>
            <div style={{ display: "flex", gap: 8 }}>
              {ps.routesW.map((r, i) => (
                <RouteSlot
                  key={i}
                  route={r}
                  onPick={() => setPickerTarget({ zone: "W", slot: i })}
                  onClear={() => clearRoute("W", i)}
                />
              ))}
            </div>
          </div>

          {/* Brake Hand */}
          <div style={panelStyle}>
            <SectionLabel>Brake Hand</SectionLabel>
            <div style={{ display: "flex", gap: 8 }}>
              {ps.routesB.map((r, i) => (
                <RouteSlot
                  key={i}
                  route={r}
                  onPick={() => setPickerTarget({ zone: "B", slot: i })}
                  onClear={() => clearRoute("B", i)}
                />
              ))}
            </div>
          </div>

          {/* Queue */}
          <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <SectionLabel>Queue</SectionLabel>
              <button
                onClick={() => setPs(prev => ({ ...prev, queue: [...prev.queue, null] }))}
                style={{ fontFamily: "'Cinzel', serif", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(184,150,106,0.18)", background: "transparent", color: "#b8966a", cursor: "pointer", marginLeft: 8, flexShrink: 0 }}
              >
                + Slot
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ps.queue.map((r, i) => (
                <RouteSlot
                  key={i}
                  route={r}
                  onPick={() => setPickerTarget({ zone: "Q", slot: i })}
                  onClear={() => clearRoute("Q", i)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Center board ── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: 24,
          overflowY: "auto",
        }}>

          {/* Starting player */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#5a5550" }}>First Turn</span>
            {(["W", "B"] as Player[]).map(p => (
              <button
                key={p}
                onClick={() => setPs(prev => ({ ...prev, startingPlayer: p }))}
                style={chipBtn(ps.startingPlayer === p)}
              >
                {p === "W" ? "Wake" : "Brake"}
              </button>
            ))}
          </div>

          <GridBoard
            boardMap={ps.board}
            selectedTokenId={null}
            ghost={null}
            started={true}
            phase="ACTION"
            onSquareClick={handleSquareClick}
            GHOST_MS={0}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setPs(prev => ({ ...prev, board: new Map() }))}
              style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(220,38,38,0.2)", background: "transparent", color: "#4a4540", cursor: "pointer" }}
            >
              Clear Board
            </button>
          </div>
        </div>

        {/* ── Right settings ── */}
        <div style={{
          width: 264,
          flexShrink: 0,
          borderLeft: "1px solid rgba(184,150,106,0.10)",
          overflowY: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>

          {/* Status */}
          {saveError && (
            <div style={{ padding: "10px 12px", borderRadius: 7, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#f87171", fontFamily: "'EB Garamond', serif", fontSize: 13 }}>
              {saveError}
            </div>
          )}
          {saveMsg && (
            <div style={{ padding: "10px 12px", borderRadius: 7, background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.22)", color: "#4ade80", fontFamily: "'EB Garamond', serif", fontSize: 13 }}>
              {saveMsg}
            </div>
          )}

          {/* Metadata */}
          <div style={panelStyle}>
            <SectionLabel>Metadata</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#5a5550", display: "block", marginBottom: 5 }}>Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Double Siege in Three"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#5a5550", display: "block", marginBottom: 5 }}>Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional hint or flavor text"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isTutorial}
                  onChange={() => setIsTutorial(v => !v)}
                  style={{ accentColor: "#b8966a", width: 13, height: 13 }}
                />
                <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#b0aa9e" }}>
                  Tutorial puzzle
                </span>
              </label>

              <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: "#5a5550", lineHeight: 1.45 }}>
                Tutorial puzzles are hidden from the normal puzzle list and should be handled differently from standard puzzles.
              </div>
            </div>
          </div>

          {/* Difficulty */}
          <div style={panelStyle}>
            <SectionLabel>Difficulty</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["easy", "medium", "hard", "grandmaster"] as Difficulty[]).map(d => (
                <button key={d} onClick={() => setDifficulty(d)} style={chipBtn(difficulty === d)}>
                  {d === "grandmaster" ? "GM" : d}
                </button>
              ))}
            </div>
          </div>

          {/* Move budget */}
          <div style={panelStyle}>
            <SectionLabel>Move Budget</SectionLabel>
            <Stepper label="Moves" value={moveBudget} onChange={setMoveBudget} min={1} max={20} />
          </div>

          {/* Win conditions */}
          <div style={panelStyle}>
            <SectionLabel>Win Conditions</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {(Object.keys(WIN_CONDITION_LABELS) as WinCondition[]).map(wc => (
                <label key={wc} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={winConditions.includes(wc)}
                    onChange={() => toggleWinCondition(wc)}
                    style={{ accentColor: "#b8966a", width: 13, height: 13 }}
                  />
                  <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#b0aa9e" }}>
                    {WIN_CONDITION_LABELS[wc]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={handlePreview}
              disabled={saving || previewing}
              style={{
                padding: "13px",
                borderRadius: 8,
                border: "1px solid rgba(93,232,247,0.38)",
                background: "rgba(93,232,247,0.06)",
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: (saving || previewing) ? "#5a5550" : "#5de8f7",
                cursor: (saving || previewing) ? "default" : "pointer",
                opacity: (saving || previewing) ? 0.5 : 1,
                transition: "all 0.12s",
              }}
            >
              {previewing ? "Opening Preview…" : "Preview Puzzle"}
            </button>

            <button
              onClick={handlePublish}
              disabled={saving || previewing}
              style={{
                padding: "13px",
                borderRadius: 8,
                border: "1px solid rgba(184,150,106,0.38)",
                background: "rgba(184,150,106,0.08)",
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: (saving || previewing) ? "#5a5550" : "#d4af7a",
                cursor: (saving || previewing) ? "default" : "pointer",
                opacity: (saving || previewing) ? 0.5 : 1,
                transition: "all 0.12s",
              }}
            >
              {saving ? "Saving…" : editId ? "Save Changes" : "Publish Puzzle"}
            </button>
          </div>
        </div>
      </div>

      {/* Route picker modal */}
      {pickerTarget && (
        <RoutePickerModal
          onSelect={r => {
            assignRoute(pickerTarget.zone, pickerTarget.slot, r)
            setPickerTarget(null)
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  )
}