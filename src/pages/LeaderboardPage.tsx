// src/pages/LeaderboardPage.tsx
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { getLeaderboardFull } from "../services/elo"
import { Header } from "../components/Header"
import { ChallengeButton } from "../components/ChallengeButton"
import { AuthModal } from "../AuthModal"

type TimeControl = "standard" | "rapid" | "blitz" | "daily"
type Format = "all" | TimeControl

type LeaderboardRow = {
  user_id: string
  username: string
  avatar_url: string | null
  country_code: string | null
  account_tier: string | null

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

  wins_siegemate: number
  wins_elimination: number
  wins_collapse: number

  losses_timeout: number
  resignations: number
  wins_by_opponent_resign: number

  is_ai: boolean
}

type VictoryBucket =
  | "Siegemate"
  | "Elimination"
  | "Collapse"
  | "Timeout"
  | "Resignation"

type VictoryCounts = Record<VictoryBucket, number>

function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-lb-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-lb-fonts"
  link.rel = "stylesheet"
  link.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
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

function safeInt(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function emptyVictoryCounts(): VictoryCounts {
  return {
    Siegemate: 0,
    Elimination: 0,
    Collapse: 0,
    Timeout: 0,
    Resignation: 0,
  }
}

function normalizeEndReason(raw: string | null | undefined): VictoryBucket | null {
  const v = (raw ?? "").trim().toLowerCase()
  if (!v) return null

  if (v === "siegemate") return "Siegemate"
  if (v === "elimination") return "Elimination"
  if (v === "collapse") return "Collapse"

  if (
    v === "timeout" ||
    v === "time_out" ||
    v === "time-out" ||
    v === "flag" ||
    v === "on_time"
  ) {
    return "Timeout"
  }

  if (
    v === "resign" ||
    v === "resignation" ||
    v === "resigned"
  ) {
    return "Resignation"
  }

  return null
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
      style={{ display: "inline-block", verticalAlign: "middle", borderRadius: 2, flexShrink: 0 }}
      onError={(e) => {
        e.currentTarget.style.display = "none"
      }}
    />
  )
}

