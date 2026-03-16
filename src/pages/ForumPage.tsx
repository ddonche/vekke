// src/pages/ForumPage.tsx
import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
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
  display_order: number
  color: string
  section: string
}

interface FeedEntry {
  topic_id: string
  topic_title: string
  topic_slug: string
  category_id: number
  category_name: string
  category_slug: string
  category_color: string
  reply_count: number
  upvote_count: number
  created_at: string
  // OP author
  author_username: string | null
  author_avatar: string | null
  // Latest activity
  last_activity_at: string
  latest_username: string | null
  latest_avatar: string | null
  latest_is_reply: boolean // false = the OP is the latest activity
}

const SECTION_ORDER = ["Strategy & Play", "Community", "Meta"]

export function ForumPage() {
  injectFonts()
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [catCountMap, setCatCountMap] = useState<Map<number, number>>(new Map())
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [loading, setLoading] = useState(true)

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

  async function loadData() {
    // 1. Categories for sidebar
    const { data: cats } = await supabase
      .from("forum_categories")
      .select("*")
      .order("display_order", { ascending: true })
    if (!cats) { setLoading(false); return }
    setCategories(cats)

    // 2. All topics (for counts + feed base), joined with category + author
    const { data: topics } = await supabase
      .from("forum_topics")
      .select(`
        id, title, slug, reply_count, upvote_count, created_at, last_reply_at, category_id,
        author:profiles!author_id(username, avatar_url),
        category:forum_categories!category_id(id, name, slug, color)
      `)
      .eq("is_deleted", false)
      .order("last_reply_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(60)

    // 3. Category topic counts (separate lightweight query)
    const { data: allTopicIds } = await supabase
      .from("forum_topics")
      .select("id, category_id")
      .eq("is_deleted", false)

    const countMap = new Map<number, number>()
    for (const cat of cats) countMap.set(cat.id, 0)
    for (const t of (allTopicIds ?? []) as any[]) {
      const prev = countMap.get(t.category_id) ?? 0
      countMap.set(t.category_id, prev + 1)
    }
    setCatCountMap(countMap)

    if (!topics || topics.length === 0) { setLoading(false); return }

    // 4. Latest replies for these topics — to get reply author info
    const topicIds = (topics as any[]).map(t => t.id)
    const { data: replies } = await supabase
      .from("forum_replies")
      .select(`topic_id, created_at, author:profiles!author_id(username, avatar_url)`)
      .eq("is_deleted", false)
      .in("topic_id", topicIds)
      .order("created_at", { ascending: false })
      .limit(300)

    // Build map: topic_id -> latest reply
    const latestReplyMap = new Map<string, { username: string | null; avatar: string | null; created_at: string }>()
    for (const r of (replies ?? []) as any[]) {
      if (!latestReplyMap.has(r.topic_id)) {
        latestReplyMap.set(r.topic_id, {
          username: r.author?.username ?? null,
          avatar: r.author?.avatar_url ?? null,
          created_at: r.created_at,
        })
      }
    }

    // 5. Assemble feed entries
    const entries: FeedEntry[] = (topics as any[]).map(t => {
      const latestReply = latestReplyMap.get(t.id)
      const cat = t.category as any
      const lastActivityAt = t.last_reply_at ?? t.created_at

      return {
        topic_id: t.id,
        topic_title: t.title,
        topic_slug: t.slug,
        category_id: cat?.id ?? t.category_id,
        category_name: cat?.name ?? "Unknown",
        category_slug: cat?.slug ?? "",
        category_color: cat?.color ?? "#888",
        reply_count: t.reply_count ?? 0,
        upvote_count: t.upvote_count ?? 0,
        created_at: t.created_at,
        author_username: t.author?.username ?? null,
        author_avatar: t.author?.avatar_url ?? null,
        last_activity_at: lastActivityAt,
        latest_username: latestReply ? latestReply.username : (t.author?.username ?? null),
        latest_avatar: latestReply ? latestReply.avatar : (t.author?.avatar_url ?? null),
        latest_is_reply: !!latestReply,
      }
    })

    setFeed(entries)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function handleAddCategory() {
    const name = window.prompt("Category name:")
    if (!name?.trim()) return
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const description = window.prompt("Description (optional):") || null
    await supabase.from("forum_categories").insert({
      name: name.trim(), slug, description, display_order: categories.length,
    })
    loadData()
  }

  // Group categories for sidebar sections
  const grouped = new Map<string, Category[]>()
  for (const cat of categories) {
    const s = cat.section ?? "General"
    if (!grouped.has(s)) grouped.set(s, [])
    grouped.get(s)!.push(cat)
  }
  const sectionKeys = [
    ...SECTION_ORDER.filter(s => grouped.has(s)),
    ...[...grouped.keys()].filter(s => !SECTION_ORDER.includes(s)).sort(),
  ]

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
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        .feed-row {
          display: flex; align-items: stretch; width: 100%;
          background: rgba(255,255,255,0.018);
          border: 1px solid rgba(184,150,106,0.09);
          border-radius: 6px; overflow: hidden; cursor: pointer;
          text-align: left; color: inherit; padding: 0;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .feed-row:hover { background: rgba(255,255,255,0.04); border-color: rgba(184,150,106,0.18); }
        .sidebar-cat-btn {
          display: flex; align-items: center; gap: 9px; width: 100%;
          background: transparent; border: none; padding: 7px 10px;
          cursor: pointer; color: inherit; border-radius: 5px;
          transition: background 0.1s ease;
        }
        .sidebar-cat-btn:hover { background: rgba(255,255,255,0.04); }
        @media (max-width: 680px) {
          .forum-sidebar { display: none !important; }
          .forum-feed-area { max-width: 100% !important; }
        }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel="Forum"
        elo={undefined}
        activePage="forum"
        myGamesTurnCount={0}
      />

      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "28px 16px 60px", maxWidth: 1060, margin: "0 auto", width: "100%", display: "flex", gap: 28, alignItems: "flex-start" }}>

          {/* ── Main feed ── */}
          <div className="forum-feed-area" style={{ flex: 1, minWidth: 0 }}>

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.3rem", fontWeight: 700, color: "#e8e4d8", letterSpacing: "0.06em" }}>
                  Forum
                </div>
                <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 16, color: "#b0aa9e", marginTop: 4 }}>
                  Latest activity across all categories
                </div>
              </div>
              {isAdmin && (
                <button onClick={handleAddCategory} style={adminBtnStyle}>
                  + Add Category
                </button>
              )}
            </div>

            <div style={{ height: 1, background: "rgba(184,150,106,0.2)", marginBottom: 22 }} />

            {loading ? (
              <LoadingRows count={8} height={72} />
            ) : feed.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 18, color: "#b0aa9e" }}>
                  No posts yet.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {feed.map(entry => (
                  <button
                    key={entry.topic_id}
                    className="feed-row"
                    onClick={() => navigate(`/forum/${entry.category_slug}/${entry.topic_id}`)}
                  >
                    {/* Category color bar */}
                    <div style={{ width: 4, alignSelf: "stretch", background: entry.category_color, opacity: 0.7, flexShrink: 0 }} />

                    {/* Main content */}
                    <div style={{ flex: 1, minWidth: 0, padding: "12px 14px 11px" }}>
                      {/* Title */}
                      <div style={{
                        fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700,
                        color: "#e8e4d8", letterSpacing: "0.03em",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 7,
                      }}>
                        {entry.topic_title}
                      </div>
                      {/* Meta row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {/* OP author */}
                        <MiniAvatar username={entry.author_username ?? "?"} avatarUrl={entry.author_avatar} />
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: "#b8966a", fontWeight: 600 }}>
                          {entry.author_username ?? "Unknown"}
                        </span>
                        <span style={{ color: "#3a3830", fontSize: 13 }}>·</span>
                        {/* Category pill */}
                        <CategoryPill name={entry.category_name} color={entry.category_color} />
                        <span style={{ color: "#3a3830", fontSize: 13 }}>·</span>
                        {/* Latest reply info */}
                        {entry.latest_is_reply ? (
                          <>
                            <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#555", fontStyle: "italic" }}>
                              last reply by
                            </span>
                            <MiniAvatar username={entry.latest_username ?? "?"} avatarUrl={entry.latest_avatar} />
                            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: "#7a7060", fontWeight: 600 }}>
                              {entry.latest_username ?? "Unknown"}
                            </span>
                            <span style={{ color: "#3a3830", fontSize: 13 }}>·</span>
                          </>
                        ) : null}
                        <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#4a4540" }}>
                          {timeAgo(entry.last_activity_at)}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 6, padding: "12px 16px", flexShrink: 0,
                      borderLeft: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13" fill="#555">
                          <path d="M576 304C576 436.5 461.4 544 320 544C282.9 544 247.7 536.6 215.9 523.3L97.5 574.1C88.1 578.1 77.3 575.8 70.4 568.3C63.5 560.8 62 549.8 66.8 540.8L115.6 448.6C83.2 408.3 64 358.3 64 304C64 171.5 178.6 64 320 64C461.4 64 576 171.5 576 304z"/>
                        </svg>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: entry.reply_count > 0 ? "#888" : "#3a3830", fontWeight: 600 }}>
                          {entry.reply_count}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="13" height="13" fill="#555">
                          <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM441 335C450.4 344.4 450.4 359.6 441 368.9C431.6 378.2 416.4 378.3 407.1 368.9L320.1 281.9L233.1 368.9C223.7 378.3 208.5 378.3 199.2 368.9C189.9 359.5 189.8 344.3 199.2 335L303 231C312.4 221.6 327.6 221.6 336.9 231L441 335z"/>
                        </svg>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: entry.upvote_count > 0 ? "#888" : "#3a3830", fontWeight: 600 }}>
                          {entry.upvote_count}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="forum-sidebar" style={{ width: 220, flexShrink: 0, paddingTop: 62 }}>
            <div style={{
              background: "rgba(255,255,255,0.015)",
              border: "1px solid rgba(184,150,106,0.12)",
              borderRadius: 8, overflow: "hidden",
            }}>
              {/* Sidebar header */}
              <div style={{
                padding: "11px 14px 10px",
                borderBottom: "1px solid rgba(184,150,106,0.1)",
                fontFamily: "'Cinzel', serif", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.26em", textTransform: "uppercase", color: "#6b6558",
              }}>
                Categories
              </div>

              {/* Category list */}
              <div style={{ padding: "6px 6px" }}>
                {sectionKeys.map((section, si) => (
                  <div key={section}>
                    {/* Section label (only if more than one section) */}
                    {sectionKeys.length > 1 && (
                      <div style={{
                        fontFamily: "'Cinzel', serif", fontSize: 9, fontWeight: 700,
                        letterSpacing: "0.22em", textTransform: "uppercase",
                        color: "#3a3830", padding: "8px 6px 4px",
                        marginTop: si > 0 ? 4 : 0,
                      }}>
                        {section}
                      </div>
                    )}
                    {(grouped.get(section) ?? []).map(cat => {
                      const count = catCountMap.get(cat.id) ?? 0
                      return (
                        <button
                          key={cat.id}
                          className="sidebar-cat-btn"
                          onClick={() => navigate(`/forum/${cat.slug}`)}
                        >
                          {/* Color dot */}
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0, opacity: 0.8 }} />
                          {/* Name */}
                          <span style={{
                            fontFamily: "'EB Garamond', serif", fontSize: 15,
                            color: "#b0aa9e", flex: 1, textAlign: "left",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {cat.name}
                          </span>
                          {/* Count */}
                          <span style={{
                            fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
                            color: count > 0 ? "#4a4540" : "#2a2820",
                          }}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategoryPill({ name, color }: { name: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 7px", borderRadius: 999,
      border: `1px solid ${color}30`,
      background: `${color}12`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, opacity: 0.85 }} />
      <span style={{
        fontFamily: "'Cinzel', serif", fontSize: 10, fontWeight: 700,
        letterSpacing: "0.1em", textTransform: "uppercase", color,
        opacity: 0.85, whiteSpace: "nowrap",
      }}>
        {name}
      </span>
    </span>
  )
}

function MiniAvatar({ username, avatarUrl }: { username: string; avatarUrl?: string | null }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
      background: "#13131a", border: "1px solid rgba(184,150,106,0.2)",
      display: "grid", placeItems: "center",
      fontSize: 9, fontWeight: 800, color: "#e8e4d8", overflow: "hidden",
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span>{(username ?? "?")[0]?.toUpperCase()}</span>
      }
    </div>
  )
}

function LoadingRows({ count, height }: { count: number; height: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height, borderRadius: 6,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(184,150,106,0.08)",
          animation: "pulse 1.5s ease-in-out infinite",
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  )
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

const adminBtnStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase" as const,
  background: "transparent", border: "1px solid rgba(93,232,247,0.35)",
  color: "#5de8f7", borderRadius: 4, padding: "9px 18px",
  cursor: "pointer", whiteSpace: "nowrap",
}
