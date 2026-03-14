// src/pages/CategoryPage.tsx
import React, { useEffect, useState, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

const ADMIN_USER_ID = "eda57bd5-fdde-4fd5-b662-4f21352861bf"

function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-forum-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-forum-fonts"
  link.rel = "stylesheet"
  link.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
}

interface Category {
  id: number
  name: string
  slug: string
  description: string | null
  color: string
}

interface TopicAuthor {
  username: string
  avatar_url: string | null
  country_code: string | null
  account_tier: string | null
}

interface TopicStats {
  elo_blitz: number
  elo_rapid: number
  elo_standard: number
  elo_daily: number
}

interface Topic {
  id: string
  title: string
  is_pinned: boolean
  is_locked: boolean
  reply_count: number
  upvote_count: number
  last_reply_at: string | null
  created_at: string
  author_id: string
  author: TopicAuthor
  author_stats: TopicStats | null
}

export function CategoryPage() {
  injectFonts()
  const { categorySlug } = useParams<{ categorySlug: string }>()
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newBody, setNewBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isAdmin = userId === ADMIN_USER_ID

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const uid = data.session.user.id
      setUserId(uid)
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", uid)
        .single()
      if (profile) setMe(profile as any)
    })
  }, [])

  const loadTopics = useCallback(async () => {
    if (!categorySlug) return
    const { data: cat } = await supabase
      .from("forum_categories")
      .select("*")
      .eq("slug", categorySlug)
      .single()
    if (!cat) { setLoading(false); return }
    setCategory(cat)

    // Step 1: topics + profiles
    const { data: topicData } = await supabase
      .from("forum_topics")
      .select(`
        id, title, is_pinned, is_locked, reply_count, upvote_count,
        last_reply_at, created_at, author_id,
        author:profiles!author_id(username, avatar_url, country_code, account_tier)
      `)
      .eq("category_id", cat.id)
      .eq("is_deleted", false)
      .order("is_pinned", { ascending: false })
      .order("last_reply_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (!topicData) { setLoading(false); return }

    // Step 2: player_stats by author IDs
    const authorIds = [...new Set((topicData as any[]).map((t: any) => t.author_id))]
    const { data: statsData } = await supabase
      .from("player_stats")
      .select("user_id, elo_blitz, elo_rapid, elo_standard, elo_daily")
      .in("user_id", authorIds)

    const statsMap = new Map((statsData ?? []).map((s: any) => [s.user_id, s]))

    setTopics((topicData as any[]).map((t: any) => ({
      ...t,
      author_stats: statsMap.get(t.author_id) ?? null,
    })) as unknown as Topic[])
    setLoading(false)
  }, [categorySlug])

  useEffect(() => { loadTopics() }, [loadTopics])

  async function handleSubmitTopic() {
    if (!newTitle.trim() || !newBody.trim() || !userId || !category) return
    setSubmitting(true)
    setFormError(null)
    const slug = newTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      + "-" + Date.now().toString(36)
    const { error } = await supabase.from("forum_topics").insert({
      category_id: category.id, author_id: userId,
      title: newTitle.trim(), slug, body: newBody.trim(),
    })
    if (error) { setFormError("Failed to post. Please try again."); setSubmitting(false); return }
    setNewTitle(""); setNewBody(""); setShowForm(false)
    setSubmitting(false)
    loadTopics()
  }

  async function handlePin(topic: Topic) {
    await supabase.from("forum_topics").update({ is_pinned: !topic.is_pinned }).eq("id", topic.id)
    loadTopics()
  }

  async function handleLock(topic: Topic) {
    await supabase.from("forum_topics").update({ is_locked: !topic.is_locked }).eq("id", topic.id)
    loadTopics()
  }

  async function handleDelete(topic: Topic) {
    if (!window.confirm("Delete this topic?")) return
    await supabase.from("forum_topics").update({ is_deleted: true }).eq("id", topic.id)
    loadTopics()
  }

  return (
    <div style={{
      position: "fixed", inset: 0, width: "100vw", height: "100vh",
      display: "flex", flexDirection: "column",
      backgroundColor: "#0a0a0c", color: "#e8e4d8",
      fontFamily: "'EB Garamond', Georgia, serif", overflow: "hidden",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #0a0a0c; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .forum-topic-row { transition: all 0.12s ease; }
        .forum-topic-row:hover { background: rgba(184,150,106,0.05) !important; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel={category?.name ?? "Forum"}
        elo={undefined}
        activePage="forum"
        myGamesTurnCount={0}
      />

      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "28px 16px 60px", maxWidth: 760, margin: "0 auto", width: "100%" }}>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <button onClick={() => navigate("/forum")} style={breadcrumbBtnStyle}>Forum</button>
            <span style={{ color: "#555", fontSize: 14 }}>/</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: "#b0aa9e", letterSpacing: "0.06em" }}>
              {category?.name ?? "…"}
            </span>
          </div>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.3rem", fontWeight: 700, color: category?.color ?? "#e8e4d8", letterSpacing: "0.06em" }}>
                {category?.name ?? "…"}
              </div>
              {category?.description && (
                <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 15, color: "#b0aa9e", marginTop: 4 }}>
                  {category.description}
                </div>
              )}
            </div>
            {!!userId && !showForm && (
              <button onClick={() => setShowForm(true)} style={primaryBtnStyle}>
                + New Topic
              </button>
            )}
          </div>

          <div style={{ height: 1, background: category ? `${category.color}50` : "rgba(184,150,106,0.2)", marginBottom: 20 }} />

          {/* New topic form */}
          {showForm && (
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(184,150,106,0.2)",
              borderRadius: 8, padding: 20, marginBottom: 20,
            }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: "0.14em", color: "#b8966a", marginBottom: 14, fontWeight: 700 }}>
                NEW TOPIC
              </div>
              <input
                type="text" placeholder="Title" value={newTitle} maxLength={120}
                onChange={(e) => setNewTitle(e.target.value)}
                style={inputStyle}
              />
              <textarea
                placeholder="Body" value={newBody} rows={6}
                onChange={(e) => setNewBody(e.target.value)}
                style={{ ...inputStyle, resize: "vertical" as const, marginTop: 10 }}
              />
              {formError && <p style={{ color: "#ee484c", fontFamily: "'EB Garamond', serif", fontSize: 14, margin: "8px 0 0" }}>{formError}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  onClick={handleSubmitTopic}
                  disabled={submitting || !newTitle.trim() || !newBody.trim()}
                  style={{ ...primaryBtnStyle, opacity: submitting || !newTitle.trim() || !newBody.trim() ? 0.5 : 1 }}
                >
                  {submitting ? "Posting…" : "Post Topic"}
                </button>
                <button onClick={() => { setShowForm(false); setFormError(null) }} style={ghostBtnStyle}>Cancel</button>
              </div>
            </div>
          )}

          {/* Topic list */}
          {loading ? (
            <LoadingRows count={4} height={70} />
          ) : topics.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 18, color: "#b0aa9e" }}>
                No topics yet. Be the first to start a discussion.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {topics.map((topic) => {
                const peakElo = topic.author_stats
                  ? Math.max(topic.author_stats.elo_blitz, topic.author_stats.elo_rapid, topic.author_stats.elo_standard, topic.author_stats.elo_daily)
                  : null
                return (
                  <div
                    key={topic.id}
                    className="forum-topic-row"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${topic.is_pinned ? "rgba(93,232,247,0.18)" : "rgba(184,150,106,0.08)"}`,
                      borderRadius: 6, overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => navigate(`/forum/${categorySlug}/${topic.id}`)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
                        textAlign: "left", background: "transparent", border: "none",
                        padding: "14px 16px", cursor: "pointer", color: "inherit",
                      }}
                    >
                      {/* Pin / lock icons */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 2, width: 14, flexShrink: 0 }}>
                        {topic.is_pinned && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#5de8f7" title="Pinned">
                            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                          </svg>
                        )}
                        {topic.is_locked && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#b8966a" title="Locked">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="#b8966a" strokeWidth="2" />
                          </svg>
                        )}
                      </div>

                      {/* Title + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 600, color: "#e8e4d8", letterSpacing: "0.03em", marginBottom: 7 }}>
                          {topic.title}
                        </div>
                        <PostMeta author={topic.author} peakElo={peakElo} timestamp={topic.created_at} />
                      </div>

                      {/* Stats */}
                      <div style={{ display: "flex", gap: 14, flexShrink: 0, alignItems: "center" }}>
                        <StatPill type="upvote" value={topic.upvote_count} />
                        <StatPill type="reply" value={topic.reply_count} />
                        {topic.last_reply_at && (
                          <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#555", minWidth: 52, textAlign: "right" }}>
                            {timeAgo(topic.last_reply_at)}
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Mod controls */}
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 8, padding: "0 16px 10px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8 }}>
                        <ModBtn onClick={() => handlePin(topic)} label={topic.is_pinned ? "Unpin" : "Pin"} color="#5de8f7" />
                        <ModBtn onClick={() => handleLock(topic)} label={topic.is_locked ? "Unlock" : "Lock"} color="#b8966a" />
                        <ModBtn onClick={() => handleDelete(topic)} label="Delete" color="#ee484c" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function PostMeta({ author, peakElo, timestamp }: { author: TopicAuthor; peakElo: number | null; timestamp: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <PostAvatar username={author.username} avatarUrl={author.avatar_url} size={22} />
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 600, color: "#b8966a", letterSpacing: "0.04em" }}>
        {author.username}
      </span>
      {author.country_code && (
        <img
          src={`https://flagicons.lipis.dev/flags/4x3/${author.country_code.toLowerCase()}.svg`}
          width={16} height={12} alt={author.country_code}
          style={{ borderRadius: 2, display: "inline-block" }}
          onError={(e) => { e.currentTarget.style.display = "none" }}
        />
      )}
      {peakElo !== null && (
        <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#666" }}>{peakElo}</span>
      )}
      {author.account_tier && author.account_tier !== "free" && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 7px", borderRadius: 999,
          border: "1px solid rgba(212,175,122,0.35)",
          background: "rgba(212,175,122,0.08)",
          color: "#d4af7a", fontFamily: "'Cinzel', serif",
          fontSize: 10, letterSpacing: "0.18em",
          textTransform: "uppercase" as const, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "#d4af7a", boxShadow: "0 0 0 2px rgba(212,175,122,0.14)", flexShrink: 0 }} />
          Pro
        </span>
      )}
      <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#555" }}>{timeAgo(timestamp)}</span>
    </div>
  )
}

