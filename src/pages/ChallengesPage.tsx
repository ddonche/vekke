import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

type InviteRow = {
  id: string
  created_at: string
  expires_at: string | null
  created_by: string
  invited_user_id: string | null

  // IMPORTANT: token-based accept flows often set accepted_by instead of invited_user_id
  accepted_by: string | null

  invite_type: string | null
  time_control: string | null
  status: string | null
  declined_at: string | null
  declined_by: string | null
  invitee_accepted_at: string | null
  inviter_accepted_at: string | null
  game_id: string | null
}

type ProfileLite = {
  id: string
  username: string
  avatar_url: string | null
  country_code: string | null
}

type PlayerStatLite = {
  user_id: string
  elo: number
  elo_blitz: number
  elo_rapid: number
  elo_standard: number
  elo_daily: number
}

type GameAny = Record<string, any>

function firstDefined<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k]
  }
  return undefined
}

function safeJson(v: any): any {
  if (!v) return null
  if (typeof v === "object") return v
  if (typeof v !== "string") return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

function deriveMySide(game: GameAny, userId: string): "W" | "B" | null {
  // Your schema: games.wake_id / games.brake_id
  const wake = firstDefined<string>(game, ["wake_id", "wakeId"])
  const brake = firstDefined<string>(game, ["brake_id", "brakeId"])
  if (wake === userId) return "W"
  if (brake === userId) return "B"

  // Fallback if embedded in current_state
  const st = safeJson(firstDefined<any>(game, ["current_state", "currentState"]))
  const wake2 = firstDefined<string>(st, ["wake_id", "wakeId"])
  const brake2 = firstDefined<string>(st, ["brake_id", "brakeId"])
  if (wake2 === userId) return "W"
  if (brake2 === userId) return "B"

  return null
}

function normalizeTurn(v: any): "W" | "B" | undefined {
  if (!v) return undefined
  const s = String(v).trim().toLowerCase()
  if (s === "w" || s === "wake") return "W"
  if (s === "b" || s === "brake") return "B"
  return undefined
}

function deriveTurnInfo(game: GameAny): { turnSide?: "W" | "B" } {
  // Your schema: games.turn (text)
  const direct = normalizeTurn(firstDefined<any>(game, ["turn"]))
  if (direct) return { turnSide: direct }

  // Fallback if embedded in current_state
  const st = safeJson(firstDefined<any>(game, ["current_state", "currentState"]))
  const stTurn = normalizeTurn(firstDefined<any>(st, ["turn"]))
  if (stTurn) return { turnSide: stTurn }

  return {}
}

function formatTc(tc: string | null | undefined) {
  if (!tc) return ""
  return tc[0].toUpperCase() + tc.slice(1)
}

function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-challenges-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-challenges-fonts"
  link.rel = "stylesheet"
  link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
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
      style={{ display: "inline-block", verticalAlign: "middle", borderRadius: 2, flexShrink: 0 }}
      onError={(e) => { e.currentTarget.style.display = "none" }}
    />
  )
}

