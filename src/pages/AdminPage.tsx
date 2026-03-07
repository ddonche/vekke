// src/pages/AdminPage.tsx
import React, { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

const ADMIN_USER_ID = "eda57bd5-fdde-4fd5-b662-4f21352861bf"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  })
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(184,150,106,0.06)",
  border: "1px solid rgba(184,150,106,0.25)",
  borderRadius: 8,
  padding: "12px 14px",
  color: "#e8e4d8",
  fontFamily: "'EB Garamond', serif",
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
}

// ─── Nav sections ─────────────────────────────────────────────────────────────

type Section =
  | "announcements"
  | "achievements"
  | "puzzles"
  | "users"
  | "gear"
  | "analytics"
  | "reports"
  | "gamelogs"

const NAV_SECTIONS: { id: Section; label: string; description: string }[] = [
  { id: "announcements", label: "Announcements", description: "Post and manage site announcements" },
  { id: "achievements",  label: "Achievements",  description: "Add and configure player achievements" },
  { id: "puzzles",       label: "Puzzles",        description: "Create and manage puzzles" },
  { id: "users",         label: "Users",          description: "Player moderation and management" },
  { id: "gear",          label: "Gear",           description: "Route sets, tokens, routes, boards" },
  { id: "analytics",     label: "Analytics",      description: "Usage stats and player activity" },
  { id: "reports",       label: "Reports",        description: "Review player-submitted reports" },
  { id: "gamelogs",      label: "Game Logs",      description: "Look up any game by ID" },
]

// ─── Placeholder panel ────────────────────────────────────────────────────────

function PlaceholderPanel({ label, description }: { label: string; description: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 320, gap: 12 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        border: "1px solid rgba(184,150,106,0.20)",
        background: "rgba(184,150,106,0.05)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Cinzel', serif", fontSize: 18, color: "rgba(184,150,106,0.4)",
      }}>
        ◈
      </div>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700, color: "#6b6558", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#4a4540", textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
        {description}
      </div>
      <div style={{
        marginTop: 8,
        padding: "6px 16px",
        borderRadius: 6,
        border: "1px solid rgba(184,150,106,0.15)",
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "#4a4540",
      }}>
        Coming Soon
      </div>
    </div>
  )
}

// ─── Achievements panel ───────────────────────────────────────────────────────

type AchievementRow = {
  id: string
  key: string
  name: string
  description: string
  tier: string | null
  category: string
  threshold: number | null
  reward_id: string | null
  sort_order: number
}

type SkinSet = {
  id: string
  name: string
}

const CATEGORY_LABELS: Record<string, string> = {
  mechanic:     "Mechanic Milestones",
  chain:        "Chain Achievements",
  outcome:      "Outcome Milestones",
  elo:          "Elo Milestones",
  streak_win:   "Win Streaks",
  streak_daily: "Daily Streaks",
  ai_bot:       "AI Bot Challenges",
  format:       "Format-Specific",
  quirky:       "Quirky One-Offs",
  puzzle:       "Puzzle Achievements",
}

