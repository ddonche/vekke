// src/pages/ProfilePage.tsx
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"
import { createChallenge, type TimeControlId } from "../services/pvp"
import { AuthModal } from "../AuthModal"
import { newGame } from "../engine/state"
import { RouteDomino } from "../RouteDomino"

type ProfileRow = {
  id: string
  name?: string
  username: string
  avatar_url: string | null
  country_code: string | null
  country_name: string | null
  account_tier: string | null
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

  wins_siegemate: number | null
  wins_elimination: number | null
  wins_collapse: number | null
}

type OrderLite = {
  id: string
  name: string
  doctrine: string | null
  primary_color: string
  secondary_color: string
  sigil_url: string | null
}

type CurrentMembershipLite = {
  order_id: string
  joined_at: string | null
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

function eloColor(elo: number) {
  if (elo >= 2000) return "#D4AF37"
  if (elo >= 1750) return "#7c2d12"
  if (elo >= 1500) return "#16a34a"
  if (elo >= 1200) return "#dc2626"
  if (elo >= 900) return "#2563eb"
  return "#6b6558"
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
        <path d="M4 3h17v10l-4 4h-4l-2 2H8v-2H4V3Z" stroke="currentColor" strokeWidth="2" opacity="0.85" />
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
  const [orderJoinedAt, setOrderJoinedAt] = useState<string | null>(null)

  // Challenge UI
  const [challengeTc, setChallengeTc] = useState<TimeControlId>("standard")
  const [achievements, setAchievements] = useState<any[]>([])
  const [achLoading, setAchLoading] = useState(false)
  const [rewardSkins, setRewardSkins] = useState<Record<string, any[]>>({})
  const [challenging, setChallenging] = useState(false)
  const [challenged, setChallenged] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

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
    setOrderJoinedAt(null)
    setChallenged(false)
    setChallenging(false)

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

    if (!targetUsername) {
      setErr("Missing username in URL.")
      setLoading(false)
      return
    }

    const { data: p, error: pErr } = await supabase
      .from("profiles")
      .select(
        "id,username,avatar_url,country_code,country_name,account_tier,is_ai,bio,website_url,x_url,youtube_url,twitch_url,instagram_url,facebook_url"
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

    const { data: s, error: sErr } = await supabase.from("player_stats").select("*").eq("user_id", (p as any).id).maybeSingle()

    // Fetch achievements
    setAchLoading(true)
    const [{ data: allAchs }, { data: paData }] = await Promise.all([
      supabase.from("achievements").select("*").order("sort_order"),
      supabase.from("player_achievements")
        .select("achievement_id, progress, unlocked_at")
        .eq("user_id", (p as any).id),
    ])
    const paMap = new Map((paData ?? []).map((r: any) => [r.achievement_id, r]))
    const merged = (allAchs ?? []).map((a: any) => {
      const pa = paMap.get(a.id)
      return { ...a, progress: pa?.progress ?? 0, unlocked_at: pa?.unlocked_at ?? null }
    })
    setAchievements(merged)

    // Fetch reward skins for any achievement that has a reward_id
    const rewardSetIds = [...new Set(
      (allAchs ?? []).map((a: any) => a.reward_id).filter(Boolean)
    )]
    if (rewardSetIds.length > 0) {
      const { data: skinData } = await supabase
        .from("skins")
        .select("id, name, set_id, image_url, type, style")
        .in("set_id", rewardSetIds)
      const grouped: Record<string, any[]> = {}
      for (const skin of skinData ?? []) {
        if (!grouped[skin.set_id]) grouped[skin.set_id] = []
        grouped[skin.set_id].push(skin)
      }
      setRewardSkins(grouped)
    }
    setAchLoading(false)

    if (sErr) {
      setErr(sErr.message)
      setLoading(false)
      return
    }
    if (!isMountedRef.current) return
    setStats((s as any) ?? null)

    const { data: mem, error: memErr } = await supabase
      .from("order_memberships")
      .select("order_id,joined_at")
      .eq("user_id", (p as any).id)
      .is("left_at", null)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (memErr) {
      console.warn("[ProfilePage] order_memberships lookup failed:", memErr.message)
    }

    const currentMembership = (mem as any as CurrentMembershipLite | null) ?? null
    const oid = currentMembership?.order_id ?? null
    setOrderJoinedAt(currentMembership?.joined_at ?? null)

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

    const cappedSiegemate = Math.min(safeInt(stats?.wins_siegemate), formatWins)
    const cappedElimination = Math.min(safeInt(stats?.wins_elimination), Math.max(0, formatWins - cappedSiegemate))
    const cappedCollapse = Math.min(
      safeInt(stats?.wins_collapse),
      Math.max(0, formatWins - cappedSiegemate - cappedElimination)
    )

    const formatTimeouts = Math.min(safeInt(stats?.losses_timeout), formatLosses)
    const formatResigns = Math.min(safeInt(stats?.resignations), Math.max(0, formatLosses - formatTimeouts))

    return {
      elo: formatElo,
      games: formatGames,
      wins: formatWins,
      losses: formatLosses,
      totalWins: safeInt(stats?.wins_active),
      totalLosses: safeInt(stats?.losses_active),
      wr,

      timeouts: formatTimeouts,
      resigns: formatResigns,
      lastGameAt: stats?.last_game_at ?? null,
      label: FORMAT_LABELS[tc],

      victoryItems: [
        {
          key: "Siegemate",
          color: "#1f5c5b",
          bg: "rgba(31,92,91,0.10)",
          border: "rgba(31,92,91,0.30)",
          total: cappedSiegemate,
        },
        {
          key: "Elimination",
          color: "#ee484c",
          bg: "rgba(238,72,76,0.08)",
          border: "rgba(238,72,76,0.30)",
          total: cappedElimination,
        },
        {
          key: "Collapse",
          color: "#c77a2c",
          bg: "rgba(199,122,44,0.08)",
          border: "rgba(199,122,44,0.28)",
          total: cappedCollapse,
        },
        {
          key: "Timeout",
          color: "#2f4f6b",
          bg: "rgba(47,79,107,0.10)",
          border: "rgba(47,79,107,0.28)",
          total: formatTimeouts,
        },
        {
          key: "Resignation",
          color: "#355e3b",
          bg: "rgba(53,94,59,0.10)",
          border: "rgba(53,94,59,0.28)",
          total: formatResigns,
        },
      ] as const,
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

  const profileVictoryModel = useMemo(() => {
    const grand = derived.victoryItems.reduce((s, it) => s + it.total, 0)

    let acc = 0
    const items = derived.victoryItems.map((it) => {
      const pct = grand > 0 ? (it.total / grand) * 100 : 0
      const start = acc
      const end = acc + pct
      acc = end
      return { ...it, pct, start, end }
    })

    const gradient =
      grand > 0
        ? `conic-gradient(${items
            .map((s) => `${s.color} ${s.start.toFixed(3)}% ${s.end.toFixed(3)}%`)
            .join(", ")})`
        : "conic-gradient(rgba(255,255,255,0.06) 0% 100%)"

    return { items, grand, gradient }
  }, [derived])

  function canChallengeTarget() {
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
    if (!userId) { setShowAuthModal(true); return }

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
        width: "100%",
        height: "100dvh",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0a0a0c",
        fontFamily: "'EB Garamond', Georgia, serif",
        color: "#e8e4d8",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #0a0a0c; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

        .profile-scroll {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
        }

        .vk-container {
          padding: 18px 12px 48px;
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
          min-width: 0;
        }
        @media (min-width: 700px) {
          .vk-container { padding: 28px 24px 60px; }
        }

        .profile-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          align-items: start;
          min-width: 0;
        }
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
          min-width: 0;
        }
        .rule { flex: 1; height: 1px; background: rgba(255,255,255,0.07); min-width: 0; }

        .card {
          border: 1px solid rgba(255,255,255,0.07);
          background: #0f0f14;
          border-radius: 12px;
          overflow: hidden;
          min-width: 0;
        }
        .card-pad { padding: 14px; min-width: 0; }
        @media (min-width: 700px) { .card-pad { padding: 16px; } }

        .stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; min-width: 0; }
        @media (min-width: 720px) { .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

        .table-wrap {
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          min-width: 0;
        }
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

        .format-tabs-row {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 12px;
          min-width: 0;
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
          width: 100%;
          min-width: 0;
        }
        .challenge-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }

        .follow-btn {
          font-family: 'Cinzel', serif;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.10);
          color: #b0aa9e;
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 0.55rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          font-weight: 600;
          cursor: default;
          white-space: nowrap;
          width: 100%;
          min-width: 0;
        }

        .identity-action-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 4px;
          min-width: 0;
        }

        .last-game-inline {
          margin-top: 12px;
          color: #b0aa9e;
          fontStyle: italic;
          font-size: 1.02rem;
          line-height: 1.4;
        }

        /* Pro bio + icon links (no borders/boxes) */
        .pro-bio {
          margin-top: 10px;
          color: #e8e4d8;
          font-size: 1.05rem;
          line-height: 1.45;
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

        .identity-top {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .identity-order-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 8px;
          min-width: 0;
        }

        .identity-name {
          font-family: 'Cinzel', serif;
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #e8e4d8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        .achievements-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
          gap: 8px;
          min-width: 0;
        }

        .ach-reward-col {
          width: 92px;
          min-width: 92px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .ach-reward-label {
          font-family: 'Cinzel', serif;
          font-size: 0.56rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #b8966a;
          text-align: center;
          white-space: nowrap;
        }

        .ach-reward-preview {
          min-height: 78px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ach-reward-stack {
          min-height: 78px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .ach-token-preview {
          width: 34px;
          height: 34px;
          object-fit: cover;
          border-radius: 999px;
          display: block;
        }

        @media (max-width: 640px) {
          .vk-container {
            padding-left: 10px;
            padding-right: 10px;
          }

          .card-pad {
            padding: 12px;
          }

          .identity-top {
            align-items: flex-start;
          }

          .identity-order-row {
            align-items: flex-start;
            gap: 12px;
          }

          .identity-name {
            font-size: 1.02rem;
            white-space: normal;
            overflow: visible;
            text-overflow: unset;
            line-height: 1.15;
          }

          .section-label {
            letter-spacing: 0.32em;
          }

          .achievements-grid {
            grid-template-columns: 1fr;
          }

          .ach-reward-col {
            width: 82px;
            min-width: 82px;
          }

          .ach-reward-preview,
          .ach-reward-stack {
            min-height: 72px;
          }
        }
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
      />

      <div className="hide-scrollbar profile-scroll">
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
            <div style={{ minWidth: 0 }}>
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
                  <div className="identity-top">
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

                        <div className="identity-name">
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

                  {/* Pro bio + social icons */}
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

                  {/* Follow / Challenge controls */}
                  <div className="identity-action-row">
                    <button className="follow-btn" disabled title="Follow (placeholder)">
                      Follow
                    </button>

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

                  <div
                    style={{
                      marginTop: 12,
                      color: "#b0aa9e",
                      fontStyle: "italic",
                      fontSize: "1.02rem",
                      lineHeight: 1.4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Cinzel', serif",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        color: "#6b6558",
                        fontStyle: "normal",
                        marginRight: 8,
                      }}
                    >
                      Last Game
                    </span>
                    {loading ? "—" : derived.lastGameAt ? new Date(derived.lastGameAt).toLocaleString() : "No games yet"}
                  </div>

                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "14px 0" }} />

                  <div className="identity-order-row">
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

                      {orderJoinedAt ? (
                        <div style={{ marginTop: 4, color: "#6b6558", fontStyle: "italic" }}>
                          Joined {new Date(orderJoinedAt).toLocaleDateString()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: Stats */}
            <div style={{ minWidth: 0 }}>
              <div className="section-label">
                Stats <div className="rule" />
              </div>

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

              <div className="format-tabs-row">
                {(["standard", "rapid", "blitz", "daily"] as TimeControlId[]).map((tc) => (
                  <button
                    key={tc}
                    className={`format-tab${challengeTc === tc ? " active" : ""}`}
                    onClick={() => setChallengeTc(tc)}
                    disabled={loading}
                    title={`Show ${FORMAT_LABELS[tc]} stats`}
                  >
                    {FORMAT_LABELS[tc]}
                  </button>
                ))}
              </div>

              <div className="stats-grid">
                <StatPill label="ELO" value={loading ? "—" : String(derived.elo)} customColor={eloColor(derived.elo)} />
                <StatPill label="Games" value={loading ? "—" : String(derived.games)} />
                <StatPill label="Win%" value={loading ? "—" : derived.wr == null ? "—" : pct(derived.wr)} tone="gold" />
                <StatPill label="Wins" value={loading ? "—" : String(derived.wins)} />
                <StatPill label="Losses" value={loading ? "—" : String(derived.losses)} />
                <StatPill
                  label="Total W/L"
                  value={loading ? "—" : `${derived.totalWins}/${derived.totalLosses}`}
                  customColor="#d4af7a"
                  background="rgba(184,150,106,0.10)"
                  borderColor="rgba(184,150,106,0.30)"
                />
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

                  {!loading && stats ? (
                    <div style={{ marginTop: 12 }}>
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
                        Victory Methods ({derived.label})
                      </div>

                      <style>{`
                        .profile-victory-row {
                          display: grid;
                          grid-template-columns: repeat(6, minmax(0, 1fr));
                          gap: 10px;
                          align-items: stretch;
                        }

                        .profile-victory-figure-row {
                          display: flex;
                          align-items: baseline;
                          justify-content: space-between;
                          gap: 10px;
                          min-height: 34px;
                        }

                        @media (max-width: 1100px) {
                          .profile-victory-row {
                            grid-template-columns: repeat(3, minmax(0, 1fr));
                          }
                        }

                        @media (max-width: 640px) {
                          .profile-victory-row {
                            grid-template-columns: repeat(2, minmax(0, 1fr));
                          }
                        }
                      `}</style>

                      <div className="profile-victory-row">
                        {profileVictoryModel.items.map((it) => {
                          const share = profileVictoryModel.grand > 0 ? Math.round((it.total / profileVictoryModel.grand) * 100) : 0

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

                              <div className="profile-victory-figure-row">
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
                                    opacity: profileVictoryModel.grand > 0 ? 0.95 : 0.55,
                                    whiteSpace: "nowrap",
                                  }}
                                  title={profileVictoryModel.grand > 0 ? `${share}% of tracked endings` : "No data"}
                                >
                                  {profileVictoryModel.grand > 0 ? `${share}%` : "—"}
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
                            className="profile-victory-figure-row"
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
                              title={`Tracked endings: ${profileVictoryModel.grand.toLocaleString()}`}
                            >
                              {profileVictoryModel.items.map((it) => (
                                <div
                                  key={it.key}
                                  style={{
                                    width: `${it.pct}%`,
                                    background: it.color,
                                    opacity: profileVictoryModel.grand > 0 ? 0.95 : 0.35,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="table-wrap" style={{ marginTop: 14 }}>
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

          {/* ── Achievements ───────────────────────────────────────────────── */}
          <div style={{ marginTop: 24, minWidth: 0 }}>
            <div className="section-label">
              Achievements <div className="rule" />
            </div>

            {achLoading ? (
              <div style={{ color: "#6b6558", fontStyle: "italic", fontSize: "0.9rem" }}>Loading achievements…</div>
            ) : achievements.length === 0 ? (
              <div style={{ color: "#6b6558", fontStyle: "italic", fontSize: "0.9rem" }}>No achievements yet.</div>
            ) : (() => {
              const unlocked = achievements.filter(a => a.unlocked_at)
              const locked = achievements.filter(a => !a.unlocked_at)

              const tierColor = (tier: string | null) => {
                if (tier === "gold") return "#f5c842"
                if (tier === "silver") return "#b0b8c8"
                if (tier === "bronze") return "#cd7f32"
                return "#b8966a"
              }

              const RewardPreview = ({ skins, dim }: { skins: any[]; dim: boolean }) => {
                if (!skins || skins.length === 0) {
                  return (
                    <div className="ach-reward-preview">
                      <span
                        style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: "0.56rem",
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: dim ? "#4a4640" : "#6b6558",
                        }}
                      >
                        —
                      </span>
                    </div>
                  )
                }

                const routeSkins = skins.filter((s) => s.type === "route")
                if (routeSkins.length > 0) {
                  const skin = routeSkins[0]
                  return (
                    <div className="ach-reward-preview" title={skin.name}>
                      <div style={{ filter: dim ? "grayscale(20%) brightness(0.8)" : "none" }}>
                        <RouteDomino
                          dir="N"
                          dist={2}
                          size={34}
                          skinStyle={skin.style ?? undefined}
                        />
                      </div>
                    </div>
                  )
                }

                const visualSkins = skins.filter((s) => s.image_url)
                const shown = visualSkins.slice(0, 2)

                return (
                  <div className="ach-reward-stack">
                    {shown.map((skin: any) => (
                      <img
                        key={skin.id}
                        src={skin.image_url}
                        alt={skin.name}
                        title={skin.name}
                        className="ach-token-preview"
                        style={{
                          filter: dim ? "grayscale(20%) brightness(0.8)" : "none",
                        }}
                      />
                    ))}
                    {visualSkins.length === 0 ? (
                      <span
                        style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: "0.56rem",
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: dim ? "#4a4640" : "#6b6558",
                        }}
                      >
                        —
                      </span>
                    ) : null}
                  </div>
                )
              }

              const AchCard = ({ a, dim }: { a: any; dim: boolean }) => {
                const color = tierColor(a.tier)
                const progPct = a.threshold ? Math.min(100, Math.round((a.progress / a.threshold) * 100)) : 100
                const skins = a.reward_id ? (rewardSkins[a.reward_id] ?? []) : []

                return (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: `1px solid ${dim ? "rgba(255,255,255,0.07)" : "rgba(184,150,106,0.2)"}`,
                      background: dim ? "rgba(255,255,255,0.03)" : "rgba(184,150,106,0.05)",
                      opacity: dim ? 0.88 : 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) 92px",
                        gap: 14,
                        alignItems: "start",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              flexShrink: 0,
                              marginTop: 4,
                              background: dim ? "#3a3830" : color,
                              boxShadow: dim ? "none" : `0 0 5px ${color}88`,
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "'Cinzel', serif",
                                  fontSize: "0.78rem",
                                  fontWeight: 600,
                                  color: dim ? "#6b6558" : "#e8e4d8",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                {a.name}
                              </span>

                              {a.tier && (
                                <span
                                  style={{
                                    fontSize: "0.58rem",
                                    letterSpacing: "0.12em",
                                    color: dim ? "#4a4640" : color,
                                    textTransform: "uppercase",
                                    fontFamily: "'Cinzel', serif",
                                  }}
                                >
                                  {a.tier}
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontFamily: "'EB Garamond', serif",
                                fontSize: "0.78rem",
                                color: dim ? "#4a4640" : "rgba(232,228,216,0.5)",
                                marginTop: 2,
                                lineHeight: 1.4,
                              }}
                            >
                              {a.description}
                            </div>

                            {dim && a.threshold && (
                              <div style={{ marginTop: 9 }}>
                                <div
                                  style={{
                                    height: 3,
                                    borderRadius: 2,
                                    background: "rgba(255,255,255,0.06)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      borderRadius: 2,
                                      width: `${progPct}%`,
                                      background: "rgba(184,150,106,0.4)",
                                      transition: "width 0.3s ease",
                                    }}
                                  />
                                </div>
                                <div
                                  style={{
                                    fontFamily: "monospace",
                                    fontSize: "0.68rem",
                                    color: "#4a4640",
                                    marginTop: 3,
                                  }}
                                >
                                  {a.progress} / {a.threshold}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="ach-reward-col">
                        <div
                          className="ach-reward-label"
                          style={{ color: dim ? "#4a4640" : "#b8966a" }}
                        >
                          Reward
                        </div>
                        <RewardPreview skins={skins} dim={dim} />
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div style={{ minWidth: 0 }}>
                  {unlocked.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div
                        style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: "0.62rem",
                          letterSpacing: "0.3em",
                          textTransform: "uppercase",
                          color: "#b8966a",
                          marginBottom: 10,
                        }}
                      >
                        Unlocked — {unlocked.length}
                      </div>
                      <div className="achievements-grid">
                        {unlocked.map(a => <AchCard key={a.id} a={a} dim={false} />)}
                      </div>
                    </div>
                  )}

                  {locked.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: "0.62rem",
                          letterSpacing: "0.3em",
                          textTransform: "uppercase",
                          color: "#4a4640",
                          marginBottom: 10,
                        }}
                      >
                        Locked — {locked.length}
                      </div>
                      <div className="achievements-grid">
                        {locked.map(a => <AchCard key={a.id} a={a} dim={true} />)}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          <div style={{ height: 12 }} />
        </div>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}