function PlayerChip({ profile, stats, label, timeControl, statusLabel, statusColor }: {
  profile: ProfileLite | undefined
  stats: PlayerStatLite | undefined
  label: string
  timeControl?: string | null
  statusLabel?: string
  statusColor?: string
}) {
  const name = profile?.username ?? label
  const avatarUrl = profile?.avatar_url
  const initials = name.trim().slice(0, 2).toUpperCase()

  let elo: number | undefined
  if (stats) {
    const tc = (timeControl ?? "").toLowerCase()
    if (tc === "blitz") elo = stats.elo_blitz
    else if (tc === "rapid") elo = stats.elo_rapid
    else if (tc === "daily") elo = stats.elo_daily
    else if (tc === "standard") elo = stats.elo_standard
    else elo = stats.elo
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: "#13131a", border: "1px solid rgba(184,150,106,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.7rem", fontWeight: 600, color: "#b0aa9e" }}>{initials}</span>
        }
      </div>
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "nowrap" }}>
          <FlagImg cc={profile?.country_code} size={16} />
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: "1rem", fontWeight: 600, color: "#e8e4d8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          {typeof elo === "number" && (
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.75rem", letterSpacing: "0.1em", color: "#6b6558", whiteSpace: "nowrap", flexShrink: 0 }}>· {elo} ELO</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 3 }}>
          {timeControl && (
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b6558" }}>
              {formatTc(timeControl)}
            </span>
          )}
          {statusLabel && (
            <span className="game-status" style={{ fontFamily: "'Cinzel', serif", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: statusColor ?? "#b0aa9e" }}>
              {timeControl ? ` · ${statusLabel}` : statusLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChallengesPage() {
  injectFonts()
  const navigate = useNavigate()

  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<ProfileLite | null>(null)

  const [invites, setInvites] = useState<InviteRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [statsById, setStatsById] = useState<Record<string, PlayerStatLite>>({})
  const [gamesById, setGamesById] = useState<Record<string, GameAny>>({})
  const [aiGames, setAiGames] = useState<GameAny[]>([])

  // For keeping the header badge accurate without manual refresh:
  // we poll the games for the active game ids.
  const [activeGameIds, setActiveGameIds] = useState<string[]>([])
  const pollingIdsKey = useMemo(() => activeGameIds.slice().sort().join("|"), [activeGameIds])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function getAccessTokenOrRedirect(returnTo: string): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token ?? null
    if (!token) {
      const rt = encodeURIComponent(returnTo)
      window.location.assign(`/?openAuth=1&returnTo=${rt}`)
      return null
    }
    return token
  }

  async function refreshGamesOnly(ids: string[]) {
    if (!ids.length) {
      setGamesById({})
      return
    }

    const { data: gs, error: gErr } = await supabase.from("games").select("*").in("id", ids)
    if (gErr) {
      console.error("games select failed", gErr)
      return
    }

    const map: Record<string, GameAny> = {}
    ;(gs ?? []).forEach((g: any) => (map[g.id] = g))

    if (!isMountedRef.current) return
    setGamesById(map)
  }

  async function load() {
    setErr(null)

    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session?.user) {
      const rt = encodeURIComponent(`/challenges`)
      window.location.assign(`/?openAuth=1&returnTo=${rt}`)
      return
    }

    const uid = sess.session.user.id
    setUserId(uid)

    const { data: myp } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, country_code")
      .eq("id", uid)
      .single()
    if (myp) setMe(myp as any)

    // KEY FIX:
    // If invitee accepts via token, backend may set accepted_by instead of invited_user_id.
    // So include accepted_by in both the SELECT and the OR filter.
    const { data: inv, error: invErr } = await supabase
      .from("game_invites")
      .select(
        "id, created_at, expires_at, created_by, invited_user_id, accepted_by, invite_type, time_control, status, declined_at, declined_by, invitee_accepted_at, inviter_accepted_at, game_id"
      )
      .in("invite_type", ["pvp", "rematch"])
      .or(`created_by.eq.${uid},invited_user_id.eq.${uid},accepted_by.eq.${uid}`)
      .order("created_at", { ascending: false })
      .limit(200)

    if (invErr) throw invErr

    const invList = ((inv ?? []) as InviteRow[]).filter(r => r.invite_type === "pvp")
    setInvites(invList)

    const profileIds = new Set<string>()
    profileIds.add(uid)

    for (const r of invList) {
      if (r.created_by) profileIds.add(r.created_by)
      if (r.invited_user_id) profileIds.add(r.invited_user_id)
      if (r.accepted_by) profileIds.add(r.accepted_by)
    }

    const gameIds = Array.from(
      new Set(invList.map(r => r.game_id).filter((x): x is string => typeof x === "string" && x.length > 0))
    )

    // Fetch active AI games for this user
    const { data: aiGs } = await supabase
      .from("games")
      .select("*")
      .eq("is_vs_ai", true)
      .or(`wake_id.eq.${uid},brake_id.eq.${uid}`)
      .is("ended_at", null)
      .order("last_move_at", { ascending: false })

    const aiGameList = (aiGs ?? []) as GameAny[]
    setAiGames(aiGameList)

    const aiGameIds = aiGameList.map((g: any) => g.id as string)

    // Add AI opponent user IDs so their profiles/avatars/flags get fetched
    for (const g of aiGameList) {
      const wake = g.wake_id as string | null
      const brake = g.brake_id as string | null
      if (wake && wake !== uid) profileIds.add(wake)
      if (brake && brake !== uid) profileIds.add(brake)
    }

    // This is what drives polling & header badge freshness (PvP + AI)
    setActiveGameIds([...gameIds, ...aiGameIds])

    if (profileIds.size > 0) {
      const ids = Array.from(profileIds)
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, country_code")
        .in("id", ids)

      const map: Record<string, ProfileLite> = {}
      ;(ps ?? []).forEach((p: any) => (map[p.id] = p))
      setProfiles(map)

      // Fetch player_stats for ratings
      const { data: stats } = await supabase
        .from("player_stats")
        .select("user_id, elo, elo_blitz, elo_rapid, elo_standard, elo_daily")
        .in("user_id", ids)
      const statsMap: Record<string, PlayerStatLite> = {}
      ;(stats ?? []).forEach((s: any) => (statsMap[s.user_id] = s))
      setStatsById(statsMap)
    } else {
      setProfiles({})
      setStatsById({})
    }

    if (gameIds.length > 0) {
      await refreshGamesOnly(gameIds)
    } else {
      setGamesById({})
    }
  }

  // Poll the games so "Your turn" + header badge updates when opponent moves.
  useEffect(() => {
    if (!userId) return
    if (!pollingIdsKey) return

    // quick refresh immediately
    refreshGamesOnly(activeGameIds).catch(console.error)

    const t = window.setInterval(() => {
      refreshGamesOnly(activeGameIds).catch(console.error)
    }, 2000)

    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pollingIdsKey])

  async function respondToChallenge(inviteId: string, response: "accept" | "decline") {
    setBusy(true)
    setErr(null)

    const token = await getAccessTokenOrRedirect("/challenges")
    if (!token) {
      setBusy(false)
      return
    }

    const { data, error } = await supabase.functions.invoke("respond_to_challenge", {
      body: { inviteId, response },
      headers: { Authorization: `Bearer ${token}` },
    })

    setBusy(false)

    if (error) {
      setErr(error.message)
      return
    }

    if ((data as any)?.status === "accepted" && (data as any)?.gameId) {
      window.location.assign(`/pvp/${(data as any).gameId}`)
      return
    }

    await load()
  }

  const derived = useMemo(() => {
    const uid = userId
    if (!uid) {
      return {
        incoming: [] as InviteRow[],
        outgoingWaiting: [] as InviteRow[],
        outgoingReady: [] as InviteRow[],
        acceptedWithGame: [] as InviteRow[],
        acceptedNoGame: [] as InviteRow[],
      }
    }

    const incoming: InviteRow[] = []
    const outgoingWaiting: InviteRow[] = []
    const outgoingReady: InviteRow[] = []
    const acceptedWithGame: InviteRow[] = []
    const acceptedNoGame: InviteRow[] = []

    for (const r of invites) {
      const isDeclined = !!r.declined_at || r.status === "declined"
      const isAccepted = r.status === "accepted" || (!!r.game_id && !isDeclined)

      if (isAccepted) {
        if (r.game_id) acceptedWithGame.push(r)
        else acceptedNoGame.push(r)
        continue
      }
      if (isDeclined) continue

      const isInviter = r.created_by === uid
      const isInvitee = r.invited_user_id === uid || r.accepted_by === uid

      if (isInvitee && !r.invitee_accepted_at) incoming.push(r)
      else if (isInviter && !r.invitee_accepted_at) outgoingWaiting.push(r)
      else if (isInviter && !!r.invitee_accepted_at && !r.inviter_accepted_at) outgoingReady.push(r)
      else if (isInvitee && !!r.invitee_accepted_at && !r.inviter_accepted_at) outgoingWaiting.push(r)
    }

    return { incoming, outgoingWaiting, outgoingReady, acceptedWithGame, acceptedNoGame }
  }, [invites, userId])

  type ActiveGameItem = {
    gameId: string
    label: string
    status: string
    opponentId?: string
    isAi?: boolean
    format?: string | null
  }

  const activeGames = useMemo(() => {
    if (!userId) return [] as ActiveGameItem[]

    const uid = userId
    const items: ActiveGameItem[] = []

    // PvP games from accepted invites
    for (const inv of derived.acceptedWithGame) {
      const gameId = inv.game_id!
      const g = gamesById[gameId]

      // Drop finished games — check both server columns and current_state.gameOver
      // (some timed-out games may have gameOver set in state before server columns are written)
      const cs = safeJson(g?.current_state)
      const isEnded = g && (
        g.ended_at ||
        g.winner_id ||
        g.status === "finished" ||
        g.status === "complete" ||
        g.status === "completed" ||
        g.status === "over" ||
        cs?.gameOver != null
      )
      if (isEnded) continue

      let status = "In progress"
      let opponentId: string | undefined

      if (g) {
        const mySide = deriveMySide(g, uid)
        const ti = deriveTurnInfo(g)
        if (ti.turnSide && mySide) {
          status = ti.turnSide === mySide ? "Your turn" : "Waiting for opponent"
        }

        const wake = firstDefined<string>(g, ["wake_id", "wakeId"])
        const brake = firstDefined<string>(g, ["brake_id", "brakeId"])
        if (wake && brake) opponentId = wake === uid ? brake : brake === uid ? wake : undefined
      } else {
        const inviteeId = inv.invited_user_id ?? inv.accepted_by ?? undefined
        opponentId = inv.created_by === uid ? inviteeId : inv.created_by
      }

      const tc = formatTc(inv.time_control)
      const oppName = opponentId ? profiles[opponentId]?.username : undefined
      const label = oppName ? `vs ${oppName}${tc ? ` (${tc})` : ""}` : `Game${tc ? ` (${tc})` : ""}`

      items.push({ gameId, label, status, opponentId })
    }

    // AI games
    for (const g of aiGames) {
      const gameId = g.id as string
      const live = gamesById[gameId] ?? g

      const mySide = deriveMySide(live, uid)
      const ti = deriveTurnInfo(live)
      let status = "In progress"
      if (ti.turnSide && mySide) {
        status = ti.turnSide === mySide ? "Your turn" : "Waiting for opponent"
      }

      const wake = firstDefined<string>(live, ["wake_id", "wakeId"])
      const brake = firstDefined<string>(live, ["brake_id", "brakeId"])
      const opponentId = wake === uid ? brake : brake === uid ? wake : undefined

      const format = (live.format ?? g.format ?? null) as string | null
      const oppName = opponentId ? profiles[opponentId]?.username : undefined
      const label = oppName
        ? `vs ${oppName}${format ? ` (${formatTc(format)})` : ""}`
        : `AI Game${format ? ` (${formatTc(format)})` : ""}`

      items.push({ gameId, label, status, opponentId, isAi: true, format })
    }

    items.sort((a, b) => {
      const av = a.status === "Your turn" ? 0 : 1
      const bv = b.status === "Your turn" ? 0 : 1
      return av - bv
    })
    return items
  }, [derived.acceptedWithGame, gamesById, aiGames, profiles, userId])

  useEffect(() => {
    load().catch((e: any) => setErr(e?.message ?? String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const myTurnCount = useMemo(() => activeGames.filter(g => g.status === "Your turn").length, [activeGames])

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
        .challenges-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
        @media (max-width: 700px) {
          .challenges-grid { grid-template-columns: 1fr; gap: 0; }
          .challenges-right { margin-top: 32px; }
          .game-status { font-size: 0.55rem !important; }
          .player-chip { min-width: 0; flex: 1; }
          .game-card-row { gap: 8px !important; }
        }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel="Daily"
        elo={undefined}
        activePage="mygames"
        myGamesTurnCount={myTurnCount}
        onSignIn={() => {
          const rt = encodeURIComponent(`/challenges`)
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
        <div style={{ padding: "28px 24px 60px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 28 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.3rem", fontWeight: 700, color: "#e8e4d8", letterSpacing: "0.06em" }}>My Games</div>
          <button
            disabled={busy}
            onClick={() => load().catch((e: any) => setErr(e?.message ?? String(e)))}
            style={{
              fontFamily: "'Cinzel', serif",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#6b6558",
              borderRadius: 4,
              padding: "7px 14px",
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {err && <div style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "0.95rem", color: "#f87171", marginTop: 10, padding: "10px 14px", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, background: "rgba(239,68,68,0.06)" }}>{err}</div>}

        <div className="challenges-grid">

        {/* LEFT -- Active Games */}
        <div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "#b8966a", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>Active Games<div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} /></div>
          {activeGames.length === 0 ? (
            <div style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1.1rem", fontStyle: "italic", color: "#b0aa9e" }}>No active games yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeGames.map(g => (
                <div
                  key={g.gameId}
                  style={{
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 8,
                    background: "#0f0f14",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div className="game-card-row" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <PlayerChip
                      profile={g.opponentId ? profiles[g.opponentId] : undefined}
                      stats={g.opponentId ? statsById[g.opponentId] : undefined}
                      label="Opponent"
                      timeControl={g.isAi ? g.format : invites.find(i => i.game_id === g.gameId)?.time_control}
                      statusLabel={g.status}
                      statusColor={g.status === "Your turn" ? "#5de8f7" : "#b0aa9e"}
                    />
                  </div>
                  <button
                    onClick={() => window.location.assign(g.isAi ? `/ai/${g.gameId}` : `/pvp/${g.gameId}`)}
                    style={{
                      fontFamily: "'Cinzel', serif",
                      background: "rgba(184,150,106,0.10)",
                      border: "1px solid rgba(184,150,106,0.35)",
                      color: "#d4af7a",
                      borderRadius: 4,
                      padding: "8px 16px",
                      fontSize: "0.58rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT -- Challenges */}
        <div className="challenges-right">
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "#b8966a", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>Challenges<div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} /></div>

          {derived.incoming.length > 0 && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {derived.incoming.map(r => {
                  const inviterName = profiles[r.created_by]?.username ?? r.created_by
                  const tc = formatTc(r.time_control)
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: 14,
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 8,
                        background: "#0f0f14",
                      }}
                    >
                      <PlayerChip profile={profiles[r.created_by]} stats={statsById[r.created_by]} label={inviterName} timeControl={r.time_control} />
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          disabled={busy}
                          onClick={() => respondToChallenge(r.id, "accept")}
                          style={{
                            fontFamily: "'Cinzel', serif",
                            background: "rgba(184,150,106,0.10)",
                            border: "1px solid rgba(184,150,106,0.35)",
                            color: "#d4af7a",
                            borderRadius: 4,
                            padding: "8px 16px",
                            fontSize: "0.58rem",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Accept
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => respondToChallenge(r.id, "decline")}
                          style={{
                            fontFamily: "'Cinzel', serif",
                            background: "rgba(238,72,76,0.08)",
                            border: "1px solid rgba(238,72,76,0.25)",
                            color: "#f87171",
                            borderRadius: 4,
                            padding: "8px 16px",
                            fontSize: "0.58rem",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {derived.outgoingWaiting.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {derived.outgoingWaiting.map(r => {
                  const inviteeId = r.invited_user_id ?? r.accepted_by ?? undefined
                  const otherId = r.created_by === userId ? inviteeId : r.created_by
                  const otherName = otherId ? profiles[otherId]?.username ?? otherId : "Unknown"
                  const tc = formatTc(r.time_control)
                  const msg = r.invitee_accepted_at ? "Waiting for inviter" : "Waiting for invitee"
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: 14,
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 8,
                        background: "#0f0f14",
                      }}
                    >
                      <PlayerChip profile={otherId ? profiles[otherId] : undefined} stats={otherId ? statsById[otherId] : undefined} label={otherName} timeControl={r.time_control} statusLabel={msg} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {derived.outgoingReady.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6b6558", marginBottom: 10 }}>Ready for you</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {derived.outgoingReady.map(r => {
                  const inviteeId = r.invited_user_id ?? r.accepted_by ?? undefined
                  const otherName = inviteeId ? profiles[inviteeId]?.username ?? inviteeId : "Unknown"
                  const tc = formatTc(r.time_control)
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: 14,
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 8,
                        background: "#0f0f14",
                      }}
                    >
                      <PlayerChip profile={inviteeId ? profiles[inviteeId] : undefined} stats={inviteeId ? statsById[inviteeId] : undefined} label={otherName} timeControl={r.time_control} statusLabel="Accepted" />
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          disabled={busy}
                          onClick={() => respondToChallenge(r.id, "accept")}
                          style={{
                            fontFamily: "'Cinzel', serif",
                            background: "rgba(184,150,106,0.10)",
                            border: "1px solid rgba(184,150,106,0.35)",
                            color: "#d4af7a",
                            borderRadius: 4,
                            padding: "8px 16px",
                            fontSize: "0.58rem",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Start game
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => respondToChallenge(r.id, "decline")}
                          style={{
                            fontFamily: "'Cinzel', serif",
                            background: "rgba(238,72,76,0.08)",
                            border: "1px solid rgba(238,72,76,0.25)",
                            color: "#f87171",
                            borderRadius: 4,
                            padding: "8px 16px",
                            fontSize: "0.58rem",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {derived.acceptedNoGame.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6b6558", marginBottom: 10 }}>Accepted (creating game...)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {derived.acceptedNoGame.map(r => {
                  const inviteeId = r.invited_user_id ?? r.accepted_by ?? undefined
                  const otherId = r.created_by === userId ? inviteeId : r.created_by
                  const otherName = otherId ? profiles[otherId]?.username ?? otherId : "Unknown"
                  const tc = formatTc(r.time_control)
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: 14,
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 8,
                        background: "#0f0f14",
                      }}
                    >
                      <PlayerChip profile={otherId ? profiles[otherId] : undefined} stats={otherId ? statsById[otherId] : undefined} label={otherName} timeControl={r.time_control} statusLabel="Awaiting game" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {derived.incoming.length === 0 &&
            derived.outgoingWaiting.length === 0 &&
            derived.outgoingReady.length === 0 &&
            derived.acceptedNoGame.length === 0 && <div style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1.1rem", fontStyle: "italic", color: "#b0aa9e", marginTop: 8 }}>No pending challenges.</div>}
        </div>
        </div>{/* end two-col grid */}
        </div>{/* end container */}
      </div>
    </div>
  )
}