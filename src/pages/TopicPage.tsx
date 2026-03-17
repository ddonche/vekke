// src/pages/TopicPage.tsx
import React, { useEffect, useState, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"
import { ForumImageUploader, ImageGrid } from "../components/ForumImageUploader"

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

interface PostAuthor {
  username: string
  avatar_url: string | null
  country_code: string | null
  account_tier: string | null
  forum_signature: string | null
  order_icon_url: string | null
}

interface PostStats {
  elo_blitz: number
  elo_rapid: number
  elo_standard: number
  elo_daily: number
}

interface Topic {
  id: string
  category_id: number
  author_id: string
  title: string
  body: string
  images: string[]
  is_pinned: boolean
  is_locked: boolean
  reply_count: number
  upvote_count: number
  created_at: string
  updated_at: string | null
  mod_note: string | null
  author: PostAuthor
  author_stats: PostStats | null
}

interface Reply {
  id: string
  author_id: string
  body: string
  images: string[]
  upvote_count: number
  created_at: string
  updated_at: string | null
  mod_note: string | null
  author: PostAuthor
  author_stats: PostStats | null
}

export function TopicPage() {
  injectFonts()
  const { categorySlug, topicId } = useParams<{ categorySlug: string; topicId: string }>()
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [topic, setTopic] = useState<Topic | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryColor, setCategoryColor] = useState<string>("#b8966a")
  const [replyBody, setReplyBody] = useState("")
  const [replyImages, setReplyImages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set())
  const [showMoveSelect, setShowMoveSelect] = useState(false)
  const [allCategories, setAllCategories] = useState<{ id: number; name: string; slug: string }[]>([])

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

  const loadData = useCallback(async () => {
    if (!topicId) return

    // Step 1: topic + replies with profiles only (no player_stats FK path)
    const [{ data: topicData }, { data: replyData }] = await Promise.all([
      supabase
        .from("forum_topics")
        .select(`
          id, category_id, author_id, title, body, images, is_pinned, is_locked,
          reply_count, upvote_count, created_at, updated_at, mod_note,
          author:profiles!forum_topics_author_id_fkey(username, avatar_url, country_code, account_tier, forum_signature)
        `)
        .eq("id", topicId)
        .single(),
      supabase
        .from("forum_replies")
        .select(`
          id, author_id, body, images, upvote_count, created_at, updated_at, mod_note,
          author:profiles!forum_replies_author_id_fkey(username, avatar_url, country_code, account_tier, forum_signature)
        `)
        .eq("topic_id", topicId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true }),
    ])

    // Step 2: fetch player_stats_agg for all unique authors (row-per-format — pivot needed)
    const authorIds = [...new Set([
      topicData ? (topicData as any).author_id : null,
      ...((replyData ?? []) as any[]).map((r: any) => r.author_id),
    ].filter(Boolean))]

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

    // Step 3: fetch order icons for all authors
    const { data: membershipData } = await supabase
      .from("order_memberships")
      .select("user_id, order_id, joined_at, left_at")
      .in("user_id", authorIds)
      .is("left_at", null)
      .order("joined_at", { ascending: false })

    const latestMembershipByUser = new Map<string, string>()
    for (const m of (membershipData ?? []) as any[]) {
      if (!latestMembershipByUser.has(m.user_id)) {
        latestMembershipByUser.set(m.user_id, m.order_id)
      }
    }

    const orderIds = Array.from(new Set(Array.from(latestMembershipByUser.values()).filter(Boolean)))
    const orderIconMap = new Map<string, string | null>()
    if (orderIds.length > 0) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("id, icon_url")
        .in("id", orderIds)
      for (const o of (orderData ?? []) as any[]) {
        orderIconMap.set(o.id, o.icon_url ?? null)
      }
    }

    function resolveOrderIcon(userId: string): string | null {
      const orderId = latestMembershipByUser.get(userId)
      return orderId ? (orderIconMap.get(orderId) ?? null) : null
    }

    if (topicData) {
      const td = topicData as any
      setTopic({
        ...td,
        author: { ...td.author, order_icon_url: resolveOrderIcon(td.author_id) },
        author_stats: statsMap.get(td.author_id) ?? null,
      } as unknown as Topic)
      supabase.from("forum_categories").select("color").eq("id", td.category_id).single()
        .then(({ data: cat }) => { if (cat?.color) setCategoryColor(cat.color) })
    }

    if (replyData) {
      setReplies((replyData as any[]).map((r: any) => ({
        ...r,
        author: { ...r.author, order_icon_url: resolveOrderIcon(r.author_id) },
        author_stats: statsMap.get(r.author_id) ?? null,
      })) as unknown as Reply[])
    }

    setLoading(false)
  }, [topicId])

  useEffect(() => { loadData() }, [loadData])

  // Load user's existing upvotes
  useEffect(() => {
    if (!userId || !topicId) return
    supabase
      .from("forum_upvotes")
      .select("target_id")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) setUpvotedIds(new Set(data.map((r: any) => r.target_id)))
      })
  }, [userId, topicId])

  async function handleUpvote(targetType: "topic" | "reply", targetId: string) {
    if (!userId) return
    const alreadyVoted = upvotedIds.has(targetId)
    setUpvotedIds((prev) => {
      const next = new Set(prev)
      alreadyVoted ? next.delete(targetId) : next.add(targetId)
      return next
    })
    if (targetType === "topic") {
      setTopic((t) => t ? { ...t, upvote_count: t.upvote_count + (alreadyVoted ? -1 : 1) } : t)
    } else {
      setReplies((rs) => rs.map((r) => r.id === targetId ? { ...r, upvote_count: r.upvote_count + (alreadyVoted ? -1 : 1) } : r))
    }
    if (alreadyVoted) {
      await supabase.from("forum_upvotes").delete().eq("user_id", userId).eq("target_type", targetType).eq("target_id", targetId)
    } else {
      await supabase.from("forum_upvotes").insert({ user_id: userId, target_type: targetType, target_id: targetId })
    }
  }

  async function handleSubmitReply() {
    if (!replyBody.trim() || !userId || !topicId) return
    setSubmitting(true); setReplyError(null)
    const { error } = await supabase.from("forum_replies").insert({
      topic_id: topicId, author_id: userId,
      body: replyBody.trim(), images: replyImages,
    })
    if (error) { console.error("Insert error:", error); setReplyError("Failed to post: " + error.message); setSubmitting(false); return }
    await supabase.from("forum_topics").update({ last_reply_at: new Date().toISOString(), reply_count: (topic?.reply_count ?? 0) + 1 }).eq("id", topicId)
    setReplyBody(""); setReplyImages([]); setSubmitting(false); loadData()
  }

  async function openMove() {
    if (allCategories.length === 0) {
      const { data } = await supabase.from("forum_categories").select("id, name, slug").order("display_order", { ascending: true })
      setAllCategories((data as any[]) ?? [])
    }
    setShowMoveSelect(true)
  }

  async function handleMove(newCategoryId: number) {
    if (!topic) return
    const newCat = allCategories.find(c => c.id === newCategoryId)
    await supabase.from("forum_topics").update({ category_id: newCategoryId }).eq("id", topic.id)
    setShowMoveSelect(false)
    if (newCat) navigate(`/forum/${newCat.slug}/${topic.id}`)
  }

  async function handlePin() {
    await supabase.from("forum_topics").update({ is_pinned: !topic.is_pinned }).eq("id", topic.id)
    loadData()
  }

  async function handleLock() {
    if (!topic) return
    await supabase.from("forum_topics").update({ is_locked: !topic.is_locked }).eq("id", topic.id)
    loadData()
  }

  async function handleDeleteTopic() {
    if (!topic || !window.confirm("Delete this topic and all its replies?")) return
    await supabase.from("forum_topics").update({ is_deleted: true }).eq("id", topic.id)
    navigate(`/forum/${categorySlug}`)
  }

  async function handleDeleteReply(reply: Reply) {
    if (!window.confirm("Delete this reply?")) return
    await supabase.from("forum_replies").update({ is_deleted: true }).eq("id", reply.id)
    await supabase.from("forum_topics").update({ reply_count: Math.max(0, (topic?.reply_count ?? 1) - 1) }).eq("id", topicId)
    loadData()
  }

  async function handleEditTopic(newBody: string, newImages: string[], newModNote: string | null) {
    console.log("[handleEditTopic] called, body:", newBody.slice(0, 20), "images:", newImages)
    if (!topic) return
    await supabase.from("forum_topics").update({ body: newBody, images: newImages, mod_note: newModNote }).eq("id", topic.id)
    loadData()
  }

  async function handleEditReply(replyId: string, newBody: string, newImages: string[], newModNote: string | null) {
    await supabase.from("forum_replies").update({ body: newBody, images: newImages, mod_note: newModNote }).eq("id", replyId)
    loadData()
  }

  const topicPeakElo = topic?.author_stats
    ? Math.max(topic.author_stats.elo_blitz, topic.author_stats.elo_rapid, topic.author_stats.elo_standard, topic.author_stats.elo_daily)
    : null

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
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel={topic?.title ?? "Forum"}
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
            <button onClick={() => navigate(`/forum/${categorySlug}`)} style={{ ...breadcrumbBtnStyle, color: categoryColor, textDecorationColor: `${categoryColor}50` }}>{categorySlug}</button>
            <span style={{ color: "#555", fontSize: 14 }}>/</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: "#b0aa9e", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
              {topic?.title ?? "…"}
            </span>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[120, 200, 160].map((h, i) => (
                <div key={i} style={{ height: h, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(184,150,106,0.08)", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          ) : !topic ? (
            <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 18, color: "#b0aa9e" }}>Topic not found.</p>
          ) : (
            <>
              {/* Title + badges */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                  <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: 26, fontWeight: 700, color: "#9c9581", letterSpacing: "0.06em", margin: 0, flex: 1 }}>
                    {topic.title}
                  </h1>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, paddingTop: 4 }}>
                    {topic.is_pinned && <Badge label="Pinned" color="#5de8f7" />}
                    {topic.is_locked && <Badge label="Locked" color="#b8966a" />}
                  </div>
                </div>
                {isMod && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <ModBtn onClick={handlePin} label={topic.is_pinned ? "Unpin" : "Pin"} color="#5de8f7" />
                    <ModBtn onClick={handleLock} label={topic.is_locked ? "Unlock" : "Lock"} color="#b8966a" />
                    <ModBtn onClick={handleDeleteTopic} label="Delete Topic" color="#ee484c" />
                    {showMoveSelect ? (
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) handleMove(Number(e.target.value)) }}
                        onBlur={() => setShowMoveSelect(false)}
                        style={{
                          fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
                          letterSpacing: "0.08em", background: "#13131a",
                          border: "1px solid rgba(93,232,247,0.35)", color: "#5de8f7",
                          borderRadius: 3, padding: "4px 8px", cursor: "pointer", outline: "none",
                        }}
                      >
                        <option value="" disabled>Move to…</option>
                        {allCategories.filter(c => c.slug !== categorySlug).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <ModBtn onClick={openMove} label="Move" color="#5de8f7" />
                    )}
                  </div>
                )}
                <div style={{ height: 1, background: `${categoryColor}40`, marginTop: 14 }} />
              </div>

              {/* Original post */}
              <PostCard
                userId={userId}
                authorId={topic.author_id}
                author={topic.author}
                peakElo={topicPeakElo}
                body={topic.body}
                images={topic.images ?? []}
                createdAt={topic.created_at}
                updatedAt={topic.updated_at ?? null}
                upvoteCount={topic.upvote_count}
                upvoted={upvotedIds.has(topic.id)}
                canUpvote={!!userId && userId !== topic.author_id}
                onUpvote={() => handleUpvote("topic", topic.id)}
                canEdit={!!userId && (userId === topic.author_id || isMod)}
                onSaveEdit={(body, images, modNote) => handleEditTopic(body, images, modNote)}
                modNote={topic.mod_note}
                isMod={isMod}
                isFirst
              />

              {/* Replies */}
              {replies.map((reply) => {
                const peakElo = reply.author_stats
                  ? Math.max(reply.author_stats.elo_blitz, reply.author_stats.elo_rapid, reply.author_stats.elo_standard, reply.author_stats.elo_daily)
                  : null
                return (
                  <PostCard
                    key={reply.id}
                    userId={userId}
                    authorId={reply.author_id}
                    author={reply.author}
                    peakElo={peakElo}
                    body={reply.body}
                    images={reply.images ?? []}
                    createdAt={reply.created_at}
                    updatedAt={reply.updated_at ?? null}
                    upvoteCount={reply.upvote_count}
                    upvoted={upvotedIds.has(reply.id)}
                    canUpvote={!!userId && userId !== reply.author_id}
                    onUpvote={() => handleUpvote("reply", reply.id)}
                    canEdit={!!userId && (userId === reply.author_id || isMod)}
                    onSaveEdit={(body, images, modNote) => handleEditReply(reply.id, body, images, modNote)}
                    canDelete={isMod || userId === reply.author_id}
                    onDelete={() => handleDeleteReply(reply)}
                    modNote={reply.mod_note}
                    isMod={isMod}
                  />
                )
              })}

              {/* Reply form */}
              {!!userId && !topic.is_locked && (
                <div style={{
                  marginTop: 20, background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(184,150,106,0.2)", borderRadius: 8, padding: 20,
                }}>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: "0.12em", color: "#b8966a", marginBottom: 12, fontWeight: 700 }}>
                    POST A REPLY
                  </div>
                  <textarea
                    placeholder="Write your reply…" value={replyBody} rows={5}
                    onChange={(e) => setReplyBody(e.target.value)}
                    style={{ ...inputStyle, resize: "vertical" as const }}
                  />
                  <ForumImageUploader
                    userId={userId}
                    images={replyImages}
                    onChange={(urls) => setReplyImages(urls)}
                  />
                  {replyError && <p style={{ color: "#ee484c", fontFamily: "'EB Garamond', serif", fontSize: 14, margin: "8px 0 0" }}>{replyError}</p>}
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={handleSubmitReply}
                      disabled={submitting || !replyBody.trim()}
                      style={{ ...primaryBtnStyle, opacity: submitting || !replyBody.trim() ? 0.5 : 1 }}
                    >
                      {submitting ? "Posting…" : "Post Reply"}
                    </button>
                  </div>
                </div>
              )}

              {topic.is_locked && (
                <div style={{
                  marginTop: 20, padding: "14px 18px",
                  background: "rgba(184,150,106,0.05)", border: "1px solid rgba(184,150,106,0.2)",
                  borderRadius: 6, fontFamily: "'Cinzel', serif", fontSize: 13,
                  letterSpacing: "0.1em", color: "#b8966a", textAlign: "center",
                }}>
                  This topic is locked. No new replies.
                </div>
              )}

              {!userId && (
                <div style={{
                  marginTop: 20, padding: "14px 18px",
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(184,150,106,0.15)",
                  borderRadius: 6, fontFamily: "'EB Garamond', serif",
                  fontSize: 15, color: "#b0aa9e", textAlign: "center",
                }}>
                  Sign in to reply.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({
  userId, authorId, author, peakElo, body, images, createdAt, updatedAt,
  upvoteCount, upvoted, canUpvote, onUpvote,
  canEdit, onSaveEdit,
  canDelete, onDelete, isFirst,
  modNote, isMod,
}: {
  userId?: string | null
  authorId: string
  author: PostAuthor
  peakElo: number | null
  body: string
  images: string[]
  createdAt: string
  updatedAt: string | null
  upvoteCount: number
  upvoted: boolean
  canUpvote: boolean
  onUpvote: () => void
  canEdit?: boolean
  onSaveEdit?: (body: string, images: string[], modNote: string | null) => void
  canDelete?: boolean
  onDelete?: () => void
  isFirst?: boolean
  modNote?: string | null
  isMod?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(body)
  const [editImages, setEditImages] = useState<string[]>(images)
  const editImagesRef = React.useRef<string[]>(images)
  const [editModNote, setEditModNote] = useState(modNote ?? "")
  const [saving, setSaving] = useState(false)

  // Sync local edit state if parent refreshes the post
  React.useEffect(() => {
    if (!editing) {
      setEditBody(body)
      setEditImages(images)
      editImagesRef.current = images
      setEditModNote(modNote ?? "")
    }
  }, [body, images, modNote, editing])

  async function handleSave() {
    console.log("[PostCard.handleSave] called, body:", editBody.trim().slice(0, 20), "images:", editImagesRef.current, "onSaveEdit:", !!onSaveEdit)
    if (!editBody.trim() || !onSaveEdit) return
    setSaving(true)
    await onSaveEdit(editBody.trim(), editImagesRef.current, editModNote.trim() || null)
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setEditBody(body)
    setEditImages(images)
    editImagesRef.current = images
    setEditModNote(modNote ?? "")
    setEditing(false)
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${isFirst ? "rgba(184,150,106,0.2)" : "rgba(184,150,106,0.1)"}`,
      borderRadius: 6, padding: "16px 18px", marginBottom: 2,
    }}>
      {/* Author header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
        paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap",
      }}>
        <a href={`/u/${author.username}`} style={{ display: "contents", textDecoration: "none" }}>
          <PostAvatar username={author.username} avatarUrl={author.avatar_url} size={36} />
        </a>
        <a href={`/u/${author.username}`} style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 18, fontWeight: 700, color: "#d4af7a", letterSpacing: "0.04em", cursor: "pointer" }}>
            {author.username}
          </span>
        </a>
        {author.country_code && (
          <img
            src={`https://flagicons.lipis.dev/flags/4x3/${author.country_code.toLowerCase()}.svg`}
            width={18} height={14} alt={author.country_code}
            style={{ borderRadius: 2, display: "inline-block" }}
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
        )}
        <OrderIcon url={author.order_icon_url} alt="Order" size={24} />
        {peakElo !== null && (
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 700, color: eloColor(peakElo), letterSpacing: "0.04em" }} title={eloTitle(peakElo)}>
            {peakElo}
          </span>
        )}
        {author.account_tier === "pro" && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 8px", borderRadius: 999,
            border: "1px solid rgba(212,175,122,0.35)",
            background: "rgba(212,175,122,0.08)",
            color: "#d4af7a", fontFamily: "'Cinzel', serif",
            fontSize: 12, letterSpacing: "0.18em",
            textTransform: "uppercase" as const, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#d4af7a", boxShadow: "0 0 0 2px rgba(212,175,122,0.14)", flexShrink: 0 }} />
            Pro
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 16, color: "#555" }}>
            {timeAgo(createdAt)}
          </span>
          {updatedAt && updatedAt !== createdAt && (
            <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#3a3830", fontStyle: "italic" }}>
              edited {timeAgo(updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Body — view or edit mode */}
      {editing ? (
        <div style={{ marginBottom: 14 }}>
          <textarea
            value={editBody}
            rows={6}
            onChange={e => setEditBody(e.target.value)}
            style={{ ...inputStyle, resize: "vertical" as const }}
          />
          {userId && (
            <ForumImageUploader
              userId={userId}
              images={editImages}
              onChange={(urls) => { editImagesRef.current = urls; setEditImages(urls) }}
            />
          )}
          {isMod && userId !== authorId && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                fontFamily: "'Cinzel', serif", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.18em", textTransform: "uppercase",
                color: "#5de8f7", marginBottom: 5, opacity: 0.7,
              }}>
                Mod Note (optional)
              </div>
              <input
                type="text"
                value={editModNote}
                onChange={(e) => setEditModNote(e.target.value)}
                placeholder="e.g. Moved to Site Help"
                style={{
                  width: "100%", background: "#0d0d14",
                  border: "1px solid rgba(93,232,247,0.25)", borderRadius: 4,
                  color: "#e8e4d8", fontFamily: "'EB Garamond', serif",
                  fontSize: 16, padding: "8px 12px", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving || !editBody.trim()}
              style={{ ...primaryBtnStyle, opacity: saving || !editBody.trim() ? 0.5 : 1 }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleCancel} style={ghostBtnStyle}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{
            fontFamily: "'EB Garamond', serif", fontSize: 22, lineHeight: 1.75,
            color: "#9c9581", whiteSpace: "pre-wrap", wordBreak: "break-word",
            marginBottom: images.length > 0 ? 10 : 16,
          }}>
            {linkify(body)}
          </div>
          <ImageGrid images={images} />
        </>
      )}

      {/* Pro signature */}
      {!editing && author.account_tier === "pro" && author.forum_signature && (
        <div style={{ marginTop: 14, marginBottom: 6 }}>
          <div style={{ height: 1, background: "rgba(184,150,106,0.12)", marginBottom: 10 }} />
          <div style={{
            fontFamily: "'EB Garamond', serif", fontSize: 18,
            fontStyle: "italic", color: "rgba(212,175,122,0.55)",
            letterSpacing: "0.01em",
          }}>
            {author.forum_signature}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <UpvoteButton count={upvoteCount} upvoted={upvoted} disabled={!canUpvote} onClick={onUpvote} />
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} style={{
            fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase" as const,
            background: "transparent", border: "1px solid rgba(184,150,106,0.25)",
            color: "#b8966a", borderRadius: 3, padding: "4px 10px", cursor: "pointer",
          }}>
            Edit
          </button>
        )}
        {canDelete && onDelete && !editing && (
          <button onClick={onDelete} style={{
            fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase" as const,
            background: "transparent", border: "1px solid rgba(238,72,76,0.25)",
            color: "#ee484c", borderRadius: 3, padding: "4px 10px", cursor: "pointer",
          }}>
            Delete
          </button>
        )}
        {!editing && modNote && (
          <span style={{ marginLeft: "auto" }}>
            <span style={{
              fontFamily: "'Cinzel', serif", fontSize: 12, fontWeight: 700,
              letterSpacing: "0.18em", textTransform: "uppercase", color: "#5de8f7", opacity: 0.7,
            }}>
              Mod Note:{" "}
            </span>
            <span style={{
              fontFamily: "'EB Garamond', serif", fontSize: 16,
              fontStyle: "italic", color: "#5de8f7", opacity: 0.6,
            }}>
              {modNote}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

function UpvoteButton({ count, upvoted, disabled, onClick }: { count: number; upvoted: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        background: upvoted ? "rgba(93,232,247,0.1)" : "transparent",
        border: `1px solid ${upvoted ? "rgba(93,232,247,0.4)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 4, padding: "5px 12px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "all 0.12s ease",
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" fill={upvoted ? "#5de8f7" : "#888"}>
        <path d="M305 151.1L320 171.8L335 151.1C360 116.5 400.2 96 442.9 96C516.4 96 576 155.6 576 229.1L576 231.7C576 343.9 436.1 474.2 363.1 529.9C350.7 539.3 335.5 544 320 544C304.5 544 289.2 539.4 276.9 529.9C203.9 474.2 64 343.9 64 231.7L64 229.1C64 155.6 123.6 96 197.1 96C239.8 96 280 116.5 305 151.1z"/>
      </svg>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 700, color: upvoted ? "#5de8f7" : "#888" }}>
        {count}
      </span>
    </button>
  )
}

function OrderIcon({ url, alt, size = 18 }: { url: string | null | undefined; alt: string; size?: number }) {
  if (!url) return null
  return (
    <img
      src={url}
      alt={alt}
      title={alt}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
      }}
      onError={(e) => { e.currentTarget.style.display = "none" }}
    />
  )
}

function PostAvatar({ username, avatarUrl, size = 28 }: { username: string; avatarUrl?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "#13131a", border: "1px solid rgba(184,150,106,0.2)",
      display: "grid", placeItems: "center",
      fontSize: Math.max(10, Math.floor(size * 0.38)),
      fontWeight: 800, color: "#e8e4d8", flexShrink: 0, overflow: "hidden",
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span>{(username ?? "?")[0]?.toUpperCase()}</span>
      }
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase" as const,
      color, border: `1px solid ${color}55`, borderRadius: 3, padding: "3px 8px",
    }}>
      {label}
    </span>
  )
}

function ModBtn({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase" as const,
      background: "transparent", border: `1px solid ${color}33`,
      color, borderRadius: 3, padding: "4px 10px", cursor: "pointer",
    }}>
      {label}
    </button>
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

function linkify(text: string): React.ReactNode[] {
  const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g
  const parts = text.split(URL_RE)
  return parts.map((part, i) => {
    if (URL_RE.test(part)) {
      const isInternal = part.startsWith("https://vekke.net") || part.startsWith("http://vekke.net")
      return (
        <a
          key={i}
          href={part}
          target={isInternal ? "_self" : "_blank"}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: "#5de8f7",
            textDecoration: "underline",
            textDecorationColor: "rgba(93,232,247,0.35)",
            wordBreak: "break-all",
          }}
        >
          {part}
        </a>
      )
    }
    return part
  })
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
  color: "#d4af7a", borderRadius: 4, padding: "9px 18px", cursor: "pointer",
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