function PostAvatar({ username, avatarUrl, size = 24 }: { username: string; avatarUrl?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "#13131a", border: "1px solid rgba(184,150,106,0.2)",
      display: "grid", placeItems: "center",
      fontSize: Math.max(9, Math.floor(size * 0.4)),
      fontWeight: 800, color: "#e8e4d8", flexShrink: 0, overflow: "hidden",
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span>{(username ?? "?")[0]?.toUpperCase()}</span>
      }
    </div>
  )
}

function StatPill({ type, value }: { type: "upvote" | "reply"; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {type === "upvote" ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" fill="#666">
          <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM441 335C450.4 344.4 450.4 359.6 441 368.9C431.6 378.2 416.4 378.3 407.1 368.9L320.1 281.9L233.1 368.9C223.7 378.3 208.5 378.3 199.2 368.9C189.9 359.5 189.8 344.3 199.2 335L303 231C312.4 221.6 327.6 221.6 336.9 231L441 335z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" fill="#666">
          <path d="M576 304C576 436.5 461.4 544 320 544C282.9 544 247.7 536.6 215.9 523.3L97.5 574.1C88.1 578.1 77.3 575.8 70.4 568.3C63.5 560.8 62 549.8 66.8 540.8L115.6 448.6C83.2 408.3 64 358.3 64 304C64 171.5 178.6 64 320 64C461.4 64 576 171.5 576 304z"/>
        </svg>
      )}
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: "#888", fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function ModBtn({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick() }} style={{
      fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase" as const,
      background: "transparent", border: `1px solid ${color}33`,
      color, borderRadius: 3, padding: "4px 10px", cursor: "pointer",
    }}>
      {label}
    </button>
  )
}

function LoadingRows({ count, height }: { count: number; height: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height, borderRadius: 6,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(184,150,106,0.08)",
          animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  )
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#0d0d14",
  border: "1px solid rgba(184,150,106,0.25)", borderRadius: 4,
  color: "#e8e4d8", fontFamily: "'EB Garamond', serif",
  fontSize: 20, padding: "12px 14px", outline: "none", boxSizing: "border-box",
}

const primaryBtnStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase" as const,
  background: "rgba(184,150,106,0.12)", border: "1px solid rgba(184,150,106,0.4)",
  color: "#d4af7a", borderRadius: 4, padding: "9px 18px", cursor: "pointer", whiteSpace: "nowrap",
}

const ghostBtnStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase" as const,
  background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
  color: "#b0aa9e", borderRadius: 4, padding: "9px 18px", cursor: "pointer",
}

const breadcrumbBtnStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', serif", fontSize: 14, letterSpacing: "0.06em",
  color: "#b8966a", background: "transparent", border: "none", cursor: "pointer",
  padding: 0, textDecoration: "underline", textDecorationColor: "rgba(184,150,106,0.3)",
}
