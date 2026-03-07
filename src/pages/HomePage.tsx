import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"
import { createChallenge } from "../services/pvp"
import { AuthModal } from "../AuthModal"

type ViewerProfile = {
  id: string
  username: string
  avatar_url: string | null
  account_tier: string | null
}

type ViewerStats = {
  user_id: string
  elo: number | null
  wins_active: number | null
  losses_active: number | null
  games_played: number | null

  elo_blitz: number | null
  elo_rapid: number | null
  elo_standard: number | null
  elo_daily: number | null

  games_blitz: number | null
  games_rapid: number | null
  games_standard: number | null
  games_daily: number | null
}

type LeaderboardRow = {
  user_id: string
  username: string
  avatar_url: string | null
  country_code: string | null
  account_tier: string | null
  is_ai: boolean

  elo: number
  elo_standard: number
  elo_rapid: number
  elo_blitz: number
  elo_daily: number

  games_played: number
  games_standard: number
  games_rapid: number
  games_blitz: number
  games_daily: number

  wins_total: number
  wins_standard: number
  wins_rapid: number
  wins_blitz: number
  wins_daily: number

  losses_total: number
  losses_standard: number
  losses_rapid: number
  losses_blitz: number
  losses_daily: number
}

type Format = "standard" | "rapid" | "blitz" | "daily"

function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-home-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-home-fonts"
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

function FlagImg({ cc, size = 16 }: { cc: string | null | undefined; size?: number }) {
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

function eloColor(elo: number) {
  if (elo >= 2000) return "#D4AF37"
  if (elo >= 1750) return "#7c2d12"
  if (elo >= 1500) return "#16a34a"
  if (elo >= 1200) return "#dc2626"
  if (elo >= 900) return "#2563eb"
  return "#6b6558"
}

function eloTitle(elo: number) {
  if (elo >= 2000) return "Grandmaster"
  if (elo >= 1750) return "Senior Master"
  if (elo >= 1500) return "Master"
  if (elo >= 1200) return "Expert"
  if (elo >= 900) return "Adept"
  return "Novice"
}

function progressToNextTitle(elo: number) {
  if (elo >= 2000) return { nextTitle: "Maxed", pointsLeft: 0, progress: 1 }

  const bands = [
    { min: 0, max: 899, next: "Adept" },
    { min: 900, max: 1199, next: "Expert" },
    { min: 1200, max: 1499, next: "Master" },
    { min: 1500, max: 1749, next: "Senior Master" },
    { min: 1750, max: 1999, next: "Grandmaster" },
  ]

  for (const band of bands) {
    if (elo >= band.min && elo <= band.max) {
      const span = band.max - band.min + 1
      const progress = Math.max(0, Math.min(1, (elo - band.min) / span))
      const pointsLeft = band.max + 1 - elo
      return {
        nextTitle: band.next,
        pointsLeft,
        progress,
      }
    }
  }

  return { nextTitle: "Adept", pointsLeft: 900 - elo, progress: 0 }
}

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

function StatPill({
  label,
  value,
  tone,
  customColor,
  background,
  borderColor,
}: {
  label: string
  value: string
  tone?: "gold" | "cyan" | "red" | "neutral"
  customColor?: string
  background?: string
  borderColor?: string
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
        border: `1px solid ${borderColor ?? "rgba(255,255,255,0.07)"}`,
        borderRadius: 10,
        background: background ?? "#0f0f14",
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

function Avatar({
  username,
  avatarUrl,
  size = 32,
}: {
  username: string
  avatarUrl?: string | null
  size?: number
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: "#13131a",
        border: "1px solid rgba(184,150,106,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={username}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: `${Math.max(11, Math.round(size * 0.24))}px`,
            fontWeight: 700,
            color: "#b0aa9e",
          }}
        >
          {username.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  )
}

function HomeButton({
  children,
  onClick,
  variant = "secondary",
  full = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "ghost"
  full?: boolean
}) {

  const base: React.CSSProperties = {
    position: "relative",
    fontFamily: "'Cinzel', serif",
    borderRadius: 4,
    padding: "10px 14px",
    fontSize: "0.62rem",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    width: full ? "100%" : undefined,
    minWidth: 0,
    transition: "all 0.12s",
  }

  if (variant === "primary") {
    base.background = "rgba(184,150,106,0.10)"
    base.border = "1px solid rgba(184,150,106,0.35)"
    base.color = "#d4af7a"
  } else if (variant === "ghost") {
    base.background = "rgba(255,255,255,0.04)"
    base.border = "1px solid rgba(255,255,255,0.10)"
    base.color = "#b0aa9e"
  } else {
    base.background = "#13131a"
    base.border = "1px solid rgba(255,255,255,0.10)"
    base.color = "#e8e4d8"
  }

  return (
    <button
      onClick={() => {
        onClick?.()
      }}
      style={base}
      onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.08)" }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = "none" }}
    >
      {children}
    </button>
  )
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="section-label">
      {children}
      <div className="rule" />
    </div>
  )
}