function RankBadge({ rank }: { rank: number }) {
  const gold = rank === 1
  const silver = rank === 2
  const bronze = rank === 3
  const color = gold ? "#D4AF37" : silver ? "#C0C0C0" : bronze ? "#CD7F32" : "#6b6558"
  const bg = gold
    ? "rgba(212,175,55,0.12)"
    : silver
      ? "rgba(192,192,192,0.08)"
      : bronze
        ? "rgba(205,127,50,0.08)"
        : "transparent"
  return (
    <div
      style={{
        fontFamily: "'Cinzel', serif",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        color,
        background: bg,
        borderRadius: 4,
        padding: "2px 6px",
        minWidth: 28,
        textAlign: "center",
      }}
    >
      {rank}
    </div>
  )
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
        marginLeft: 8,
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

function overallElo(r: LeaderboardRow): number {
  return Math.max(
    safeInt(r.elo_standard),
    safeInt(r.elo_rapid),
    safeInt(r.elo_blitz),
    safeInt(r.elo_daily),
    safeInt(r.elo),
  )
}

function overallGames(r: LeaderboardRow): number {
  return (
    safeInt(r.games_standard) +
    safeInt(r.games_rapid) +
    safeInt(r.games_blitz) +
    safeInt(r.games_daily)
  )
}

function overallWins(r: LeaderboardRow): number {
  return (
    safeInt(r.wins_standard) +
    safeInt(r.wins_rapid) +
    safeInt(r.wins_blitz) +
    safeInt(r.wins_daily)
  )
}

function overallLosses(r: LeaderboardRow): number {
  return (
    safeInt(r.losses_standard) +
    safeInt(r.losses_rapid) +
    safeInt(r.losses_blitz) +
    safeInt(r.losses_daily)
  )
}

export function LeaderboardPage() {
  injectFonts()
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [format, setFormat] = useState<Format>("all")
  const [showAI, setShowAI] = useState(false)
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [victoryCounts, setVictoryCounts] = useState<VictoryCounts>(emptyVictoryCounts())

  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const uid = data.session.user.id
      setUserId(uid)
      const { data: myp } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", uid)
        .single()
      if (myp) setMe(myp as any)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    setErr(null)

    ;(async () => {
      const statsData = await getLeaderboardFull(200)

      if (!statsData?.length) {
        setRows([])
        setLoading(false)
        return
      }

      const ids = statsData.map((r: any) => r.user_id)
      let profileQuery = supabase
        .from("profiles")
        .select("id, username, avatar_url, country_code, is_ai, account_tier")
        .in("id", ids)

      if (!showAI) profileQuery = profileQuery.eq("is_ai", false)

      const { data: profileData, error: profileErr } = await profileQuery
      if (profileErr) {
        setErr(profileErr.message)
        setLoading(false)
        return
      }

      const profileMap = new Map<string, any>()
      for (const p of profileData ?? []) profileMap.set(p.id, p)

      let merged: LeaderboardRow[] = statsData
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

            wins_total: safeInt(s.wins_total) || (winsStandard + winsRapid + winsBlitz + winsDaily),
            wins_standard: winsStandard,
            wins_rapid: winsRapid,
            wins_blitz: winsBlitz,
            wins_daily: winsDaily,

            losses_total: safeInt(s.losses_total) || (lossesStandard + lossesRapid + lossesBlitz + lossesDaily),
            losses_standard: lossesStandard,
            losses_rapid: lossesRapid,
            losses_blitz: lossesBlitz,
            losses_daily: lossesDaily,

            wins_siegemate: safeInt(s.wins_siegemate),
            wins_elimination: safeInt(s.wins_elimination),
            wins_collapse: safeInt(s.wins_collapse),

            losses_timeout: safeInt(s.losses_timeout),
            resignations: safeInt(s.losses_resign),
            wins_by_opponent_resign: safeInt(s.wins_resign),

            is_ai: !!p.is_ai,
            account_tier: (p.account_tier ?? null) as any,
          }
        })

      if (format === "all") {
        merged = merged
          .filter((r) => overallGames(r) > 0)
          .sort((a, b) => {
            const eloDiff = overallElo(b) - overallElo(a)
            if (eloDiff !== 0) return eloDiff

            const winsDiff = overallWins(b) - overallWins(a)
            if (winsDiff !== 0) return winsDiff

            const gamesDiff = overallGames(b) - overallGames(a)
            if (gamesDiff !== 0) return gamesDiff

            return a.username.localeCompare(b.username)
          })
          .slice(0, 100)
      } else {
        const eloCol: keyof LeaderboardRow =
          format === "blitz" ? "elo_blitz"
          : format === "rapid" ? "elo_rapid"
          : format === "daily" ? "elo_daily"
          : "elo_standard"

        merged = merged
          .filter((r) => (r[eloCol] as number) > 0)
          .sort((a, b) => (b[eloCol] as number) - (a[eloCol] as number))
          .slice(0, 100)
      }

      setRows(merged)
      setLoading(false)
    })()
  }, [format, showAI])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const counts = emptyVictoryCounts()

      let query = supabase
        .from("games")
        .select("end_reason")
        .not("winner_id", "is", null)
        .not("end_reason", "is", null)

      if (format !== "all") {
        query = query.eq("format", format)
      }

      const { data, error } = await query

      if (cancelled) return

      if (error) {
        setErr((prev) => prev ?? error.message)
        setVictoryCounts(counts)
        return
      }

      for (const g of data ?? []) {
        const bucket = normalizeEndReason((g as any).end_reason)
        if (bucket) counts[bucket] += 1
      }

      setVictoryCounts(counts)
    })()

    return () => {
      cancelled = true
    }
  }, [format])

  function rowElo(r: LeaderboardRow): number {
    if (format === "all") return overallElo(r)
    if (format === "blitz") return r.elo_blitz
    if (format === "rapid") return r.elo_rapid
    if (format === "daily") return r.elo_daily
    return r.elo_standard
  }

  function rowGames(r: LeaderboardRow): number {
    if (format === "all") return overallGames(r)
    if (format === "blitz") return r.games_blitz
    if (format === "rapid") return r.games_rapid
    if (format === "daily") return r.games_daily
    return r.games_standard
  }

  function rowWins(r: LeaderboardRow): number {
    if (format === "all") return overallWins(r)
    if (format === "blitz") return r.wins_blitz
    if (format === "rapid") return r.wins_rapid
    if (format === "daily") return r.wins_daily
    return r.wins_standard
  }

  function rowLosses(r: LeaderboardRow): number {
    if (format === "all") return overallLosses(r)
    if (format === "blitz") return r.losses_blitz
    if (format === "rapid") return r.losses_rapid
    if (format === "daily") return r.losses_daily
    return r.losses_standard
  }

  const FORMAT_LABELS: Record<Format, string> = {
    all: "All",
    standard: "Standard",
    rapid: "Rapid",
    blitz: "Blitz",
    daily: "Daily",
  }

  const victoryModel = useMemo(() => {
    const COLORS = {
      tip: "#c77a2c",
      warning: "#ee484c",
      important: "#355e3b",
      strategy: "#2f4f6b",
      lore: "#1f5c5b",
    }

    const items = [
      {
        key: "Siegemate" as const,
        color: COLORS.lore,
        bg: "rgba(31,92,91,0.10)",
        border: "rgba(31,92,91,0.30)",
        total: victoryCounts.Siegemate,
      },
      {
        key: "Elimination" as const,
        color: COLORS.warning,
        bg: "rgba(238,72,76,0.08)",
        border: "rgba(238,72,76,0.30)",
        total: victoryCounts.Elimination,
      },
      {
        key: "Collapse" as const,
        color: COLORS.tip,
        bg: "rgba(199,122,44,0.08)",
        border: "rgba(199,122,44,0.28)",
        total: victoryCounts.Collapse,
      },
      {
        key: "Timeout" as const,
        color: COLORS.strategy,
        bg: "rgba(47,79,107,0.10)",
        border: "rgba(47,79,107,0.28)",
        total: victoryCounts.Timeout,
      },
      {
        key: "Resignation" as const,
        color: COLORS.important,
        bg: "rgba(53,94,59,0.10)",
        border: "rgba(53,94,59,0.28)",
        total: victoryCounts.Resignation,
      },
    ]

    const grand = items.reduce((s, it) => s + it.total, 0)

    let acc = 0
    const stops = items.map((it) => {
      const pct = grand > 0 ? (it.total / grand) * 100 : 0
      const start = acc
      const end = acc + pct
      acc = end
      return { ...it, pct, start, end }
    })

    const gradient =
      grand > 0
        ? `conic-gradient(${stops
            .map((s) => `${s.color} ${s.start.toFixed(3)}% ${s.end.toFixed(3)}%`)
            .join(", ")})`
        : "conic-gradient(rgba(255,255,255,0.06) 0% 100%)"

    return { items: stops, grand, gradient }
  }, [victoryCounts])

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

        .lb-th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #6b6558;
          white-space: nowrap;
          background: #0d0d10;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .lb-td {
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          color: #b0aa9e;
          white-space: nowrap;
        }
        .lb-row:hover { background: rgba(255,255,255,0.02); }
        .lb-row-me { background: rgba(93,232,247,0.03) !important; }
        .lb-row-me td { border-bottom-color: rgba(93,232,247,0.1) !important; }

        .lb-mobile-sub { display: none; }
        .lb-challenge-short { display: none; }
        @media (max-width: 640px) {
          .lb-mobile-sub { display: inline; }
        }
        @media (max-width: 640px) {
          .lb-challenge-full { display: none; }
          .lb-challenge-short { display: inline; }
          .lb-col-rank { width: 1%; white-space: nowrap; }
          .lb-col-player { width: 100%; }
          .lb-col-rating { width: 1%; white-space: nowrap; }
          .lb-col-challenge { width: 1%; white-space: nowrap; }
          .lb-col-title,
          .lb-col-games,
          .lb-col-wl,
          .lb-col-winpct { display: none; }
          .lb-td, .lb-th { padding: 10px 8px; }
          .lb-td:first-child, .lb-th:first-child { padding-left: 10px; }
        }

        .format-tab {
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 7px 14px;
          border-radius: 4px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.12s;
          background: transparent;
          color: #6b6558;
        }
        .format-tab:hover { color: #b0aa9e; background: rgba(255,255,255,0.04); }
        .format-tab.active {
          color: #d4af7a;
          background: rgba(184,150,106,0.10);
          border-color: rgba(184,150,106,0.30);
        }

        @media (max-width: 640px) {
          .challenge-btn {
            padding: 6px 8px;
            font-size: 0.5rem;
            letter-spacing: 0.08em;
          }
        }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel="Leaderboard"
        elo={undefined}
        activePage="leaderboard"
        myGamesTurnCount={0}
      />

      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "28px 16px 60px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "1.3rem",
                fontWeight: 700,
                color: "#e8e4d8",
                letterSpacing: "0.06em",
              }}
            >
              Leaderboard
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(["all", "standard", "rapid", "blitz", "daily"] as Format[]).map((f) => (
                <button key={f} className={`format-tab${format === f ? " active" : ""}`} onClick={() => setFormat(f)}>
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowAI((v) => !v)}
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "0.6rem",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                padding: "7px 14px",
                borderRadius: 4,
                cursor: "pointer",
                transition: "all 0.12s",
                background: showAI ? "rgba(93,232,247,0.06)" : "transparent",
                border: showAI ? "1px solid rgba(93,232,247,0.35)" : "1px solid rgba(255,255,255,0.12)",
                color: showAI ? "#5de8f7" : "#6b6558",
              }}
            >
              {showAI ? "Hide AI" : "Show AI"}
            </button>
          </div>

          {err && (
            <div
              style={{
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: "0.95rem",
                color: "#f87171",
                marginBottom: 16,
                padding: "10px 14px",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 6,
                background: "rgba(239,68,68,0.06)",
              }}
            >
              {err}
            </div>
          )}

          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "0.85rem",
              fontWeight: 600,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#b8966a",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {FORMAT_LABELS[format]} Rankings
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              overflow: "hidden",
              background: "#0f0f14",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 0, tableLayout: "auto" }}>
                <thead>
                  <tr>
                    <th className="lb-th lb-col-rank" style={{ width: 48 }}>
                      #
                    </th>
                    <th className="lb-th lb-col-player">Player</th>
                    <th className="lb-th lb-col-rating">Rating</th>
                    <th className="lb-th lb-col-title">Title</th>
                    <th className="lb-th lb-col-games">Games</th>
                    <th className="lb-th lb-col-wl">W / L</th>
                    <th className="lb-th lb-col-winpct">Win %</th>
                    <th className="lb-th lb-col-challenge" style={{ width: 130 }}>
                      <span className="lb-challenge-full">Challenge</span>
                      <span className="lb-challenge-short">vs</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "48px 24px", textAlign: "center" }}>
                        <span
                          style={{
                            fontFamily: "'Cinzel', serif",
                            fontSize: "0.72rem",
                            letterSpacing: "0.4em",
                            textTransform: "uppercase",
                            color: "#6b6558",
                          }}
                        >
                          Loading...
                        </span>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "48px 24px", textAlign: "center" }}>
                        <span
                          style={{
                            fontFamily: "'EB Garamond', Georgia, serif",
                            fontSize: "1.1rem",
                            fontStyle: "italic",
                            color: "#6b6558",
                          }}
                        >
                          No ranked players yet for {FORMAT_LABELS[format]}.
                        </span>
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const elo = rowElo(r)
                      const games = rowGames(r)
                      const wins = rowWins(r)
                      const losses = rowLosses(r)
                      const wr = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null
                      const isMe = r.user_id === userId
                      const challengeFormat: TimeControl = format === "all" ? "standard" : format

                      return (
                        <tr
                          key={r.user_id}
                          className={`lb-row${isMe ? " lb-row-me" : ""}`}
                          style={{ cursor: "pointer" }}
                          onClick={() => navigate(`/u/${encodeURIComponent(r.username)}`)}
                        >
                          <td className="lb-td lb-col-rank" style={{ paddingLeft: 16 }}>
                            <RankBadge rank={i + 1} />
                          </td>

                          <td className="lb-td">
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
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
                                {r.avatar_url ? (
                                  <img
                                    src={r.avatar_url}
                                    alt={r.username}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                ) : (
                                  <span
                                    style={{
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      color: "#b0aa9e",
                                    }}
                                  >
                                    {r.username.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <div>
                                <div
                                  style={{
                                    fontFamily: "'Cinzel', serif",
                                    fontSize: "0.88rem",
                                    fontWeight: 600,
                                    letterSpacing: "0.04em",
                                    color: isMe ? "#5de8f7" : "#e8e4d8",
                                  }}
                                >
                                  {r.username}
                                  {r.account_tier === "pro" ? <ProFlair /> : null}
                                  {isMe && (
                                    <span
                                      style={{
                                        fontFamily: "'Cinzel', serif",
                                        fontSize: "0.5rem",
                                        letterSpacing: "0.2em",
                                        color: "#5de8f7",
                                        marginLeft: 8,
                                        opacity: 0.7,
                                      }}
                                    >
                                      YOU
                                    </span>
                                  )}
                                  {r.is_ai && (
                                    <span
                                      style={{
                                        fontFamily: "'Cinzel', serif",
                                        fontSize: "0.5rem",
                                        letterSpacing: "0.2em",
                                        color: "#b8966a",
                                        marginLeft: 8,
                                        opacity: 0.7,
                                      }}
                                    >
                                      AI
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                                  {r.country_code && <FlagImg cc={r.country_code} size={13} />}
                                  <span
                                    className="lb-mobile-sub"
                                    style={{
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: "0.55rem",
                                      letterSpacing: "0.12em",
                                      textTransform: "uppercase",
                                      color: eloColor(elo),
                                    }}
                                  >
                                    {eloTitle(elo)}
                                  </span>
                                  {wr !== null && (
                                    <span
                                      className="lb-mobile-sub"
                                      style={{
                                        fontFamily: "monospace",
                                        fontSize: "0.7rem",
                                        color: wr >= 50 ? "#6ee7b7" : "#f87171",
                                      }}
                                    >
                                      {wr}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="lb-td">
                            <span style={{ fontFamily: "monospace", fontSize: "1rem", fontWeight: 700, color: eloColor(elo) }}>
                              {elo}
                            </span>
                          </td>

                          <td className="lb-td lb-col-title">
                            <span
                              style={{
                                fontFamily: "'Cinzel', serif",
                                fontSize: "0.6rem",
                                letterSpacing: "0.15em",
                                textTransform: "uppercase",
                                color: eloColor(elo),
                              }}
                            >
                              {eloTitle(elo)}
                            </span>
                          </td>

                          <td className="lb-td lb-col-games">
                            <span style={{ fontFamily: "monospace", fontSize: "0.95rem" }}>{games}</span>
                          </td>

                          <td className="lb-td lb-col-wl">
                            <span style={{ fontFamily: "monospace", fontSize: "0.9rem" }}>
                              <span style={{ color: "#6ee7b7" }}>{wins}</span>
                              <span style={{ color: "#3a3830", margin: "0 4px" }}>/</span>
                              <span style={{ color: "#f87171" }}>{losses}</span>
                            </span>
                          </td>

                          <td className="lb-td lb-col-winpct">
                            {wr !== null ? (
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: "0.9rem",
                                  color: wr >= 50 ? "#6ee7b7" : "#f87171",
                                }}
                              >
                                {wr}%
                              </span>
                            ) : (
                              <span style={{ color: "#3a3830" }}>—</span>
                            )}
                          </td>

                          <td className="lb-td">
                            <ChallengeButton
                              viewerId={userId}
                              opponentId={r.user_id}
                              opponentIsAi={r.is_ai}
                              timeControlId={challengeFormat}
                              className="challenge-btn"
                              fullLabelClassName="lb-challenge-full"
                              shortLabelClassName="lb-challenge-short"
                              onRequireAuth={() => setShowAuthModal(true)}
                              onError={setErr}
                            />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!loading && rows.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  color: "#b8966a",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                Victory Methods ({FORMAT_LABELS[format]})
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>

              <style>{`
                .victory-row {
                  display: grid;
                  grid-template-columns: repeat(6, minmax(0, 1fr));
                  gap: 10px;
                  align-items: stretch;
                }

                .victory-figure-row {
                  display: flex;
                  align-items: baseline;
                  justify-content: space-between;
                  gap: 10px;
                  min-height: 34px;
                }

                @media (max-width: 1100px) {
                  .victory-row {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                  }
                }

                @media (max-width: 640px) {
                  .victory-row {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                  }
                }
              `}</style>

              <div className="victory-row">
                {victoryModel.items.map((it) => {
                  const pct = victoryModel.grand > 0 ? Math.round((it.total / victoryModel.grand) * 100) : 0

                  return (
                    <div
                      key={it.key}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: it.bg,
                        border: `1px solid ${it.border}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: "0.62rem",
                          fontWeight: 800,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "#e8e4d8",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={it.key}
                      >
                        {it.key}
                      </div>

                      <div className="victory-figure-row">
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "1.28rem",
                            fontWeight: 900,
                            color: "#e8e4d8",
                            lineHeight: 1,
                          }}
                        >
                          {it.total.toLocaleString()}
                        </div>

                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "1.18rem",
                            fontWeight: 900,
                            color: it.color,
                            lineHeight: 1,
                            opacity: victoryModel.grand > 0 ? 0.95 : 0.55,
                            whiteSpace: "nowrap",
                          }}
                          title={victoryModel.grand > 0 ? `${pct}% of tracked wins` : "No data"}
                        >
                          {victoryModel.grand > 0 ? `${pct}%` : "—"}
                        </div>
                      </div>
                    </div>
                  )
                })}

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.07)",
                    background: "#0f0f14",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: "0.62rem",
                      fontWeight: 800,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "#e8e4d8",
                    }}
                  >
                    Graph
                  </div>

                  <div
                    className="victory-figure-row"
                    style={{
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: 16,
                        borderRadius: 999,
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        display: "flex",
                      }}
                      aria-label="Victory methods stacked bar"
                      title={`Tracked wins: ${victoryModel.grand.toLocaleString()}`}
                    >
                      {victoryModel.items.map((it) => (
                        <div
                          key={it.key}
                          style={{
                            width: `${it.pct}%`,
                            background: it.color,
                            opacity: victoryModel.grand > 0 ? 0.95 : 0.35,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}