// src/pages/ProfilePage.tsx
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"
import { createChallenge, type TimeControlId } from "../services/pvp"
import { newGame } from "../engine/state"

type ProfileRow = {
  id: string
  username: string
  avatar_url: string | null
  country_code: string | null
  country_name: string | null
  account_tier: string | null
  order_id: string | null
  order_joined_at: string | null
  is_ai: boolean

  // Pro profile extras
  bio: string | null
  website_url: string | null
  x_url: string | null
  youtube_url: string | null
  twitch_url: string | null
  instagram_url: string | null
  facebook_url: string | null
}

type PlayerStatsRow = {
  user_id: string
  elo: number | null

  wins_active: number | null
  losses_active: number | null
  losses_timeout: number | null
  resignations: number | null
  wins_by_opponent_resign: number | null
  games_played: number | null
  last_game_at: string | null

  elo_blitz: number | null
  elo_rapid: number | null
  elo_standard: number | null
  elo_daily: number | null

  games_blitz: number | null
  wins_blitz: number | null
  losses_blitz: number | null

  games_rapid: number | null
  wins_rapid: number | null
  losses_rapid: number | null

  games_standard: number | null
  wins_standard: number | null
  losses_standard: number | null

  games_daily: number | null
  wins_daily: number | null
  losses_daily: number | null
}

type OrderLite = {
  id: string
  name: string
  doctrine: string | null
  primary_color: string
  secondary_color: string
  sigil_url: string | null
}

function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-profile-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-profile-fonts"
  link.rel = "stylesheet"
  link.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
}

function safeInt(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function winRate(w: number, l: number) {
  const d = w + l
  if (d <= 0) return null
  return w / d
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

function FlagImg({ cc, size = 18 }: { cc: string | null | undefined; size?: number }) {
  const s = (cc ?? "").trim().toLowerCase()
  if (!s || s.length !== 2) return null
  return (
    <img
      src={`https://flagicons.lipis.dev/flags/4x3/${s}.svg`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={s.toUpperCase()}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        borderRadius: 2,
        flexShrink: 0,
      }}
      onError={(e) => {
        e.currentTarget.style.display = "none"
      }}
    />
  )
}

// Added: exact elo color function from game page
function eloColor(elo: number) {
  if (elo >= 2000) return "#D4AF37" // gold – Grandmaster
  if (elo >= 1750) return "#7c2d12" // brown – Senior Master
  if (elo >= 1500) return "#16a34a" // green – Master
  if (elo >= 1200) return "#dc2626" // red – Expert
  if (elo >= 900) return "#2563eb" // blue – Adept
  return "#6b6558" // grey – Novice
}

function StatPill({
  label,
  value,
  tone,
  customColor,
}: {
  label: string
  value: string
  tone?: "gold" | "cyan" | "red" | "neutral"
  customColor?: string
}) {
  const valueColor =
    customColor ||
    (tone === "cyan"
      ? "#5de8f7"
      : tone === "gold"
        ? "#d4af7a"
        : tone === "red"
          ? "#f87171"
          : "#e8e4d8")

  return (
    <div
      style={{
        padding: "12px 12px 11px",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        background: "#0f0f14",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: "0.72rem",
          fontWeight: 600,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "#6b6558",
          marginBottom: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: "1.15rem",
          fontWeight: 800,
          letterSpacing: "0.05em",
          color: valueColor,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  )
}

/* ---------------- Pro flair ---------------- */

function ProFlair({ accent = "#d4af7a" }: { accent?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 999,
        border: `1px solid ${accent}55`,
        background: `${accent}14`,
        color: "#d4af7a",
        fontFamily: "'Cinzel', serif",
        fontSize: "0.58rem",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        fontWeight: 700,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
      title="Pro"
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: "#d4af7a",
          boxShadow: "0 0 0 3px rgba(212,175,122,0.14)",
        }}
      />
      Pro
    </span>
  )
}

/* ---------------- Pro icons (inline SVG, no deps) ---------------- */

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        opacity: 0.95,
      }}
    >
      {children}
    </span>
  )
}

function GlobeIcon() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" opacity="0.85" />
        <path d="M2 12h20" stroke="currentColor" strokeWidth="2" opacity="0.55" />
        <path
          d="M12 2c3 2.8 5 6.4 5 10s-2 7.2-5 10c-3-2.8-5-6.4-5-10s2-7.2 5-10Z"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.55"
        />
      </svg>
    </IconWrap>
  )
}

