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
  | "users"
  | "gear"
  | "analytics"
  | "reports"
  | "gamelogs"

const NAV_SECTIONS: { id: Section; label: string; description: string }[] = [
  { id: "announcements", label: "Announcements", description: "Post and manage site announcements" },
  { id: "achievements",  label: "Achievements",  description: "Add and configure player achievements" },
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
            {activeSection === "achievements"  && <PlaceholderPanel label="Achievements" description="Add and configure player achievements" />}
            {activeSection === "users"         && <PlaceholderPanel label="Users" description="Player moderation and management" />}
            {activeSection === "gear"          && <PlaceholderPanel label="Gear" description="Route sets, tokens, routes, boards" />}
            {activeSection === "analytics"     && <PlaceholderPanel label="Analytics" description="Usage stats and player activity" />}
            {activeSection === "reports"       && <PlaceholderPanel label="Reports" description="Review player-submitted reports" />}
            {activeSection === "gamelogs"      && <PlaceholderPanel label="Game Logs" description="Look up any game by ID" />}
          </div>
        </main>

      </div>
    </div>
  )
}