function SurfaceCard({
  children,
  padded = true,
  topAccent,
}: {
  children: React.ReactNode
  padded?: boolean
  topAccent?: string
}) {
  return (
    <div className="card">
      {topAccent ? (
        <div
          style={{
            height: 4,
            background: `linear-gradient(90deg, transparent, ${topAccent}88, transparent)`,
          }}
        />
      ) : null}
      {padded ? <div className="card-pad">{children}</div> : children}
    </div>
  )
}

function TinyTab({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button className={`format-tab${active ? " active" : ""}`} onClick={onClick}>
      {label}
    </button>
  )
}

export default function HomePage() {
  injectFonts()

  const navigate = useNavigate()
  const isMountedRef = useRef(true)

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<ViewerProfile | null>(null)
  const [stats, setStats] = useState<ViewerStats | null>(null)

  const [ladderFormat, setLadderFormat] = useState<Format>("standard")
  const [topRows, setTopRows] = useState<LeaderboardRow[]>([])
  const [ladderLoading, setLadderLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [challenged, setChallenged] = useState<Record<string, boolean>>({})
  const [challenging, setChallenging] = useState<Record<string, boolean>>({})
  const [pvpToast, setPvpToast] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      setErr(null)
      setLoading(true)

      const { data: sess, error: sessErr } = await supabase.auth.getSession()
      if (sessErr) {
        setErr(sessErr.message)
        setLoading(false)
        return
      }

      const viewer = sess.session?.user ?? null

      if (!viewer) {
        if (!isMountedRef.current) return
        setUserId(null)
        setMe(null)
        setStats(null)
        setLoading(false)
        return
      }

      const uid = viewer.id
      setUserId(uid)

      const [{ data: p, error: pErr }, { data: s, error: sErr }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,avatar_url,account_tier")
          .eq("id", uid)
          .maybeSingle(),
        supabase
          .from("player_stats")
          .select(`
            user_id,
            elo,
            wins_active,
            losses_active,
            games_played,
            elo_blitz,
            elo_rapid,
            elo_standard,
            elo_daily,
            games_blitz,
            games_rapid,
            games_standard,
            games_daily
          `)
          .eq("user_id", uid)
          .maybeSingle(),
      ])

      if (pErr) {
        setErr(pErr.message)
        setLoading(false)
        return
      }

      if (sErr) {
        setErr(sErr.message)
        setLoading(false)
        return
      }

      if (!isMountedRef.current) return

      setMe((p as ViewerProfile | null) ?? null)
      setStats((s as ViewerStats | null) ?? null)
      setLoading(false)
    })().catch((e: any) => {
      setErr(e?.message ?? String(e))
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUserId(null)
        setMe(null)
        setStats(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const eloCol =
      ladderFormat === "blitz"
        ? "elo_blitz"
        : ladderFormat === "rapid"
          ? "elo_rapid"
          : ladderFormat === "daily"
            ? "elo_daily"
            : "elo_standard"

    ;(async () => {
      setLadderLoading(true)

      const { data: statsData, error: statsErr } = await supabase
        .from("player_stats")
        .select(`
          user_id,
          elo, elo_standard, elo_rapid, elo_blitz, elo_daily,
          games_played, games_standard, games_rapid, games_blitz, games_daily,
          wins_standard, wins_rapid, wins_blitz, wins_daily,
          losses_standard, losses_rapid, losses_blitz, losses_daily
        `)
        .gt(eloCol, 0)
        .order(eloCol, { ascending: false })
        .limit(50)

      if (statsErr) {
        if (!isMountedRef.current) return
        setErr((prev) => prev ?? statsErr.message)
        setTopRows([])
        setLadderLoading(false)
        return
      }

      if (!statsData?.length) {
        if (!isMountedRef.current) return
        setTopRows([])
        setLadderLoading(false)
        return
      }

      const ids = statsData.map((r: any) => r.user_id)

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, country_code, is_ai, account_tier")
        .in("id", ids)
        .eq("is_ai", false)

      if (profileErr) {
        if (!isMountedRef.current) return
        setErr((prev) => prev ?? profileErr.message)
        setTopRows([])
        setLadderLoading(false)
        return
      }

      const profileMap = new Map<string, any>()
      for (const p of profileData ?? []) profileMap.set(p.id, p)

      const merged: LeaderboardRow[] = statsData
        .filter((s: any) => profileMap.has(s.user_id))
        .map((s: any) => {
          const p = profileMap.get(s.user_id) ?? {}

          const winsStandard = safeInt(s.wins_standard)
          const winsRapid = safeInt(s.wins_rapid)
          const winsBlitz = safeInt(s.wins_blitz)
          const winsDaily = safeInt(s.wins_daily)

          const lossesStandard = safeInt(s.losses_standard)
          const lossesRapid = safeInt(s.losses_rapid)
          const lossesBlitz = safeInt(s.losses_blitz)
          const lossesDaily = safeInt(s.losses_daily)

          return {
            user_id: s.user_id,
            username: p.username ?? "Unknown",
            avatar_url: p.avatar_url ?? null,
            country_code: p.country_code ?? null,
            account_tier: p.account_tier ?? null,
            is_ai: !!p.is_ai,

            elo: safeInt(s.elo),
            elo_standard: safeInt(s.elo_standard),
            elo_rapid: safeInt(s.elo_rapid),
            elo_blitz: safeInt(s.elo_blitz),
            elo_daily: safeInt(s.elo_daily),

            games_played: safeInt(s.games_played),
            games_standard: safeInt(s.games_standard),
            games_rapid: safeInt(s.games_rapid),
            games_blitz: safeInt(s.games_blitz),
            games_daily: safeInt(s.games_daily),

            wins_total: winsStandard + winsRapid + winsBlitz + winsDaily,
            wins_standard: winsStandard,
            wins_rapid: winsRapid,
            wins_blitz: winsBlitz,
            wins_daily: winsDaily,

            losses_total: lossesStandard + lossesRapid + lossesBlitz + lossesDaily,
            losses_standard: lossesStandard,
            losses_rapid: lossesRapid,
            losses_blitz: lossesBlitz,
            losses_daily: lossesDaily,
          }
        })

      if (!isMountedRef.current) return
      setTopRows(merged.slice(0, 6))
      setLadderLoading(false)
    })().catch((e: any) => {
      if (!isMountedRef.current) return
      setErr((prev) => prev ?? (e?.message ?? String(e)))
      setTopRows([])
      setLadderLoading(false)
    })
  }, [ladderFormat])

  function rowElo(r: LeaderboardRow) {
    if (ladderFormat === "blitz") return r.elo_blitz
    if (ladderFormat === "rapid") return r.elo_rapid
    if (ladderFormat === "daily") return r.elo_daily
    return r.elo_standard
  }

  function rowGames(r: LeaderboardRow) {
    if (ladderFormat === "blitz") return r.games_blitz
    if (ladderFormat === "rapid") return r.games_rapid
    if (ladderFormat === "daily") return r.games_daily
    return r.games_standard
  }

  function rowWins(r: LeaderboardRow) {
    if (ladderFormat === "blitz") return r.wins_blitz
    if (ladderFormat === "rapid") return r.wins_rapid
    if (ladderFormat === "daily") return r.wins_daily
    return r.wins_standard
  }

  function rowLosses(r: LeaderboardRow) {
    if (ladderFormat === "blitz") return r.losses_blitz
    if (ladderFormat === "rapid") return r.losses_rapid
    if (ladderFormat === "daily") return r.losses_daily
    return r.losses_standard
  }

  const FORMAT_LABELS: Record<Format, string> = {
    standard: "Standard",
    rapid: "Rapid",
    blitz: "Blitz",
    daily: "Daily",
  }

  const isPro = me?.account_tier === "pro"

  function canChallengeRow(userId_: string | null, r: LeaderboardRow) {
    if (r.user_id === userId_) return false
    if (r.is_ai) return false
    if (challenged[r.user_id]) return false
    if (challenging[r.user_id]) return false
    return true
  }

  async function onChallengeClick(r: LeaderboardRow) {
    if (!userId) { setShowAuthModal(true); return }
    if (!canChallengeRow(userId, r)) return
    setChallenging((m) => ({ ...m, [r.user_id]: true }))
    try {
      await createChallenge({ invitedUserId: r.user_id, timeControlId: "standard" })
      setChallenged((m) => ({ ...m, [r.user_id]: true }))
    } finally {
      setChallenging((m) => ({ ...m, [r.user_id]: false }))
    }
  }
  const myElo = safeInt(stats?.elo)
  const myWins = safeInt(stats?.wins_active)
  const myLosses = safeInt(stats?.losses_active)
  const myGames = safeInt(stats?.games_played)
  const myWr = winRate(myWins, myLosses)
  const myTitle = eloTitle(myElo)

  const nextTitle = useMemo(() => progressToNextTitle(myElo), [myElo])

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

        .vk-container { padding: 18px 12px 48px; max-width: 1180px; margin: 0 auto; width: 100%; }
        @media (min-width: 700px) {
          .vk-container { padding: 28px 24px 60px; }
        }

        .home-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          align-items: start;
        }

        @media (min-width: 980px) {
          .home-grid {
            grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.95fr);
            gap: 24px;
          }
        }

        .left-stack,
        .right-stack {
          display: grid;
          gap: 20px;
          min-width: 0;
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

        .rule {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.07);
        }

        .card {
          border: 1px solid rgba(255,255,255,0.07);
          background: #0f0f14;
          border-radius: 12px;
          overflow: hidden;
          min-width: 0;
        }

        .card-pad { padding: 14px; }
        @media (min-width: 700px) { .card-pad { padding: 16px; } }

        .hero-actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 16px;
        }

        @media (min-width: 640px) {
          .hero-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        @media (min-width: 720px) {
          .stats-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

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

        .format-tabs-row {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 12px;
        }

        .ladder-row {
          display: grid;
          grid-template-columns: 34px 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.07);
          background: #111118;
          min-width: 0;
          cursor: pointer;
        }

        .ladder-row:hover {
          background: rgba(255,255,255,0.03);
        }

        .challenge-btn {
          font-family: 'Cinzel', serif;
          background: rgba(184,150,106,0.10);
          border: 1px solid rgba(184,150,106,0.35);
          color: #d4af7a;
          border-radius: 4px;
          padding: 6px 10px;
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

        .sticky-rail {
          position: static;
        }

        @media (min-width: 980px) {
          .sticky-rail {
            position: sticky;
            top: 12px;
          }
        }

        @media (max-width: 640px) {
          .vk-container {
            padding-left: 10px;
            padding-right: 10px;
          }

          .card-pad {
            padding: 12px;
          }

          .section-label {
            letter-spacing: 0.32em;
          }
        }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel="Home"
        elo={typeof stats?.elo === "number" ? stats.elo : undefined}
        activePage="play"
        myGamesTurnCount={0}
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

          <SectionLabel>Hall</SectionLabel>
          <SurfaceCard topAccent="#b8966a">
            <div style={{ position: "relative", overflow: "visible" }}>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(circle at 18% 20%, rgba(184,150,106,0.10), transparent 34%), radial-gradient(circle at 82% 10%, rgba(93,232,247,0.08), transparent 28%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative" }}>
                <div
                  style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.34em",
                    textTransform: "uppercase",
                    color: "#6b6558",
                    marginBottom: 10,
                  }}
                >
                  Competitive Portal
                </div>

                <div
                  style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: "clamp(1.6rem, 3.2vw, 2.8rem)",
                    fontWeight: 800,
                    lineHeight: 1.08,
                    color: "#e8e4d8",
                  }}
                >
                  Master routes, pressure, reinforcements, and sieges.
                </div>

                <div
                  style={{
                    marginTop: 12,
                    maxWidth: 760,
                    fontSize: "1.1rem",
                    lineHeight: 1.55,
                    color: "#b0aa9e",
                  }}
                >
                  Vekke is a modern abstract strategy game built for ranked play, positional warfare, and hard-earned mastery.
                </div>

                <div className="hero-actions">
                  <HomeButton variant="primary" onClick={() => setPvpToast(true)}>
                    Play vs Player
                  </HomeButton>
                  <HomeButton variant="secondary" onClick={() => navigate("/play?openNewGame=1")}>
                    Play vs Computer
                  </HomeButton>
                  <HomeButton variant="ghost" onClick={() => navigate("/tutorial")}>
                    Tutorial
                  </HomeButton>
                </div>
              </div>
            </div>
          </SurfaceCard>

          <div style={{ height: 20 }} />

          <div className="home-grid">
            <div className="left-stack">
              <div>
                <SectionLabel>Top Rated</SectionLabel>
                <SurfaceCard>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      marginBottom: 12,
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
                      }}
                    >
                      Showing: <span style={{ color: "#d4af7a" }}>{FORMAT_LABELS[ladderFormat]}</span>
                    </div>

                    <div className="format-tabs-row" style={{ marginBottom: 0 }}>
                      {(["standard", "rapid", "blitz", "daily"] as Format[]).map((f) => (
                        <TinyTab
                          key={f}
                          active={ladderFormat === f}
                          label={FORMAT_LABELS[f]}
                          onClick={() => setLadderFormat(f)}
                        />
                      ))}
                      <HomeButton variant="ghost" onClick={() => navigate("/leaderboard")}>
                        View All
                      </HomeButton>
                    </div>
                  </div>

                  {ladderLoading ? (
                    <div
                      style={{
                        padding: "24px 0 8px",
                        textAlign: "center",
                        fontFamily: "'Cinzel', serif",
                        fontSize: "0.72rem",
                        letterSpacing: "0.4em",
                        textTransform: "uppercase",
                        color: "#6b6558",
                      }}
                    >
                      Loading...
                    </div>
                  ) : topRows.length === 0 ? (
                    <div
                      style={{
                        padding: "8px 0",
                        color: "#6b6558",
                        fontStyle: "italic",
                        fontSize: "1.05rem",
                      }}
                    >
                      No ranked players yet for {FORMAT_LABELS[ladderFormat]}.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {topRows.map((r, i) => {
                        const elo = rowElo(r)
                        const games = rowGames(r)
                        const wins = rowWins(r)
                        const losses = rowLosses(r)
                        const wr = winRate(wins, losses)

                        return (
                          <div
                            key={r.user_id}
                            className="ladder-row"
                            onClick={() => navigate(`/u/${encodeURIComponent(r.username)}`)}
                          >
                            <div
                              style={{
                                fontFamily: "'Cinzel', serif",
                                color: i < 3 ? "#d4af7a" : "#6b6558",
                                fontWeight: 700,
                              }}
                            >
                              #{i + 1}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <Avatar username={r.username} avatarUrl={r.avatar_url} size={32} />
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <FlagImg cc={r.country_code} size={14} />
                                  <span
                                    style={{
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: "0.88rem",
                                      fontWeight: 600,
                                      letterSpacing: "0.04em",
                                      color: "#e8e4d8",
                                    }}
                                  >
                                    {r.username}
                                  </span>
                                  {r.account_tier === "pro" ? <ProFlair /> : null}
                                </div>

                                <div
                                  style={{
                                    marginTop: 3,
                                    fontSize: "0.95rem",
                                    color: "#b0aa9e",
                                    fontStyle: "italic",
                                    display: "flex",
                                    gap: 10,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span>{eloTitle(elo)}</span>
                                  <span style={{ opacity: 0.45 }}>•</span>
                                  <span>{games} games</span>
                                  <span style={{ opacity: 0.45 }}>•</span>
                                  <span>{wr == null ? "—" : pct(wr)} win rate</span>
                                </div>
                              </div>
                            </div>

                            <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  fontFamily: "monospace",
                                  fontWeight: 900,
                                  color: eloColor(elo),
                                }}
                              >
                                {elo}
                              </div>
                              {!r.is_ai && r.user_id !== userId && (
                                <button
                                  className="challenge-btn"
                                  disabled={!!challenged[r.user_id] || !!challenging[r.user_id]}
                                  onClick={(e) => { e.stopPropagation(); onChallengeClick(r) }}
                                >
                                  {!userId ? "Login to Challenge" : challenged[r.user_id] ? "Challenged" : challenging[r.user_id] ? "Sending..." : "Challenge"}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </SurfaceCard>
              </div>

              <div>
                <SectionLabel>Activity</SectionLabel>
                <SurfaceCard>
                  <div
                    style={{
                      color: "#b0aa9e",
                      fontSize: "1.05rem",
                      lineHeight: 1.55,
                    }}
                  >
                    Live activity is not wired yet in this version. Once you show me the actual game/result source you want to use, I can plug in:
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      color: "#6b6558",
                      fontStyle: "italic",
                      lineHeight: 1.55,
                    }}
                  >
                    recent results, promotions, active matches, challenge activity, or a real tournament feed.
                  </div>
                </SurfaceCard>
              </div>
            </div>

            <div className="right-stack sticky-rail">
              <div>
                <SectionLabel>Your Progress</SectionLabel>
                <SurfaceCard topAccent="#b8966a">
                  {userId && me ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar username={me.username} avatarUrl={me.avatar_url} size={64} />

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                fontFamily: "'Cinzel', serif",
                                fontSize: "1.12rem",
                                fontWeight: 800,
                                letterSpacing: "0.04em",
                                color: "#e8e4d8",
                              }}
                            >
                              {me.username}
                            </div>

                            {isPro ? <ProFlair /> : null}
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              color: "#b0aa9e",
                              fontStyle: "italic",
                              fontSize: "1.02rem",
                            }}
                          >
                            {loading ? "Loading..." : `${myTitle} · ${myElo}`}
                          </div>
                        </div>
                      </div>

                      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "14px 0" }} />

                      <div className="stats-grid">
                        <StatPill label="ELO" value={loading ? "—" : String(myElo)} customColor={eloColor(myElo)} />
                        <StatPill label="Games" value={loading ? "—" : String(myGames)} />
                        <StatPill label="Win%" value={loading ? "—" : myWr == null ? "—" : pct(myWr)} tone="gold" />
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                            marginBottom: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <div
                            style={{
                              fontFamily: "'Cinzel', serif",
                              fontSize: "0.62rem",
                              letterSpacing: "0.20em",
                              textTransform: "uppercase",
                              color: "#6b6558",
                            }}
                          >
                            Next Title
                          </div>

                          <div
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 800,
                              color: "#d4af7a",
                              fontSize: "0.95rem",
                            }}
                          >
                            {nextTitle.nextTitle} · {nextTitle.pointsLeft} pts
                          </div>
                        </div>

                        <div
                          style={{
                            width: "100%",
                            height: 12,
                            borderRadius: 999,
                            overflow: "hidden",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(6, Math.round(nextTitle.progress * 100))}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, rgba(184,150,106,0.50), rgba(212,175,122,0.92))",
                            }}
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 10,
                          marginTop: 14,
                        }}
                      >
                        <HomeButton
                          variant="secondary"
                          onClick={() => navigate(`/u/${encodeURIComponent(me.username)}`)}
                        >
                          Profile
                        </HomeButton>
                        <HomeButton variant="ghost" onClick={() => navigate("/?openProfile=1")}>
                          {isPro ? "Manage Pro" : "Upgrade"}
                        </HomeButton>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          color: "#b0aa9e",
                          fontSize: "1.06rem",
                          lineHeight: 1.5,
                        }}
                      >
                        Sign in to track your Elo, titles, game history, and progress.
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <HomeButton
                          variant="primary"
                          full
                          onClick={() => {
                            setShowAuthModal(true)
                          }}
                        >
                          Sign In
                        </HomeButton>
                      </div>
                    </>
                  )}
                </SurfaceCard>
              </div>

              <div>
                <SectionLabel>Learn</SectionLabel>
                <SurfaceCard>
                  <div
                    style={{
                      color: "#b0aa9e",
                      fontSize: "1.05rem",
                      lineHeight: 1.55,
                    }}
                  >
                    New to Vekke? Learn the rules, play the tutorial, and study the competitive ladder.
                  </div>

                  <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                    <HomeButton variant="secondary" full onClick={() => navigate("/rules")}>
                      Rules
                    </HomeButton>
                    <HomeButton variant="secondary" full onClick={() => navigate("/tutorial")}>
                      Tutorial
                    </HomeButton>
                    <HomeButton variant="ghost" full onClick={() => navigate("/leaderboard")}>
                      Leaderboard
                    </HomeButton>
                  </div>
                </SurfaceCard>
              </div>

              <div>
                <SectionLabel>About</SectionLabel>
                <SurfaceCard>
                  <div
                    style={{
                      color: "#b0aa9e",
                      fontSize: "1.05rem",
                      lineHeight: 1.6,
                    }}
                  >
                    Vekke is a serious abstract strategy game built around routes, sieges, reinforcement timing, and positional control.
                    <div style={{ marginTop: 10, color: "#6b6558", fontStyle: "italic" }}>
                      Governed by the International Vekke Council.
                    </div>
                  </div>
                </SurfaceCard>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />
        </div>
      </div>

      {pvpToast && (
        <div
          onClick={() => setPvpToast(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#13131a",
              border: "1px solid rgba(184,150,106,0.35)",
              borderRadius: 10,
              padding: "28px 36px",
              maxWidth: 440,
              textAlign: "center",
            }}
          >
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#b8966a",
              marginBottom: 12,
            }}>
              Coming Soon
            </div>
            <div style={{
              fontFamily: "'EB Garamond', serif",
              fontSize: "1.05rem",
              color: "#b0aa9e",
              lineHeight: 1.6,
              marginBottom: 24,
            }}>
              Matchmaking is not yet available. Challenge players directly from the Leaderboard or their profile — or play one of our AI opponents, each with a unique playstyle and Elo rating, or sharpen your game with Puzzles.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
              <button
                onClick={() => { setPvpToast(false); navigate("/play?openNewGame=1") }}
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  padding: "9px 22px",
                  borderRadius: 4,
                  background: "#13131a",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "#e8e4d8",
                  cursor: "pointer",
                }}
              >
                Play vs Computer
              </button>
              <button
                onClick={() => { setPvpToast(false); navigate("/puzzles") }}
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  padding: "9px 22px",
                  borderRadius: 4,
                  background: "rgba(184,150,106,0.10)",
                  border: "1px solid rgba(184,150,106,0.35)",
                  color: "#d4af7a",
                  cursor: "pointer",
                }}
              >
                Try Puzzles
              </button>
            </div>
            <button
              onClick={() => setPvpToast(false)}
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "0.6rem",
                fontWeight: 600,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "6px 14px",
                borderRadius: 4,
                background: "transparent",
                border: "none",
                color: "#6b6558",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "24px",
        textAlign: "center",
        fontFamily: "'Cinzel', serif",
        fontSize: "0.58rem",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "#3a3830",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        flexWrap: "wrap",
      }}>
        <span>© {new Date().getFullYear()} Vekke</span>
        <a href="/privacy.html" style={{ color: "#4a4540", textDecoration: "none" }}>Privacy Policy</a>
        <a href="https://rules.vekke.net" target="_blank" rel="noopener noreferrer" style={{ color: "#4a4540", textDecoration: "none" }}>Rules</a>
      </footer>
    </div>
  )
}