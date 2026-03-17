// src/pages/CategoryPage.tsx
import React, { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"
import { ForumImageUploader } from "../components/ForumImageUploader"

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
  slug: string
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
  last_replier_avatar: string | null
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
  const [newImages, setNewImages] = useState<string[]>([])
  const newImagesRef = useRef<string[]>([])

  function updateNewImages(urls: string[]) {
    newImagesRef.current = urls
    setNewImages(urls)
  }
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [movingTopicId, setMovingTopicId] = useState<string | null>(null)
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [role, setRole] = useState<string | null>(null)

  const isMod = role === 'admin' || role === 'mod'

  

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const uid = data.session.user.id
      setUserId(uid)
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url, role")
        .eq("id", uid)
        .single()
      if (profile) {
        setMe(profile as any)
        setRole((profile as any).role ?? null)
      }
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

    const { data: topicData } = await supabase
      .from("forum_topics")
      .select(`
        id, slug, title, is_pinned, is_locked, reply_count, upvote_count,
        last_reply_at, created_at, author_id,
        author:profiles!author_id(username, avatar_url, country_code, account_tier)
      `)
      .eq("category_id", cat.id)
      .order("is_pinned", { ascending: false })

    if (!topicData) { setLoading(false); return }

    const authorIds = [...new Set((topicData as any[]).map((t: any) => t.author_id))]

    // player_stats_agg is row-per-format — fetch all format rows then pivot
    const { data: aggRows } = await supabase
      .from("player_stats_agg")
      .select("user_id, format, elo")
      .in("user_id", authorIds)
      .in("format", ["standard", "rapid", "blitz", "daily"])
      .eq("scope", "season")

    const statsMap = new Map<string, { elo_standard: number; elo_rapid: number; elo_blitz: number; elo_daily: number }>()
    for (const row of (aggRows ?? []) as any[]) {
      if (!statsMap.has(row.user_id)) {
        statsMap.set(row.user_id, { elo_standard: 0, elo_rapid: 0, elo_blitz: 0, elo_daily: 0 })
      }
      const entry = statsMap.get(row.user_id)!
      if (row.format === "standard") entry.elo_standard = row.elo ?? 0
      else if (row.format === "rapid")    entry.elo_rapid   = row.elo ?? 0
      else if (row.format === "blitz")    entry.elo_blitz   = row.elo ?? 0
      else if (row.format === "daily")    entry.elo_daily   = row.elo ?? 0
    }

    const mapped = (topicData as any[]).map((t: any) => ({
      ...t,
      author_stats: statsMap.get(t.author_id) ?? null,
      last_replier_avatar: null,
    })) as unknown as Topic[]

    // Fetch latest reply author avatar per topic
    const topicIds = mapped.map(t => t.id)
    if (topicIds.length > 0) {
      const { data: replyData } = await supabase
        .from("forum_replies")
        .select("topic_id, created_at, author:profiles!author_id(avatar_url)")
        .in("topic_id", topicIds)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(200)

      const latestAvatarMap = new Map<string, string | null>()
      for (const r of (replyData ?? []) as any[]) {
        if (!latestAvatarMap.has(r.topic_id)) {
          latestAvatarMap.set(r.topic_id, r.author?.avatar_url ?? null)
        }
      }
      for (const t of mapped) {
        t.last_replier_avatar = latestAvatarMap.get(t.id) ?? null
      }
    }

    mapped.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      const aTime = new Date(a.last_reply_at ?? a.created_at).getTime()
      const bTime = new Date(b.last_reply_at ?? b.created_at).getTime()
      return bTime - aTime
    })

    setTopics(mapped)
    setLoading(false)
  }, [categorySlug])

  useEffect(() => { loadTopics() }, [loadTopics])

  async function handleSubmitTopic() {
    if (!newTitle.trim() || !newBody.trim() || !userId || !category) return
    setSubmitting(true)
    setFormError(null)

    const baseSlug = newTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "topic"

    let slug = baseSlug
    let suffix = 2

    for (;;) {
      const { data: existing, error: slugCheckError } = await supabase
        .from("forum_topics")
        .select("id")
        .eq("slug", slug)
        .maybeSingle()

      if (slugCheckError) {
        setFormError("Failed to check topic slug. Please try again.")
        setSubmitting(false)
        return
      }

      if (!existing) break

      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }

    const { error } = await supabase.from("forum_topics").insert({
      category_id: category.id,
      author_id: userId,
      title: newTitle.trim(),
      slug,
      body: newBody.trim(),
      images: newImagesRef.current,
    })

    if (error) {
      setFormError("Failed to post. Please try again.")
      setSubmitting(false)
      return
    }

    setNewTitle("")
    setNewBody("")
    updateNewImages([])
    setShowForm(false)
    setSubmitting(false)
    loadTopics()
  }

  async function handleMove(topic: Topic, newCategoryId: number) {
    await supabase.from("forum_topics").update({ category_id: newCategoryId }).eq("id", topic.id)
    setMovingTopicId(null)
    loadTopics()
  }

  async function openMove(topic: Topic) {
    if (allCategories.length === 0) {
      const { data } = await supabase.from("forum_categories").select("*").order("display_order", { ascending: true })
      setAllCategories((data as Category[]) ?? [])
    }
    setMovingTopicId(topic.id)
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
    await supabase.from("forum_replies").delete().eq("topic_id", topic.id)
    await supabase.from("forum_topics").delete().eq("id", topic.id)
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
        .forum-topic-row { transition: background 0.12s ease; }
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
              {userId && (
                <ForumImageUploader
                  userId={userId}
                  images={newImages}
                  onChange={updateNewImages}
                />
              )}
              {formError && <p style={{ color: "#ee484c", fontFamily: "'EB Garamond', serif", fontSize: 14, margin: "8px 0 0" }}>{formError}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  onClick={handleSubmitTopic}
                  disabled={submitting || !newTitle.trim() || !newBody.trim()}
                  style={{ ...primaryBtnStyle, opacity: submitting || !newTitle.trim() || !newBody.trim() ? 0.5 : 1 }}
                >
                  {submitting ? "Posting…" : "Post Topic"}
                </button>
                <button onClick={() => { setShowForm(false); setFormError(null); updateNewImages([]) }} style={ghostBtnStyle}>Cancel</button>
              </div>
            </div>
          )}

          {/* Topic list */}
          {loading ? (
            <LoadingRows count={4} height={58} />
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
                const activityTime = topic.last_reply_at ?? topic.created_at

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
                      onClick={() => navigate(`/forum/${categorySlug}/${topic.slug}`)}
                      style={{
                        display: "flex", flexDirection: "column", gap: 8,
                        width: "100%", textAlign: "left", background: "transparent",
                        border: "none", padding: "14px 16px", cursor: "pointer", color: "inherit",
                      }}
                    >
                      {/* ── Row 1: title + pin/lock + stats ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", minWidth: 0 }}>

                        {/* Pin / lock icons — inline, only when set */}
                        {topic.is_pinned && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#5de8f7" style={{ flexShrink: 0 }} title="Pinned">
                            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                          </svg>
                        )}
                        {topic.is_locked && (
                          <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }} title="Locked">
                            <rect x="3" y="11" width="18" height="11" rx="2" fill="#b8966a" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="#b8966a" strokeWidth="2" />
                          </svg>
                        )}

                        {/* Title — takes all remaining space, truncates */}
                        <span style={{
                          fontFamily: "'EB Garamond', serif", fontSize: 22, fontWeight: 500,
                          color: "#9c9581", letterSpacing: "0.03em",
                          flex: 1, minWidth: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {topic.title}
                        </span>

                        {/* Stats — right-aligned, never shrink */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <MiniStat icon="reply" value={topic.reply_count} />
                          <MiniStat icon="upvote" value={topic.upvote_count} />
                        </div>
                      </div>

                      {/* ── Row 2: author + badges + timeAgo ── */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        overflow: "hidden", flexWrap: "nowrap",
                      }}>
                        <PostAvatar username={topic.author.username} avatarUrl={topic.author.avatar_url} size={28} />
                        <span style={{
                          fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 600,
                          color: "#b8966a", letterSpacing: "0.03em",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: 160, flexShrink: 1,
                        }}>
                          {topic.author.username}
                        </span>

                        {topic.author.country_code && (
                          <img
                            src={`https://flagicons.lipis.dev/flags/4x3/${topic.author.country_code.toLowerCase()}.svg`}
                            width={18} height={14} alt={topic.author.country_code}
                            style={{ borderRadius: 2, flexShrink: 0 }}
                            onError={(e) => { e.currentTarget.style.display = "none" }}
                          />
                        )}

                        {peakElo !== null && (
                          <span style={{
                            fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 700,
                            color: eloColor(peakElo), flexShrink: 0,
                          }} title={eloTitle(peakElo)}>
                            {peakElo}
                          </span>
                        )}

                        {topic.author.account_tier === "pro" && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "2px 8px", borderRadius: 999,
                            border: "1px solid rgba(212,175,122,0.3)",
                            background: "rgba(212,175,122,0.07)",
                            color: "#d4af7a", fontFamily: "'Cinzel', serif",
                            fontSize: 12, letterSpacing: "0.16em",
                            textTransform: "uppercase" as const, fontWeight: 700,
                            whiteSpace: "nowrap", flexShrink: 0,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#d4af7a", flexShrink: 0 }} />
                            Pro
                          </span>
                        )}

                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span style={{
                            fontFamily: "'EB Garamond', serif", fontSize: 16,
                            color: "#4a4540", whiteSpace: "nowrap",
                          }}>
                            {topic.last_reply_at ? "last reply " : ""}{timeAgo(activityTime)}
                          </span>
                          {topic.last_reply_at && (
                            <PostAvatar username="?" avatarUrl={topic.last_replier_avatar} size={24} />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Mod controls */}
                    {isMod && (
                      <div style={{ display: "flex", gap: 8, padding: "6px 14px 10px", borderTop: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap", alignItems: "center" }}>
                        <ModBtn onClick={() => handlePin(topic)} label={topic.is_pinned ? "Unpin" : "Pin"} color="#5de8f7" />
                        <ModBtn onClick={() => handleLock(topic)} label={topic.is_locked ? "Unlock" : "Lock"} color="#b8966a" />
                        <ModBtn onClick={() => handleDelete(topic)} label="Delete" color="#ee484c" />
                        {movingTopicId === topic.id ? (
                          <select
                            autoFocus
                            defaultValue=""
                            onChange={(e) => { if (e.target.value) handleMove(topic, Number(e.target.value)) }}
                            onBlur={() => setMovingTopicId(null)}
                            style={{
                              fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
                              letterSpacing: "0.08em", background: "#13131a",
                              border: "1px solid rgba(93,232,247,0.35)", color: "#5de8f7",
                              borderRadius: 3, padding: "4px 8px", cursor: "pointer", outline: "none",
                            }}
                          >
                            <option value="" disabled>Move to…</option>
                            {allCategories.filter(c => c.id !== category?.id).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        ) : (
                          <ModBtn onClick={() => openMove(topic)} label="Move" color="#5de8f7" />
                        )}
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function MiniStat({ icon, value }: { icon: "reply" | "upvote"; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {icon === "reply" ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="17" height="17" fill="#555">
          <path d="M576 304C576 436.5 461.4 544 320 544C282.9 544 247.7 536.6 215.9 523.3L97.5 574.1C88.1 578.1 77.3 575.8 70.4 568.3C63.5 560.8 62 549.8 66.8 540.8L115.6 448.6C83.2 408.3 64 358.3 64 304C64 171.5 178.6 64 320 64C461.4 64 576 171.5 576 304z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="17" height="17" fill="#555">
          <path d="M305 151.1L320 171.8L335 151.1C360 116.5 400.2 96 442.9 96C516.4 96 576 155.6 576 229.1L576 231.7C576 343.9 436.1 474.2 363.1 529.9C350.7 539.3 335.5 544 320 544C304.5 544 289.2 539.4 276.9 529.9C203.9 474.2 64 343.9 64 231.7L64 229.1C64 155.6 123.6 96 197.1 96C239.8 96 280 116.5 305 151.1z"/>
        </svg>
      )}
      <span style={{
        fontFamily: "'Cinzel', serif", fontSize: 16,
        color: value > 0 ? "#666" : "#333", fontWeight: 600,
      }}>
        {value}
      </span>
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

function eloColor(elo: number): string {
  if (elo >= 2000) return "#D4AF37"
  if (elo >= 1750) return "#7c2d12"
  if (elo >= 1500) return "#16a34a"
  if (elo >= 1200) return "#dc2626"
  if (elo >= 900)  return "#2563eb"
  return "#6b6558"
}

function eloTitle(elo: number): string {
  if (elo >= 2000) return "Grandmaster"
  if (elo >= 1750) return "Senior Master"
  if (elo >= 1500) return "Master"
  if (elo >= 1200) return "Expert"
  if (elo >= 900)  return "Adept"
  return "Novice"
}

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
