// src/pages/AnnouncementsPage.tsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? "1 month ago" : `${months} months ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function AnnouncementsPage() {
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

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

      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
      setAnnouncements(data ?? [])
      setLoading(false)
    })()
  }, [])

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recent = announcements.filter(a => new Date(a.created_at).getTime() >= cutoff)
  const earlier = announcements.filter(a => new Date(a.created_at).getTime() < cutoff)

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8" }}>
      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        activePage="announcements"
        onSignIn={() => window.location.assign("/?openAuth=1&returnTo=/announcements")}
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

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: "#b8966a", marginBottom: 8 }}>
            Vekke
          </div>
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: 28, fontWeight: 700, color: "#e8e4d8", margin: 0, letterSpacing: "0.04em" }}>
            Announcements
          </h1>
        </div>

        {loading ? (
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.15em", color: "#6b6558", textAlign: "center", padding: "60px 0" }}>
            Loading...
          </div>
        ) : announcements.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: "0.12em", color: "#6b6558" }}>
              No announcements yet.
            </div>
          </div>
        ) : (
          <>
            {recent.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", color: "#5de8f7" }}>
                    Recent
                  </span>
                  <div style={{ flex: 1, height: 1, background: "rgba(93,232,247,0.15)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {recent.map(a => <AnnouncementCard key={a.id} announcement={a} isRecent />)}
                </div>
              </section>
            )}

            {earlier.length > 0 && (
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", color: "#6b6558" }}>
                    Earlier
                  </span>
                  <div style={{ flex: 1, height: 1, background: "rgba(184,150,106,0.15)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {earlier.map(a => <AnnouncementCard key={a.id} announcement={a} isRecent={false} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AnnouncementCard({ announcement: a, isRecent }: { announcement: Announcement; isRecent: boolean }) {
  const [expanded, setExpanded] = useState(isRecent)

  return (
    <div
      style={{
        borderRadius: 12,
        border: isRecent ? "1px solid rgba(93,232,247,0.15)" : "1px solid rgba(184,150,106,0.12)",
        background: isRecent ? "rgba(93,232,247,0.03)" : "rgba(184,150,106,0.03)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          gap: 16,
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 14,
            fontWeight: 700,
            color: isRecent ? "#e8e4d8" : "#b0aa9e",
            letterSpacing: "0.03em",
            marginBottom: 4,
          }}>
            {a.title}
          </div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: isRecent ? "rgba(93,232,247,0.5)" : "#6b6558",
          }}>
            {formatDate(a.created_at)} · {timeAgo(a.created_at)}
          </div>
        </div>
        <div style={{
          flexShrink: 0,
          fontSize: 10,
          color: "#6b6558",
          transition: "transform 0.2s",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        }}>
          ▼
        </div>
      </button>

      {expanded && (
        <div style={{
          padding: "16px 20px 20px",
          fontFamily: "'EB Garamond', serif",
          fontSize: 16,
          lineHeight: 1.7,
          color: "#c8c4b8",
          borderTop: isRecent ? "1px solid rgba(93,232,247,0.08)" : "1px solid rgba(184,150,106,0.08)",
          whiteSpace: "pre-wrap",
        }}>
          {a.body}
        </div>
      )}
    </div>
  )
}
