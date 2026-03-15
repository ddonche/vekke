// src/pages/HistoryPage.tsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

type GameRow = {
  id: string
  created_at: string
  ended_at: string | null
  wake_id: string
  brake_id: string
  winner_id: string | null
  loser_id: string | null
  end_reason: string | null
  format: string | null
  is_vs_ai: boolean | null
  ai_level: string | null
}

type Profile = {
  id: string
  username: string
  avatar_url: string | null
}

type EnrichedGame = GameRow & {
  opponentName: string
  opponentAvatarUrl: string | null
  mySide: "W" | "B"
  result: "win" | "loss" | "unknown"
}

function formatReason(reason: string | null): string {
  if (!reason) return "—"
  if (reason === "resignation") return "Resign"
  if (reason === "timeout") return "Timeout"
  if (reason === "siegemate") return "Siegemate"
  if (reason === "collapse") return "Collapse"
  if (reason === "elimination") return "Elimination"
  return reason.charAt(0).toUpperCase() + reason.slice(1)
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function formatFormat(f: string | null): string {
  if (!f) return "—"
  return f.charAt(0).toUpperCase() + f.slice(1)
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [games, setGames] = useState<EnrichedGame[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<{ username?: string; avatar_url?: string | null; account_tier?: string | null } | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const uid = sessionData.session?.user.id ?? null
        if (!mounted) return

        if (!uid) {
          setLoading(false)
          return
        }

        setCurrentUserId(uid)

        // Fetch user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, avatar_url, account_tier")
          .eq("id", uid)
          .maybeSingle()

        if (!mounted) return
        if (profile) setUserProfile(profile)

        const isPro = profile?.account_tier === "pro"

        // Build query — all ended games for this user
        let query = supabase
          .from("games")
          .select("id, created_at, ended_at, wake_id, brake_id, winner_id, loser_id, end_reason, format, is_vs_ai, ai_level")
          .eq("status", "finished")
          .or(`wake_id.eq.${uid},brake_id.eq.${uid}`)
          .order("ended_at", { ascending: false })

        const { data: rawGames, error: gErr } = await query
        if (gErr) throw gErr
        if (!mounted) return

        const allGames = (rawGames ?? []) as GameRow[]

        // For free accounts: all PvP + last 10 AI
        let filtered: GameRow[]
        if (isPro) {
          filtered = allGames
        } else {
          const pvp = allGames.filter((g) => !g.is_vs_ai)
          const ai = allGames.filter((g) => g.is_vs_ai).slice(0, 10)
          // Merge and re-sort by ended_at desc
          filtered = [...pvp, ...ai].sort((a, b) => {
            const ta = a.ended_at ? new Date(a.ended_at).getTime() : 0
            const tb = b.ended_at ? new Date(b.ended_at).getTime() : 0
            return tb - ta
          })
        }

        // Collect unique opponent IDs (non-AI games)
        const opponentIds = Array.from(new Set(
          filtered
            .filter((g) => !g.is_vs_ai)
            .map((g) => g.wake_id === uid ? g.brake_id : g.wake_id)
        ))

        const profileMap = new Map<string, Profile>()
        if (opponentIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", opponentIds)
          for (const p of (profiles ?? []) as Profile[]) {
            profileMap.set(p.id, p)
          }
        }

        // Fetch AI profiles too
        const aiIds = Array.from(new Set(
          filtered
            .filter((g) => g.is_vs_ai)
            .map((g) => g.wake_id === uid ? g.brake_id : g.wake_id)
        ))
        if (aiIds.length > 0) {
          const { data: aiProfiles } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", aiIds)
          for (const p of (aiProfiles ?? []) as Profile[]) {
            profileMap.set(p.id, p)
          }
        }

        if (!mounted) return

        const enriched: EnrichedGame[] = filtered.map((g) => {
          const mySide: "W" | "B" = g.wake_id === uid ? "W" : "B"
          const opponentId = mySide === "W" ? g.brake_id : g.wake_id
          const oppProfile = profileMap.get(opponentId)
          const opponentName = oppProfile?.username ?? (g.is_vs_ai ? "AI" : "Unknown")
          const result: "win" | "loss" | "unknown" =
            g.winner_id === uid ? "win" : g.loser_id === uid ? "loss" : "unknown"

          return {
            ...g,
            mySide,
            opponentName,
            opponentAvatarUrl: oppProfile?.avatar_url ?? null,
            result,
          }
        })

        setGames(enriched)
        setLoading(false)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message ?? String(e))
        setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [])

  const isPro = userProfile?.account_tier === "pro"

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#e8e4d8", fontFamily: "'EB Garamond', Georgia, serif" }}>
      <Header
        isLoggedIn={!!currentUserId}
        userId={currentUserId ?? undefined}
        username={userProfile?.username}
        avatarUrl={userProfile?.avatar_url ?? null}
        activePage={null}
        onSignOut={async () => { await supabase.auth.signOut(); navigate("/") }}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: "1.5rem", letterSpacing: "0.06em", color: "#e8e4d8" }}>
            Game History
          </div>
          {!isPro && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#6b6558" }}>
              All PvP games · Last 10 AI games —{" "}
              <span
                onClick={() => navigate("/pro")}
                style={{ color: "#b8966a", cursor: "pointer", textDecoration: "underline" }}
              >
                Upgrade to Pro
              </span>
              {" "}for full history
            </div>
          )}
        </div>

        {!currentUserId && !loading && (
          <div style={{ color: "#9a9488" }}>Sign in to see your game history.</div>
        )}

        {loading && (
          <div style={{ color: "#9a9488" }}>Loading…</div>
        )}

        {error && (
          <div style={{ color: "#f87171" }}>Error: {error}</div>
        )}

        {!loading && !error && currentUserId && games.length === 0 && (
          <div style={{ color: "#9a9488" }}>No completed games yet.</div>
        )}

        {!loading && !error && games.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {/* Header row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 100px 80px 120px 80px",
              gap: 12,
              padding: "8px 16px",
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#6b6558",
            }}>
              <div>Opponent</div>
              <div>Side</div>
              <div>Result</div>
              <div>How</div>
              <div>Format</div>
              <div>Date</div>
            </div>

            {games.map((g) => {
              const isWin = g.result === "win"
              const isLoss = g.result === "loss"
              const resultColor = isWin ? "#4ade80" : isLoss ? "#f87171" : "#9a9488"
              const resultLabel = isWin ? "Win" : isLoss ? "Loss" : "—"

              return (
                <div
                  key={g.id}
                  onClick={() => navigate(`/replay/${g.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 100px 80px 120px 80px",
                    gap: 12,
                    padding: "12px 16px",
                    background: "rgba(184,150,106,0.04)",
                    border: "1px solid rgba(184,150,106,0.12)",
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "background 0.12s, border-color 0.12s",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(184,150,106,0.09)"
                    ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(184,150,106,0.28)"
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(184,150,106,0.04)"
                    ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(184,150,106,0.12)"
                  }}
                >
                  {/* Opponent */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: g.opponentAvatarUrl ? "transparent" : "#1a1a22",
                      border: "1px solid rgba(184,150,106,0.2)",
                      flexShrink: 0, overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#b8966a",
                    }}>
                      {g.opponentAvatarUrl
                        ? <img src={g.opponentAvatarUrl} alt={g.opponentName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : g.opponentName.charAt(0).toUpperCase()
                      }
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 13, color: "#e8e4d8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {g.opponentName}
                      </div>
                      {g.is_vs_ai && g.ai_level && (
                        <div style={{ fontSize: 11, color: "#6b6558", marginTop: 1 }}>AI</div>
                      )}
                    </div>
                  </div>

                  {/* Side */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: "50%",
                      background: g.mySide === "W" ? "#e8e4d8" : "#5de8f7",
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, color: "#b0aa9e" }}>
                      {g.mySide === "W" ? "Wake" : "Brake"}
                    </span>
                  </div>

                  {/* Result */}
                  <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 13, color: resultColor }}>
                    {resultLabel}
                  </div>

                  {/* How */}
                  <div style={{ fontSize: 13, color: "#9a9488" }}>
                    {formatReason(g.end_reason)}
                  </div>

                  {/* Format */}
                  <div style={{ fontSize: 13, color: "#9a9488" }}>
                    {formatFormat(g.format)}
                  </div>

                  {/* Date */}
                  <div style={{ fontSize: 12, color: "#6b6558", whiteSpace: "nowrap" }}>
                    {formatDate(g.ended_at)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