function XIcon() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 17L17 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M7 7l10 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      </svg>
    </IconWrap>
  )
}

function YouTubeIcon() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.7 4.5 12 4.5 12 4.5s-5.7 0-7.5.6A3 3 0 0 0 2.4 7.2 31.7 31.7 0 0 0 2 12a31.7 31.7 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.8.6 7.5.6 7.5.6s5.7 0 7.5-.6a3 3 0 0 0 2.1-2.1A31.7 31.7 0 0 0 22 12a31.7 31.7 0 0 0-.4-4.8Z"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.85"
        />
        <path d="M10 9.5v5l5-2.5-5-2.5Z" fill="currentColor" opacity="0.85" />
      </svg>
    </IconWrap>
  )
}

function TwitchIcon() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 3h17v10l-4 4h-4l-2 2H8v-2H4V3Z"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.85"
        />
        <path d="M10 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <path d="M15 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      </svg>
    </IconWrap>
  )
}

function InstagramIcon() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.85"
        />
        <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" opacity="0.65" />
        <path d="M17.5 6.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
      </svg>
    </IconWrap>
  )
}

function FacebookIcon() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.2l.8-3H13V9c0-.6.4-1 1-1Z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    </IconWrap>
  )
}

function normalizeUrl(raw: string | null | undefined) {
  const s = (raw ?? "").trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  return `https://${s}`
}

