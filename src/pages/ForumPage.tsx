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

interface LatestTopic {
  id: string
  title: string
  created_at: string
  author_username: string | null
  author_avatar: string | null
}

interface CategoryStats {
  topic_count: number
  latest: LatestTopic | null
}

const SECTION_ORDER = ["Strategy & Play", "Community", "Meta"]

export function ForumPage() {
  injectFonts()
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [catStatsMap, setCatStatsMap] = useState<Map<number, CategoryStats>>(new Map())
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
    const { data: cats } = await supabase
      .from("forum_categories")
      .select("*")
      .order("display_order", { ascending: true })
    if (!cats) { setLoading(false); return }
    setCategories(cats)

    // Fetch all non-deleted topics with author profile (ordered latest first)
    const { data: topics } = await supabase
      .from("forum_topics")
      .select(`id, title, created_at, category_id, author:profiles!author_id(username, avatar_url)`)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })

    const map = new Map<number, CategoryStats>()
    for (const cat of cats) {
      map.set(cat.id, { topic_count: 0, latest: null })
    }

    if (topics) {
      for (const t of topics as any[]) {
        const entry = map.get(t.category_id)
        if (!entry) continue
        entry.topic_count++
        if (!entry.latest) {
          entry.latest = {
            id: t.id,
            title: t.title,
            created_at: t.created_at,
            author_username: t.author?.username ?? null,
            author_avatar: t.author?.avatar_url ?? null,
          }
        }
      }
    }

    setCatStatsMap(map)
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
        .fcr {
          display: flex; align-items: stretch; width: 100%;
          text-align: left; background: rgba(255,255,255,0.015);
          border: none; padding: 0; cursor: pointer; color: inherit;
          transition: background 0.1s ease;
        }
        .fcr:hover { background: rgba(255,255,255,0.04); }
        .fcr + .fcr { border-top: 1px solid rgba(184,150,106,0.07); }
        .fcr-topics {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 2px;
          width: 60px; flex-shrink: 0;
          border-left: 1px solid rgba(255,255,255,0.05);
          padding: 16px 8px;
        }
        .fcr-latest {
          display: flex; flex-direction: column; justify-content: center;
          gap: 4px; width: 180px; flex-shrink: 0;
          border-left: 1px solid rgba(255,255,255,0.05);
          padding: 14px 12px;
        }
        @media (max-width: 500px) {
          .fcr-topics { width: 48px; padding: 12px 6px; }
          .fcr-latest { width: 130px; padding: 12px 10px; }
        }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
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
        <div style={{ padding: "28px 16px 60px", maxWidth: 900, margin: "0 auto", width: "100%" }}>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.3rem", fontWeight: 700, color: "#e8e4d8", letterSpacing: "0.06em" }}>
                Forum
              </div>
              <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 16, color: "#b0aa9e", marginTop: 4 }}>
                Discussion, strategy, and community
              </div>
            </div>
            {isAdmin && (
              <button onClick={handleAddCategory} style={adminBtnStyle}>
                + Add Category
              </button>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(184,150,106,0.2)", marginBottom: 28 }} />

          {loading ? (
            <LoadingRows count={7} height={76} />
          ) : categories.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 18, color: "#b0aa9e" }}>
                No categories yet.{isAdmin ? " Use the button above to add one." : ""}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
              {sectionKeys.map(section => (
                <div key={section}>

                  {/* Section header row with column labels */}
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                    <div style={{
                      fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
                      letterSpacing: "0.28em", textTransform: "uppercase",
                      color: "#6b6558", whiteSpace: "nowrap", paddingRight: 12,
                    }}>
                      {section}
                    </div>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                    <div className="fcr-topics" style={{
                      fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.22em",
                      textTransform: "uppercase", color: "#4a4540",
                      border: "none", padding: "0 8px", width: 60, justifyContent: "center",
                    }}>
                      Topics
                    </div>
                    <div className="fcr-latest" style={{
                      fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.22em",
                      textTransform: "uppercase", color: "#4a4540",
                      border: "none", padding: "0 12px", width: 180,
                    }}>
                      Latest
                    </div>
                  </div>

                  {/* Category rows grouped in a bordered block */}
                  <div style={{
                    borderRadius: 8,
                    border: "1px solid rgba(184,150,106,0.12)",
                    overflow: "hidden",
                  }}>
                    {grouped.get(section)!.map(cat => {
                      const stats = catStatsMap.get(cat.id)
                      const latest = stats?.latest ?? null
                      const topicCount = stats?.topic_count ?? 0

                      return (
                        <button key={cat.id} className="fcr" onClick={() => navigate(`/forum/${cat.slug}`)}>

                          {/* Left color bar */}
                          <div style={{ width: 4, alignSelf: "stretch", background: cat.color, opacity: 0.65, flexShrink: 0 }} />

                          {/* Category info */}
                          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, padding: "16px 18px 16px 14px", minWidth: 0 }}>
                            <div style={{
                              width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                              background: `${cat.color}18`, border: `1px solid ${cat.color}35`,
                              display: "grid", placeItems: "center",
                            }}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="19" height="19" fill={cat.color}>
                                <path d="M576 304C576 436.5 461.4 544 320 544C282.9 544 247.7 536.6 215.9 523.3L97.5 574.1C88.1 578.1 77.3 575.8 70.4 568.3C63.5 560.8 62 549.8 66.8 540.8L115.6 448.6C83.2 408.3 64 358.3 64 304C64 171.5 178.6 64 320 64C461.4 64 576 171.5 576 304z"/>
                              </svg>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{
                                fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 700,
                                color: "#e8e4d8", letterSpacing: "0.03em",
                                marginBottom: cat.description ? 4 : 0,
                              }}>
                                {cat.name}
                              </div>
                              {cat.description && (
                                <div style={{
                                  fontFamily: "'EB Garamond', serif", fontSize: 15,
                                  color: "#6b6558", overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {cat.description}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Topic count */}
                          <div className="fcr-topics">
                            <span style={{
                              fontFamily: "'Cinzel', serif", fontSize: 18, fontWeight: 700,
                              color: topicCount > 0 ? "#b0aa9e" : "#3a3830",
                            }}>
                              {topicCount}
                            </span>
                          </div>

                          {/* Latest */}
                          <div className="fcr-latest">
                            {latest ? (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <MiniAvatar username={latest.author_username ?? "?"} avatarUrl={latest.author_avatar} />
                                  <span style={{
                                    fontFamily: "'Cinzel', serif", fontSize: 12, color: "#b8966a",
                                    fontWeight: 600, letterSpacing: "0.03em",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {latest.author_username ?? "Unknown"}
                                  </span>
                                </div>
                                <div style={{
                                  fontFamily: "'EB Garamond', serif", fontSize: 14,
                                  color: "#7a7468", overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {latest.title}
                                </div>
                                <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: "#4a4540" }}>
                                  {timeAgo(latest.created_at)}
                                </div>
                              </>
                            ) : (
                              <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#3a3830", fontStyle: "italic" }}>
                                No posts yet
                              </span>
                            )}
                          </div>

                        </button>
                      )
                    })}
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniAvatar({ username, avatarUrl }: { username: string; avatarUrl?: string | null }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
      background: "#13131a", border: "1px solid rgba(184,150,106,0.2)",
      display: "grid", placeItems: "center",
      fontSize: 10, fontWeight: 800, color: "#e8e4d8", overflow: "hidden",
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
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