function AchievementsPanel() {
  const [achievements, setAchievements] = useState<AchievementRow[]>([])
  const [skinSets, setSkinSets] = useState<SkinSet[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [{ data: achs }, { data: sets }] = await Promise.all([
        supabase.from("achievements").select("*").order("sort_order"),
        supabase.from("skin_sets").select("id, name").order("name"),
      ])
      setAchievements((achs ?? []) as AchievementRow[])
      setSkinSets((sets ?? []) as SkinSet[])
      setLoading(false)
    })()
  }, [])

  async function setReward(achievementId: string, rewardId: string | null) {
    setSaving(achievementId)
    setError(null)
    const { error: err } = await supabase
      .from("achievements")
      .update({ reward_id: rewardId })
      .eq("id", achievementId)
    if (err) {
      setError(err.message)
    } else {
      setAchievements(prev => prev.map(a => a.id === achievementId ? { ...a, reward_id: rewardId } : a))
      setSaved(achievementId)
      setTimeout(() => setSaved(null), 2000)
    }
    setSaving(null)
  }

  if (loading) return <div style={{ padding: 24, color: "#6b6558" }}>Loading…</div>

  const grouped = Object.entries(CATEGORY_LABELS).map(([cat, label]) => ({
    cat, label,
    items: achievements.filter(a => a.category === cat),
  })).filter(g => g.items.length > 0)

  const TIER_COLOR: Record<string, string> = {
    gold: "#f5c842", silver: "#b0b8c8", bronze: "#cd7f32", basic: "#b8966a",
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 6, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171", fontFamily: "'EB Garamond', serif", fontSize: 14 }}>
          {error}
        </div>
      )}

      {grouped.map(({ cat, label, items }) => (
        <div key={cat} style={{ marginBottom: 32 }}>
          {/* Category header */}
          <div style={{
            fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.35em", textTransform: "uppercase",
            color: "#6b6558", display: "flex", alignItems: "center", gap: 12,
            marginBottom: 10,
          }}>
            {label}
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Achievement rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map(a => {
              const tierColor = TIER_COLOR[a.tier ?? "basic"] ?? "#b8966a"
              const isSaving  = saving === a.id
              const isSaved   = saved === a.id

              return (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "#0d0d10",
                }}>
                  {/* Tier dot */}
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: tierColor,
                  }} />

                  {/* Name + description */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontFamily: "'Cinzel', serif", fontSize: 12,
                        fontWeight: 600, color: "#e8e4d8", letterSpacing: "0.04em",
                      }}>
                        {a.name}
                      </span>
                      {a.tier && (
                        <span style={{
                          fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
                          color: tierColor, fontFamily: "'Cinzel', serif",
                        }}>
                          {a.tier}
                        </span>
                      )}
                      {a.threshold && (
                        <span style={{ fontSize: 10, color: "#4a4640", fontFamily: "monospace" }}>
                          ×{a.threshold}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: "'EB Garamond', serif", fontSize: 12,
                      color: "rgba(232,228,216,0.4)", marginTop: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {a.description}
                    </div>
                  </div>

                  {/* Reward dropdown */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <select
                      value={a.reward_id ?? ""}
                      disabled={isSaving}
                      onChange={e => setReward(a.id, e.target.value || null)}
                      style={{
                        fontFamily: "'Cinzel', serif", fontSize: 10,
                        letterSpacing: "0.06em",
                        background: "#0a0a0c",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 4, color: "#e8e4d8",
                        padding: "5px 8px", cursor: "pointer",
                        minWidth: 140,
                      }}
                    >
                      <option value="">— No reward —</option>
                      {skinSets.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>

                    {/* Save feedback */}
                    <div style={{ width: 40, textAlign: "center" }}>
                      {isSaving && (
                        <span style={{ fontSize: 10, color: "#6b6558", fontFamily: "'Cinzel', serif" }}>…</span>
                      )}
                      {isSaved && (
                        <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "'Cinzel', serif" }}>✓</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Puzzles panel ────────────────────────────────────────────────────────────

type PuzzleRow = {
  id: string
  title: string
  description: string | null
  difficulty: string
  point_value: number
  move_budget: number
  win_conditions: string[]
  is_published: boolean
  created_at: string
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy:        "#4ade80",
  medium:      "#facc15",
  hard:        "#f97316",
  grandmaster: "#ee484c",
}

function PuzzlesPanel() {
  const navigate = useNavigate()
  const [puzzles, setPuzzles] = useState<PuzzleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toggleId, setToggleId] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from("puzzles")
      .select("id, title, description, difficulty, point_value, move_budget, win_conditions, is_published, created_at")
      .order("created_at", { ascending: false })
    setPuzzles((data ?? []) as PuzzleRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this puzzle? This cannot be undone.")) return
    setDeletingId(id)
    // Remove completions first to satisfy foreign key constraint
    const { error: compErr } = await supabase.from("puzzle_completions").delete().eq("puzzle_id", id)
    if (compErr) { alert(`Delete failed: ${compErr.message}`); setDeletingId(null); return }
    const { error } = await supabase.from("puzzles").delete().eq("id", id)
    if (error) { alert(`Delete failed: ${error.message}`); setDeletingId(null); return }
    setPuzzles(prev => prev.filter(p => p.id !== id))
    setDeletingId(null)
  }

  async function handleTogglePublished(p: PuzzleRow) {
    setToggleId(p.id)
    const next = !p.is_published
    const { error } = await supabase.from("puzzles").update({ is_published: next }).eq("id", p.id)
    if (!error) {
      setPuzzles(prev => prev.map(x => x.id === p.id ? { ...x, is_published: next } : x))
    }
    setToggleId(null)
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6b6558" }}>
          {puzzles.length} total
        </div>
        <button
          onClick={() => navigate("/puzzle-editor")}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "1px solid rgba(50,150,171,0.4)",
            background: "rgba(50,150,171,0.10)",
            fontFamily: "'Cinzel', serif",
            fontSize: 10, fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#5de8f7",
            cursor: "pointer",
          }}
        >
          + New Puzzle
        </button>
      </div>

      {loading ? (
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em", color: "#6b6558", textAlign: "center", padding: "48px 0" }}>
          Loading...
        </div>
      ) : puzzles.length === 0 ? (
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.12em", color: "#6b6558", textAlign: "center", padding: "48px 0" }}>
          No puzzles yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {puzzles.map(p => {
            const diffColor = DIFFICULTY_COLOR[p.difficulty] ?? "#b8966a"
            const isDeleting = deletingId === p.id
            const isToggling = toggleId === p.id

            return (
              <div
                key={p.id}
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(184,150,106,0.12)",
                  background: "rgba(184,150,106,0.03)",
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                {/* Difficulty dot */}
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: diffColor, flexShrink: 0, marginTop: 5 }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700, color: "#e8e4d8" }}>
                      {p.title}
                    </span>
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: diffColor }}>
                      {p.difficulty === "grandmaster" ? "GM" : p.difficulty}
                    </span>
                    {!p.is_published && (
                      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a4540", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, padding: "1px 5px" }}>
                        Draft
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: p.description ? 6 : 0 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a4540" }}>
                      {p.move_budget} moves
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a4540" }}>
                      {p.point_value} pts
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a4540" }}>
                      {(p.win_conditions ?? []).join(", ")}
                    </span>
                  </div>
                  {p.description && (
                    <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: "#5a5550", lineHeight: 1.5 }}>
                      {p.description}
                    </div>
                  )}
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.1em", color: "#3a3530", marginTop: 4 }}>
                    {formatDate(p.created_at)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handleTogglePublished(p)}
                    disabled={isToggling}
                    style={{
                      padding: "5px 12px", borderRadius: 6,
                      border: `1px solid ${p.is_published ? "rgba(74,222,128,0.3)" : "rgba(184,150,106,0.25)"}`,
                      background: "transparent",
                      fontFamily: "'Cinzel', serif", fontSize: 9,
                      letterSpacing: "0.12em", textTransform: "uppercase",
                      color: isToggling ? "#4a4540" : p.is_published ? "#4ade80" : "#b8966a",
                      cursor: isToggling ? "default" : "pointer",
                    }}
                  >
                    {isToggling ? "…" : p.is_published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => navigate(`/puzzle-editor?id=${p.id}`)}
                    style={{
                      padding: "5px 12px", borderRadius: 6,
                      border: "1px solid rgba(184,150,106,0.25)",
                      background: "transparent",
                      fontFamily: "'Cinzel', serif", fontSize: 9,
                      letterSpacing: "0.12em", textTransform: "uppercase",
                      color: "#b8966a",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={isDeleting}
                    style={{
                      padding: "5px 12px", borderRadius: 6,
                      border: "1px solid rgba(238,72,76,0.30)",
                      background: "transparent",
                      fontFamily: "'Cinzel', serif", fontSize: 9,
                      letterSpacing: "0.12em", textTransform: "uppercase",
                      color: isDeleting ? "#6b6558" : "#ee484c",
                      cursor: isDeleting ? "default" : "pointer",
                    }}
                  >
                    {isDeleting ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Gear panel ──────────────────────────────────────────────────────────────

type SkinType = "token" | "route" | "board"

function GearPanel() {
  const [tab, setTab] = useState<SkinType>("token")
  const [skinSets, setSkinSets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Token form
  const [tokenSetId, setTokenSetId] = useState("")
  const [tokenSetName, setTokenSetName] = useState("")
  const [tokenSetDesc, setTokenSetDesc] = useState("")
  const [lightFile, setLightFile] = useState<File | null>(null)
  const [darkFile, setDarkFile] = useState<File | null>(null)
  const [lightPreview, setLightPreview] = useState<string | null>(null)
  const [darkPreview, setDarkPreview] = useState<string | null>(null)

  // Route/Board form
  const [cssSetId, setCssSetId] = useState("")
  const [cssSetName, setCssSetName] = useState("")
  const [cssSetDesc, setCssSetDesc] = useState("")
  const [cssType, setCssType] = useState<"route" | "board">("route")
  const [cssStyle, setCssStyle] = useState("{}")

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from("skin_sets").select("id, name, acquisition_type").order("name")
      setSkinSets(data ?? [])
      setLoading(false)
    })()
  }, [])

  function reset() {
    setTokenSetId(""); setTokenSetName(""); setTokenSetDesc("")
    setLightFile(null); setDarkFile(null)
    setLightPreview(null); setDarkPreview(null)
    setCssSetId(""); setCssSetName(""); setCssSetDesc("")
    setCssStyle("{}")
    setError(null)
  }

  function handleFileChange(file: File, role: "light" | "dark") {
    const url = URL.createObjectURL(file)
    if (role === "light") { setLightFile(file); setLightPreview(url) }
    else                  { setDarkFile(file);  setDarkPreview(url) }
  }

  async function uploadToken(file: File, setId: string, role: "light" | "dark") {
    const ext  = file.name.split(".").pop() ?? "png"
    const path = `tokens/${setId}_${role}.${ext}`
    const { error } = await supabase.storage.from("skins").upload(path, file)
    if (error) throw new Error(`Upload failed: ${error.message}`)
    const { data } = supabase.storage.from("skins").getPublicUrl(path)
    return data.publicUrl
  }

  async function saveTokenSet() {
    if (!tokenSetId.trim())   return setError("Set ID is required")
    if (!tokenSetName.trim()) return setError("Set name is required")
    if (!lightFile)           return setError("Light token image is required")
    if (!darkFile)            return setError("Dark token image is required")

    setSaving(true); setError(null)
    try {
      const [lightUrl, darkUrl] = await Promise.all([
        uploadToken(lightFile, tokenSetId, "light"),
        uploadToken(darkFile,  tokenSetId, "dark"),
      ])

      const { error: setErr } = await supabase.from("skin_sets").insert({
        id: tokenSetId, name: tokenSetName,
        description: tokenSetDesc || null,
        acquisition_type: "achievement",
      })
      if (setErr) throw new Error(setErr.message)

      const { error: skinErr } = await supabase.from("skins").insert([
        {
          id: `token-${tokenSetId}-light`,
          name: `${tokenSetName} (Light)`,
          type: "token", set_id: tokenSetId,
          acquisition_type: "achievement",
          description: `${tokenSetName} light token`,
          style: {}, image_url: lightUrl,
        },
        {
          id: `token-${tokenSetId}-dark`,
          name: `${tokenSetName} (Dark)`,
          type: "token", set_id: tokenSetId,
          acquisition_type: "achievement",
          description: `${tokenSetName} dark token`,
          style: {}, image_url: darkUrl,
        },
      ])
      if (skinErr) throw new Error(skinErr.message)

      setSkinSets(prev => [...prev, { id: tokenSetId, name: tokenSetName, acquisition_type: "achievement" }])
      setSuccess(`Token set "${tokenSetName}" created.`)
      setTimeout(() => setSuccess(null), 3000)
      reset()
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  async function saveCssSet() {
    if (!cssSetId.trim())   return setError("Set ID is required")
    if (!cssSetName.trim()) return setError("Set name is required")

    let parsedStyle: any
    try { parsedStyle = JSON.parse(cssStyle) }
    catch { return setError("Style JSON is invalid") }

    setSaving(true); setError(null)
    try {
      const { error: setErr } = await supabase.from("skin_sets").insert({
        id: cssSetId, name: cssSetName,
        description: cssSetDesc || null,
        acquisition_type: "achievement",
      })
      if (setErr) throw new Error(setErr.message)

      const { error: skinErr } = await supabase.from("skins").insert({
        id: `${cssType}-${cssSetId}`,
        name: cssSetName,
        type: cssType, set_id: cssSetId,
        acquisition_type: "achievement",
        description: cssSetDesc || null,
        style: parsedStyle,
      })
      if (skinErr) throw new Error(skinErr.message)

      setSkinSets(prev => [...prev, { id: cssSetId, name: cssSetName, acquisition_type: "achievement" }])
      setSuccess(`${cssType.charAt(0).toUpperCase() + cssType.slice(1)} set "${cssSetName}" created.`)
      setTimeout(() => setSuccess(null), 3000)
      reset()
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  const INPUT: React.CSSProperties = {
    fontFamily: "'EB Garamond', serif", fontSize: 14,
    background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#e8e4d8", padding: "8px 12px", width: "100%",
  }
  const LABEL: React.CSSProperties = {
    fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.15em",
    textTransform: "uppercase", color: "#6b6558", marginBottom: 5, display: "block",
  }
  const UPLOAD_ZONE: React.CSSProperties = {
    border: "1px dashed rgba(184,150,106,0.3)", borderRadius: 8,
    padding: "20px 14px", textAlign: "center", cursor: "pointer",
    background: "rgba(184,150,106,0.03)", display: "block",
  }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {(["token", "route", "board"] as SkinType[]).map(t => (
          <button key={t} onClick={() => { setTab(t as SkinType); setCssType(t as "route" | "board"); setError(null) }} style={{
            fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.15em",
            textTransform: "uppercase", padding: "7px 18px", borderRadius: 4,
            border: `1px solid ${tab === t ? "rgba(184,150,106,0.5)" : "rgba(255,255,255,0.08)"}`,
            background: tab === t ? "rgba(184,150,106,0.1)" : "transparent",
            color: tab === t ? "#d4af7a" : "#6b6558", cursor: "pointer",
          }}>
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 6, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171", fontFamily: "'EB Garamond', serif", fontSize: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 6, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", fontFamily: "'EB Garamond', serif", fontSize: 14 }}>
          {success}
        </div>
      )}

      {/* Token form */}
      {tab === "token" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LABEL}>Set ID</label>
              <input style={INPUT} value={tokenSetId} onChange={e => setTokenSetId(e.target.value)} placeholder="e.g. vinyl" />
            </div>
            <div>
              <label style={LABEL}>Set Name</label>
              <input style={INPUT} value={tokenSetName} onChange={e => setTokenSetName(e.target.value)} placeholder="e.g. Vinyl" />
            </div>
          </div>
          <div>
            <label style={LABEL}>Description (optional)</label>
            <input style={INPUT} value={tokenSetDesc} onChange={e => setTokenSetDesc(e.target.value)} placeholder="Short description" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LABEL}>Light Token</label>
              <label style={UPLOAD_ZONE}>
                {lightPreview
                  ? <img src={lightPreview} style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8 }} />
                  : <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: "#4a4640" }}>Click to upload</div>
                }
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0], "light")} />
              </label>
            </div>
            <div>
              <label style={LABEL}>Dark Token</label>
              <label style={UPLOAD_ZONE}>
                {darkPreview
                  ? <img src={darkPreview} style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8 }} />
                  : <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: "#4a4640" }}>Click to upload</div>
                }
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0], "dark")} />
              </label>
            </div>
          </div>
          <button onClick={saveTokenSet} disabled={saving} style={{
            fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em",
            textTransform: "uppercase", padding: "11px", borderRadius: 4,
            border: "1px solid rgba(184,150,106,0.45)", background: "rgba(184,150,106,0.12)",
            color: "#d4af7a", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
          }}>
            {saving ? "Saving…" : "Create Token Set"}
          </button>
        </div>
      )}

      {/* Route / Board form */}
      {(tab === "route" || tab === "board") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LABEL}>Set ID</label>
              <input style={INPUT} value={cssSetId} onChange={e => setCssSetId(e.target.value)} placeholder={`e.g. neon`} />
            </div>
            <div>
              <label style={LABEL}>Set Name</label>
              <input style={INPUT} value={cssSetName} onChange={e => setCssSetName(e.target.value)} placeholder="e.g. Neon" />
            </div>
          </div>
          <div>
            <label style={LABEL}>Description (optional)</label>
            <input style={INPUT} value={cssSetDesc} onChange={e => setCssSetDesc(e.target.value)} placeholder="Short description" />
          </div>
          <div>
            <label style={LABEL}>Style JSON</label>
            <textarea
              value={cssStyle}
              onChange={e => setCssStyle(e.target.value)}
              rows={8}
              style={{ ...INPUT, fontFamily: "monospace", fontSize: 12, resize: "vertical" as const }}
              placeholder='{"bodyColor": "#ff00ff"}'
            />
          </div>
          <button onClick={saveCssSet} disabled={saving} style={{
            fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em",
            textTransform: "uppercase", padding: "11px", borderRadius: 4,
            border: "1px solid rgba(184,150,106,0.45)", background: "rgba(184,150,106,0.12)",
            color: "#d4af7a", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
          }}>
            {saving ? "Saving…" : `Create ${tab.charAt(0).toUpperCase() + tab.slice(1)} Set`}
          </button>
        </div>
      )}

      {/* Existing sets */}
      {!loading && skinSets.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div style={{
            fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.35em", textTransform: "uppercase",
            color: "#6b6558", display: "flex", alignItems: "center", gap: 12, marginBottom: 12,
          }}>
            Existing Sets <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {skinSets.map(s => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 14px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)", background: "#0d0d10",
              }}>
                <div>
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: "#e8e4d8", fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a4640", marginLeft: 10 }}>{s.id}</span>
                </div>
                <span style={{
                  fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: s.acquisition_type === "achievement" ? "#b8966a" : "#4a4540",
                }}>
                  {s.acquisition_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Announcements panel ──────────────────────────────────────────────────────

function AnnouncementsPanel({ userId }: { userId: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "new" | "edit">("list")
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false })
    setAnnouncements(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setTitle("")
    setBody("")
    setError(null)
    setView("new")
  }

  function openEdit(a: Announcement) {
    setEditing(a)
    setTitle(a.title)
    setBody(a.body)
    setError(null)
    setView("edit")
  }

  function cancel() {
    setView("list")
    setEditing(null)
    setTitle("")
    setBody("")
    setError(null)
  }

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.")
      return
    }
    setSaving(true)
    setError(null)

    if (view === "edit" && editing) {
      const { error: err } = await supabase
        .from("announcements")
        .update({ title: title.trim(), body: body.trim() })
        .eq("id", editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from("announcements")
        .insert({ title: title.trim(), body: body.trim(), created_by: userId })
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    setSuccess(view === "edit" ? "Updated." : "Posted.")
    setTimeout(() => setSuccess(null), 2500)
    await load()
    cancel()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await supabase.from("announcements").delete().eq("id", id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
    setDeletingId(null)
  }

  // ── Form view ──
  if (view === "new" || view === "edit") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <button
            onClick={cancel}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.2em",
              textTransform: "uppercase", color: "#6b6558", padding: 0,
            }}
          >
            ← Back
          </button>
          <div style={{ width: 1, height: 12, background: "rgba(184,150,106,0.2)" }} />
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>
            {view === "edit" ? "Edit Announcement" : "New Announcement"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            style={inputStyle}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Body — supports plain text and line breaks"
            rows={8}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
          />
        </div>

        {error && (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: "#ee484c", marginTop: 12, letterSpacing: "0.05em" }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: "#34d399", marginTop: 12, letterSpacing: "0.05em" }}>
            {success}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "11px 28px",
              borderRadius: 8,
              border: "2px solid #3296ab",
              background: "rgba(50,150,171,0.15)",
              fontFamily: "'Cinzel', serif",
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: saving ? "#6b6558" : "#e8e4d8",
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Saving..." : view === "edit" ? "Save Changes" : "Post"}
          </button>
          <button
            onClick={cancel}
            style={{
              padding: "11px 20px",
              borderRadius: 8,
              border: "1px solid rgba(184,150,106,0.2)",
              background: "transparent",
              fontFamily: "'Cinzel', serif",
              fontSize: 11, fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#6b6558",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── List view ──
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6b6558" }}>
          {announcements.length} total
        </div>
        <button
          onClick={openNew}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "1px solid rgba(50,150,171,0.4)",
            background: "rgba(50,150,171,0.10)",
            fontFamily: "'Cinzel', serif",
            fontSize: 10, fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#5de8f7",
            cursor: "pointer",
          }}
        >
          + New
        </button>
      </div>

      {loading ? (
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em", color: "#6b6558", textAlign: "center", padding: "48px 0" }}>
          Loading...
        </div>
      ) : announcements.length === 0 ? (
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.12em", color: "#6b6558", textAlign: "center", padding: "48px 0" }}>
          No announcements yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {announcements.map(a => (
            <div
              key={a.id}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(184,150,106,0.12)",
                background: "rgba(184,150,106,0.03)",
                padding: "14px 18px",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700, color: "#e8e4d8", marginBottom: 3 }}>
                  {a.title}
                </div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#6b6558", marginBottom: 8 }}>
                  {formatDate(a.created_at)}
                </div>
                <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#9a9488", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {a.body.length > 160 ? a.body.slice(0, 160) + "…" : a.body}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => openEdit(a)}
                  style={{
                    padding: "5px 12px", borderRadius: 6,
                    border: "1px solid rgba(184,150,106,0.25)",
                    background: "transparent",
                    fontFamily: "'Cinzel', serif", fontSize: 9,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    color: "#b8966a", cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  style={{
                    padding: "5px 12px", borderRadius: 6,
                    border: "1px solid rgba(238,72,76,0.30)",
                    background: "transparent",
                    fontFamily: "'Cinzel', serif", fontSize: 9,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    color: deletingId === a.id ? "#6b6558" : "#ee484c",
                    cursor: deletingId === a.id ? "default" : "pointer",
                  }}
                >
                  {deletingId === a.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main AdminPage ───────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const activeSection = (searchParams.get("section") as Section) ?? "announcements"

  function setSection(s: Section) {
    setSearchParams({ section: s })
  }

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const viewer = sess.session?.user ?? null
      if (viewer) {
        setUserId(viewer.id)
        const { data: myp } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", viewer.id)
          .single()
        if (myp) setMe(myp as any)
      }
      setAuthLoading(false)
    })()
  }, [])

  const isAdmin = userId === ADMIN_USER_ID

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em", color: "#6b6558" }}>
          Loading...
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0c", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: "0.15em", color: "#6b6558" }}>
          Not found.
        </div>
      </div>
    )
  }

  const currentSection = NAV_SECTIONS.find(s => s.id === activeSection)

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8" }}>
      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        activePage={null}
        onSignIn={() => window.location.assign("/?openAuth=1&returnTo=/admin")}
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
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px", display: "flex", gap: 0, alignItems: "flex-start" }}>

        {/* ── Left nav ── */}
        <aside style={{ width: 220, flexShrink: 0, position: "sticky", top: 80 }}>
          <div style={{
            fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.3em",
            textTransform: "uppercase", color: "#b8966a", marginBottom: 20, paddingLeft: 12,
          }}>
            Admin
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV_SECTIONS.map(s => {
              const active = s.id === activeSection
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 3,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: active ? "1px solid rgba(184,150,106,0.25)" : "1px solid transparent",
                    background: active ? "rgba(184,150,106,0.08)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                    width: "100%",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)" }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
                >
                  <span style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 11, fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: active ? "#d4af7a" : "#b0aa9e",
                  }}>
                    {s.label}
                  </span>
                  <span style={{
                    fontFamily: "'EB Garamond', serif",
                    fontSize: 12,
                    color: active ? "#9a9080" : "#4a4540",
                    lineHeight: 1.3,
                  }}>
                    {s.description}
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* ── Divider ── */}
        <div style={{ width: 1, background: "rgba(184,150,106,0.12)", alignSelf: "stretch", margin: "0 32px", minHeight: 400 }} />

        {/* ── Content area ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 22, fontWeight: 700,
              color: "#e8e4d8",
              margin: "0 0 6px 0",
              letterSpacing: "0.04em",
            }}>
              {currentSection?.label}
            </h2>
            <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#6b6558" }}>
              {currentSection?.description}
            </div>
          </div>

          <div style={{
            borderRadius: 12,
            border: "1px solid rgba(184,150,106,0.12)",
            background: "rgba(184,150,106,0.02)",
            padding: 28,
            minHeight: 300,
          }}>
            {activeSection === "announcements" && <AnnouncementsPanel userId={userId!} />}
            {activeSection === "achievements"  && <AchievementsPanel />}
            {activeSection === "puzzles"       && <PuzzlesPanel />}
            {activeSection === "users"         && <PlaceholderPanel label="Users" description="Player moderation and management" />}
            {activeSection === "gear"          && <GearPanel />}
            {activeSection === "analytics"     && <PlaceholderPanel label="Analytics" description="Usage stats and player activity" />}
            {activeSection === "reports"       && <PlaceholderPanel label="Reports" description="Review player-submitted reports" />}
            {activeSection === "gamelogs"      && <PlaceholderPanel label="Game Logs" description="Look up any game by ID" />}
          </div>
        </main>

      </div>
    </div>
  )
}