export default function ProfilePage() {
  injectFonts()

  const navigate = useNavigate()
  const { username } = useParams<{ username: string }>()
  const targetUsername = (username ?? "").trim()

  const isMountedRef = useRef(true)

  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Viewer (for Header)
  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null)

  // Target
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [stats, setStats] = useState<PlayerStatsRow | null>(null)
  const [order, setOrder] = useState<OrderLite | null>(null)

  // Challenge UI (same feel as leaderboard)
  const [challengeTc, setChallengeTc] = useState<TimeControlId>("standard")
  const [challenging, setChallenging] = useState(false)
  const [challenged, setChallenged] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function load() {
    setErr(null)
    setLoading(true)
    setProfile(null)
    setStats(null)
    setOrder(null)
    setChallenged(false)
    setChallenging(false)

    // viewer session
    const { data: sess, error: sessErr } = await supabase.auth.getSession()
    if (sessErr) setErr(sessErr.message)

    const viewer = sess.session?.user ?? null
    if (viewer) {
      const uid = viewer.id
      setUserId(uid)
      const { data: myp } = await supabase.from("profiles").select("id,username,avatar_url").eq("id", uid).single()
      if (myp) setMe(myp as any)
    } else {
      setUserId(null)
      setMe(null)
    }

    // target profile by username
    if (!targetUsername) {
      setErr("Missing username in URL.")
      setLoading(false)
      return
    }

    const { data: p, error: pErr } = await supabase
      .from("profiles")
      .select(
        "id,username,avatar_url,country_code,country_name,account_tier,order_id,order_joined_at,is_ai,bio,website_url,x_url,youtube_url,twitch_url,instagram_url,facebook_url"
      )
      .eq("username", targetUsername)
      .maybeSingle()

    if (pErr) {
      setErr(pErr.message)
      setLoading(false)
      return
    }
    if (!p) {
      setErr("Player not found.")
      setLoading(false)
      return
    }
    if (!isMountedRef.current) return
    setProfile(p as any)

    // stats
    const { data: s, error: sErr } = await supabase.from("player_stats").select("*").eq("user_id", (p as any).id).maybeSingle()
    if (sErr) {
      setErr(sErr.message)
      setLoading(false)
      return
    }
    if (!isMountedRef.current) return
    setStats((s as any) ?? null)

    // order (for sigil/name/colors like OrdersPage)
    const oid = (p as any).order_id as string | null
    if (oid) {
      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select("id,name,doctrine,primary_color,secondary_color,sigil_url")
        .eq("id", oid)
        .maybeSingle()
      if (!oErr) setOrder((o as any) ?? null)
    }

    if (!isMountedRef.current) return
    setLoading(false)
  }

  useEffect(() => {
    load().catch((e: any) => setErr(e?.message ?? String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUsername])

  const FORMAT_LABELS: Record<TimeControlId, string> = {
    standard: "Standard",
    rapid: "Rapid",
    blitz: "Blitz",
    daily: "Daily",
  }

  const derived = useMemo(() => {
    // Pick the stats slice based on the currently highlighted format tab.
    const tc = challengeTc

    const formatElo =
      tc === "blitz"
        ? safeInt(stats?.elo_blitz)
        : tc === "rapid"
          ? safeInt(stats?.elo_rapid)
          : tc === "daily"
            ? safeInt(stats?.elo_daily)
            : safeInt(stats?.elo_standard)

    const formatGames =
      tc === "blitz"
        ? safeInt(stats?.games_blitz)
        : tc === "rapid"
          ? safeInt(stats?.games_rapid)
          : tc === "daily"
            ? safeInt(stats?.games_daily)
            : safeInt(stats?.games_standard)

    const formatWins =
      tc === "blitz"
        ? safeInt(stats?.wins_blitz)
        : tc === "rapid"
          ? safeInt(stats?.wins_rapid)
          : tc === "daily"
            ? safeInt(stats?.wins_daily)
            : safeInt(stats?.wins_standard)

    const formatLosses =
      tc === "blitz"
        ? safeInt(stats?.losses_blitz)
        : tc === "rapid"
          ? safeInt(stats?.losses_rapid)
          : tc === "daily"
            ? safeInt(stats?.losses_daily)
            : safeInt(stats?.losses_standard)

    const wr = winRate(formatWins, formatLosses)

    return {
      // Format-specific headline stats:
      elo: formatElo,
      games: formatGames,
      wins: formatWins,
      losses: formatLosses,
      wr,

      // Keep these global (no per-format columns currently):
      timeouts: safeInt(stats?.losses_timeout),
      resigns: safeInt(stats?.resignations),
      lastGameAt: stats?.last_game_at ?? null,
      label: FORMAT_LABELS[tc],
    }
  }, [stats, challengeTc])

  const countryLabel =
    (profile?.country_name ?? "").trim() ||
    ((profile?.country_code ?? "").trim() ? (profile?.country_code ?? "").trim().toUpperCase() : "") ||
    "Unknown"

  const orderAccent = useMemo(() => {
    if (!order) return "#b8966a"
    const id = order.id
    const accent = ["wolf", "raven", "fox"].includes(id) ? order.primary_color : order.secondary_color
    return accent || "#b8966a"
  }, [order])

  function canChallengeTarget() {
    if (!userId) return false
    if (!profile) return false
    if (profile.id === userId) return false
    if (profile.is_ai) return false
    if (challenged) return false
    if (challenging) return false
    return true
  }

  async function onChallengeClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!profile) return

    if (!userId) {
      const rt = encodeURIComponent(`/u/${encodeURIComponent(targetUsername)}`)
      window.location.assign(`/?openAuth=1&returnTo=${rt}`)
      return
    }

    if (!canChallengeTarget()) return

    setErr(null)
    setChallenging(true)

    try {
      const initialState = newGame()

      await createChallenge({
        invitedUserId: profile.id,
        timeControlId: challengeTc,
        isRanked: true,
        initialState,
      })

      setChallenged(true)
    } catch (ex: any) {
      setErr(ex?.message ?? String(ex))
    } finally {
      setChallenging(false)
    }
  }

  const isPro = profile?.account_tier === "pro"

  const proLinks = useMemo(() => {
    if (!isPro || !profile) return []
    const items: { key: string; label: string; url: string; icon: React.ReactNode }[] = []

    const website = normalizeUrl(profile.website_url)
    const x = normalizeUrl(profile.x_url)
    const yt = normalizeUrl(profile.youtube_url)
    const tw = normalizeUrl(profile.twitch_url)
    const ig = normalizeUrl(profile.instagram_url)
    const fb = normalizeUrl(profile.facebook_url)

    if (website) items.push({ key: "website", label: "Website", url: website, icon: <GlobeIcon /> })
    if (yt) items.push({ key: "youtube", label: "YouTube", url: yt, icon: <YouTubeIcon /> })
    if (tw) items.push({ key: "twitch", label: "Twitch", url: tw, icon: <TwitchIcon /> })
    if (x) items.push({ key: "x", label: "X", url: x, icon: <XIcon /> })
    if (ig) items.push({ key: "instagram", label: "Instagram", url: ig, icon: <InstagramIcon /> })
    if (fb) items.push({ key: "facebook", label: "Facebook", url: fb, icon: <FacebookIcon /> })

    return items
  }, [isPro, profile])

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0a0a0c",
        fontFamily: "'EB Garamond', Georgia, serif",
        color: "#e8e4d8",
        overflow: "hidden",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #0a0a0c; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

        .vk-container { padding: 22px 16px 56px; max-width: 1100px; margin: 0 auto; width: 100%; }
        @media (min-width: 700px) {
          .vk-container { padding: 28px 24px 60px; }
        }

        .profile-grid { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start; }
        @media (min-width: 920px) {
          .profile-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
        }

        .section-label {
          font-family: 'Cinzel', serif;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.45em;
          text-transform: uppercase;
          color: #6b6558;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .rule { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }

        .card {
          border: 1px solid rgba(255,255,255,0.07);
          background: #0f0f14;
          border-radius: 12px;
          overflow: hidden;
        }
        .card-pad { padding: 14px; }
        @media (min-width: 700px) { .card-pad { padding: 16px; } }

        .stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        @media (min-width: 520px) { .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

        .table-wrap { overflow-x: auto; }
        .table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 640px; }
        .th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #6b6558;
          white-space: nowrap;
        }
        .td {
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          color: #b0aa9e;
          white-space: nowrap;
        }

        /* DO NOT TOUCH THESE SIZES */
        .format-tab {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 4px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.12s;
          background: transparent;
          color: #6b6558;
          white-space: nowrap;
        }
        .format-tab:hover { color: #b0aa9e; background: rgba(255,255,255,0.04); }
        .format-tab.active {
          color: #d4af7a;
          background: rgba(184,150,106,0.10);
          border-color: rgba(184,150,106,0.30);
        }

        /* DO NOT TOUCH THESE SIZES */
        .challenge-btn {
          font-family: 'Cinzel', serif;
          background: rgba(184,150,106,0.10);
          border: 1px solid rgba(184,150,106,0.35);
          color: #d4af7a;
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 0.55rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .challenge-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }

        /* Pro bio + icon links (no borders/boxes) */
        .pro-bio {
          margin-top: 10px;
          color: #e8e4d8;
          font-size: 1.05rem;
          line-height: 1.45;
          font-style: italic;
          text-align: justify;
          text-justify: inter-word;
          opacity: 0.95;
        }

        .pro-icons {
          margin-top: 10px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .pro-icon-link {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          text-decoration: none;
          color: #d4af7a;
          background: transparent;
          transition: background 0.12s, transform 0.12s, opacity 0.12s;
          opacity: 0.95;
        }
        .pro-icon-link:hover {
          background: rgba(184,150,106,0.10);
          transform: translateY(-1px);
          opacity: 1;
        }
        .pro-icon-link:active { transform: translateY(0px); }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel="Profile"
        elo={undefined}
        activePage="mygames"
        myGamesTurnCount={0}
        onSignIn={() => {
          const rt = encodeURIComponent(`/u/${encodeURIComponent(targetUsername)}`)
          window.location.assign(`/?openAuth=1&returnTo=${rt}`)
        }}
        onOpenProfile={() => navigate("/?openProfile=1")}
        onOpenSkins={() => navigate("/skins")}
        onSignOut={async () => {
          await supabase.auth.signOut()
          navigate("/")
        }}
        onPlay={() => navigate("/")}
        onMyGames={() => navigate("/challenges")}
        onLeaderboard={() => navigate("/leaderboard")}
        onChallenges={() => navigate("/challenges")}
        onOrders={() => navigate("/orders")}
        onRules={() => navigate("/rules")}
        onTutorial={() => navigate("/tutorial")}
      />

      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="vk-container">
          {err && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,0.4)",
                background: "rgba(239,68,68,0.08)",
                color: "#fca5a5",
                fontSize: "0.95rem",
              }}
            >
              {err}
            </div>
          )}

          <div className="profile-grid">
            {/* LEFT: Identity */}
            <div>
              <div className="section-label">
                Identity <div className="rule" />
              </div>

              <div className="card">
                <div
                  style={{
                    height: 4,
                    background: `linear-gradient(90deg, transparent, ${order ? orderAccent : "#b8966a"}88, transparent)`,
                  }}
                />
                <div className="card-pad">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: "#13131a",
                        border: "1px solid rgba(184,150,106,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.username}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span
                          style={{
                            fontFamily: "'Cinzel', serif",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            color: "#b0aa9e",
                          }}
                        >
                          {(profile?.username ?? "??").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                        <FlagImg cc={profile?.country_code} size={18} />

                        <div
                          style={{
                            fontFamily: "'Cinzel', serif",
                            fontSize: "1.2rem",
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            color: "#e8e4d8",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            minWidth: 0,
                          }}
                        >
                          {loading ? "Loading..." : profile?.username ?? "—"}
                        </div>

                        {profile?.account_tier === "pro" ? <ProFlair accent={order ? orderAccent : "#d4af7a"} /> : null}
                      </div>

                      <div style={{ marginTop: 6, fontSize: "1.05rem", fontStyle: "italic", color: "#b0aa9e" }}>
                        {countryLabel}
                      </div>
                    </div>
                  </div>

                  {/* KEEP THIS SEPARATOR WHERE IT IS */}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "14px 0" }} />

                  {/* Pro bio + social icons (pro only). No boxes/borders; icons only; centered. */}
                  {isPro && (profile?.bio?.trim() || proLinks.length > 0) ? (
                    <div style={{ marginTop: -2, marginBottom: 8 }}>
                      {profile?.bio?.trim() ? <div className="pro-bio">{profile.bio.trim()}</div> : null}

                      {proLinks.length > 0 ? (
                        <div className="pro-icons" aria-label="Social links">
                          {proLinks.map((it) => (
                            <a
                              key={it.key}
                              className="pro-icon-link"
                              href={it.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={it.label}
                              title={it.label}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {it.icon}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Challenge controls */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      {(["standard", "rapid", "blitz", "daily"] as TimeControlId[]).map((tc) => (
                        <button
                          key={tc}
                          className={`format-tab${challengeTc === tc ? " active" : ""}`}
                          onClick={() => setChallengeTc(tc)}
                          disabled={loading}
                          title={`Challenge (${FORMAT_LABELS[tc]})`}
                        >
                          {FORMAT_LABELS[tc]}
                        </button>
                      ))}
                    </div>

                    <button
                      className="challenge-btn"
                      disabled={!canChallengeTarget()}
                      onClick={onChallengeClick}
                      title={
                        !userId
                          ? "Sign in to challenge"
                          : !profile
                            ? "Loading..."
                            : profile.is_ai
                              ? "AI cannot be challenged"
                              : profile.id === userId
                                ? "You cannot challenge yourself"
                                : challenged
                                  ? "Challenge sent"
                                  : challenging
                                    ? "Sending..."
                                    : `Challenge (${FORMAT_LABELS[challengeTc]})`
                      }
                    >
                      {challenged ? "Challenged" : challenging ? "Sending..." : "Challenge"}
                    </button>
                  </div>

                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "14px 0" }} />

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      marginTop: 8,
                    }}
                  >
                    {order?.sigil_url ? (
                      <img
                        src={order.sigil_url}
                        alt={order.name}
                        draggable={false}
                        style={{
                          width: 68,
                          height: 68,
                          objectFit: "contain",
                          objectPosition: "center",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 68,
                          height: 68,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "'Cinzel', serif",
                          fontSize: "2.2rem",
                          fontWeight: 700,
                          color: orderAccent,
                          flexShrink: 0,
                        }}
                      >
                        {order ? order.name.replace("Order of the ", "").slice(0, 1) : "?"}
                      </div>
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          letterSpacing: "0.4em",
                          textTransform: "uppercase",
                          color: order ? orderAccent : "#b8966a",
                          opacity: 0.85,
                          marginBottom: 4,
                        }}
                      >
                        Current Allegiance
                      </div>
                      <div
                        style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: "0.98rem",
                          fontWeight: 800,
                          color: order ? orderAccent : "#d4af7a",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {order?.name ?? "Unaligned"}
                      </div>

                      {profile?.order_joined_at ? (
                        <div style={{ marginTop: 4, color: "#6b6558", fontStyle: "italic" }}>
                          Joined {new Date(profile.order_joined_at).toLocaleDateString()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: Stats */}
            <div>
              <div className="section-label">
                Stats <div className="rule" />
              </div>

              {/* small indicator of which format the pills are showing */}
              <div
                style={{
                  marginBottom: 10,
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "#6b6558",
                }}
              >
                Showing: <span style={{ color: "#d4af7a" }}>{derived.label}</span>
              </div>

              <div className="stats-grid">
                <StatPill label="ELO" value={loading ? "—" : String(derived.elo)} customColor={eloColor(derived.elo)} />
                <StatPill label="Games" value={loading ? "—" : String(derived.games)} />
                <StatPill label="Win%" value={loading ? "—" : derived.wr == null ? "—" : pct(derived.wr)} tone="gold" />
                <StatPill label="Wins" value={loading ? "—" : String(derived.wins)} />
                <StatPill label="Losses" value={loading ? "—" : String(derived.losses)} />
                <StatPill label="Timeout L" value={loading ? "—" : String(derived.timeouts)} tone="red" />
              </div>

              <div style={{ marginTop: 12 }} className="card">
                <div className="card-pad">
                  <div
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      letterSpacing: "0.25em",
                      textTransform: "uppercase",
                      color: "#6b6558",
                      marginBottom: 8,
                    }}
                  >
                    Last Game
                  </div>
                  <div style={{ color: "#b0aa9e", fontStyle: "italic", fontSize: "1.05rem" }}>
                    {loading ? "—" : derived.lastGameAt ? new Date(derived.lastGameAt).toLocaleString() : "No games yet"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }} className="card">
                <div className="card-pad">
                  <div
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      letterSpacing: "0.25em",
                      textTransform: "uppercase",
                      color: "#6b6558",
                      marginBottom: 10,
                    }}
                  >
                    Ratings by Time Control
                  </div>

                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="th">Mode</th>
                          <th className="th">ELO</th>
                          <th className="th">Games</th>
                          <th className="th">W</th>
                          <th className="th">L</th>
                          <th className="th">Win%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          {
                            tc: "blitz" as TimeControlId,
                            mode: "Blitz",
                            elo: stats?.elo_blitz,
                            g: stats?.games_blitz,
                            w: stats?.wins_blitz,
                            l: stats?.losses_blitz,
                          },
                          {
                            tc: "rapid" as TimeControlId,
                            mode: "Rapid",
                            elo: stats?.elo_rapid,
                            g: stats?.games_rapid,
                            w: stats?.wins_rapid,
                            l: stats?.losses_rapid,
                          },
                          {
                            tc: "standard" as TimeControlId,
                            mode: "Standard",
                            elo: stats?.elo_standard,
                            g: stats?.games_standard,
                            w: stats?.wins_standard,
                            l: stats?.losses_standard,
                          },
                          {
                            tc: "daily" as TimeControlId,
                            mode: "Daily",
                            elo: stats?.elo_daily,
                            g: stats?.games_daily,
                            w: stats?.wins_daily,
                            l: stats?.losses_daily,
                          },
                        ] as const).map((r) => {
                          const w = safeInt(r.w)
                          const l = safeInt(r.l)
                          const wr = winRate(w, l)
                          const active = r.tc === challengeTc
                          return (
                            <tr key={r.mode} style={active ? { background: "rgba(184,150,106,0.06)" } : undefined}>
                              <td
                                className="td"
                                style={{
                                  fontFamily: "'Cinzel', serif",
                                  fontWeight: 800,
                                  color: active ? "#d4af7a" : "#e8e4d8",
                                }}
                              >
                                {r.mode}
                              </td>
                              <td
                                className="td"
                                style={{
                                  fontFamily: "monospace",
                                  fontWeight: 900,
                                  color: loading ? "#6b6558" : eloColor(safeInt(r.elo)),
                                }}
                              >
                                {loading ? "—" : String(safeInt(r.elo))}
                              </td>
                              <td className="td">{loading ? "—" : String(safeInt(r.g))}</td>
                              <td className="td">{loading ? "—" : String(w)}</td>
                              <td className="td">{loading ? "—" : String(l)}</td>
                              <td className="td" style={{ fontFamily: "monospace", fontWeight: 900, color: "#d4af7a" }}>
                                {loading ? "—" : wr == null ? "—" : pct(wr)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!loading && profile && !stats ? (
                    <div style={{ marginTop: 10, color: "#6b6558", fontStyle: "italic" }}>
                      No stats yet (player_stats row missing).
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />
        </div>
      </div>
    </div>
  )
}