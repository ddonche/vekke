// src/pages/InvitePage.tsx
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { newGame } from "../engine/state"
import { OnboardingModal } from "../OnboardingModal"
import { Header } from "../components/Header"

type Profile = {
  username: string
  country_code: string | null
  country_name: string | null
  avatar_url: string | null
}

type Inviter = {
  user_id: string
  username: string
  avatar_url: string | null
  country: string | null
}

type CreateChallengeResp = {
  inviteId: string
  inviteToken: string
  status: string
  inviter: Inviter
  gameId: string | null
  reused?: boolean
}

type RespondResp =
  | { status: "declined" }
  | { status: "pending"; waitingFor: "inviter" | "invitee" }
  | { status: "accepted"; gameId: string }

export function InvitePage() {
  const { inviterId } = useParams<{ inviterId?: string }>()
  const inviterUuid = useMemo(() => (inviterId ?? "").trim(), [inviterId])

  const navigate = useNavigate()

  const [err, setErr] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [challenge, setChallenge] = useState<CreateChallengeResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)

  const pollTimer = useRef<number | null>(null)

  function stopPoll() {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  async function getAccessTokenOrRedirect(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token ?? null
    if (!token) {
      const returnTo = encodeURIComponent(`/invite/${inviterUuid}`)
      window.location.assign(`/?openAuth=1&returnTo=${returnTo}`)
      return null
    }
    return token
  }

  async function loadProfile(uid: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("username, country_code, country_name, avatar_url")
      .eq("id", uid)
      .single()

    if (error) throw error
    setProfile(data as any)

    const needsOnboarding =
      (data as any).username?.startsWith("user_") || !(data as any).country_code

    setShowOnboarding(!!needsOnboarding)
    return !needsOnboarding
  }

  async function ensureAuthAndProfile() {
    if (!inviterUuid) throw new Error("Missing inviter id in URL")

    const { data } = await supabase.auth.getSession()
    if (!data.session?.user) {
      const returnTo = encodeURIComponent(`/invite/${inviterUuid}`)
      window.location.assign(`/?openAuth=1&returnTo=${returnTo}`)
      return
    }

    const uid = data.session.user.id
    setUserId(uid)

    const ok = await loadProfile(uid)
    if (!ok) return

    await createChallenge(uid)
  }

  async function createChallenge(uid: string) {
    setBusy(true)
    setErr(null)

    const token = await getAccessTokenOrRedirect()
    if (!token) {
      setBusy(false)
      return
    }

    const initialState = newGame()

    const { data, error } = await supabase.functions.invoke("create_challenge_from_invite", {
      body: {
        inviterId: inviterUuid,
        initialState,
        vgnVersion: "1",
        expiresInDays: 30,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    setBusy(false)

    if (error) throw error

    const resp = data as CreateChallengeResp
    setChallenge(resp)

    if (resp?.gameId) {
      window.location.assign(`/pvp/${resp.gameId}`)
    }
  }

  async function respond(response: "accept" | "decline") {
    if (!challenge) return
    setBusy(true)
    setErr(null)

    const token = await getAccessTokenOrRedirect()
    if (!token) {
      setBusy(false)
      return
    }

    const { data, error } = await supabase.functions.invoke("respond_to_challenge", {
      body: { inviteId: challenge.inviteId, response },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    setBusy(false)

    if (error) {
      setErr(error.message)
      return
    }

    const r = data as RespondResp

    if (r.status === "declined") {
      setWaiting(false)
      stopPoll()
      return
    }

    if (r.status === "accepted") {
      setWaiting(false)
      stopPoll()
      window.location.assign(`/pvp/${r.gameId}`)
      return
    }

    // pending
    setWaiting(true)
    startPollingForGameId(challenge.inviteId)
  }

  function startPollingForGameId(inviteId: string) {
    stopPoll()
    pollTimer.current = window.setInterval(async () => {
      // After you receive resp.inviteId (from create_challenge_from_invite)
      const { data: st, error: stErr } = await supabase
        .from("game_invites")
        .select("status, game_id")
        .eq("id", resp.inviteId)
        .single()

      if (!stErr && st) {
        if (st.status === "accepted" && st.game_id) {
          window.location.assign(`/pvp/${st.game_id}`)
          return
        }
        if (st.status === "declined") {
          // set some local state like setFinalState("declined") or just return
          return
        }
      }
    }, 2000)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (!alive) return
        await ensureAuthAndProfile()
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message ?? String(e))
      }
    })()
    return () => {
      alive = false
      stopPoll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviterUuid])

  const btnStyle: React.CSSProperties = {
    backgroundColor: "#374151",
    border: "1px solid #4b5563",
    color: "#e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 600,
  }

  const btnStyleDanger: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.35)",
  }

  const btnStylePrimary: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    border: "1px solid rgba(59, 130, 246, 0.35)",
  }

  return (
    <div
      style={{
        // match GamePage: force full viewport, ignore any outer layout wrappers
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#1f2937",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#e5e7eb",
        overflow: "hidden",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #1f2937; }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={profile?.username ?? undefined}
        avatarUrl={profile?.avatar_url ?? null}
        titleLabel="Daily"
        elo={undefined}
        activePage={null}
        myGamesTurnCount={0}
        onSignIn={() => {
          const returnTo = encodeURIComponent(`/invite/${inviterUuid}`)
          window.location.assign(`/?openAuth=1&returnTo=${returnTo}`)
        }}
        onOpenProfile={() => navigate("/?openProfile=1")}
        onOpenSkins={() => navigate("/skins")}
        onSignOut={async () => {
          await supabase.auth.signOut()
          navigate("/")
        }}
        onPlay={() => navigate("/")}
        onMyGames={() => navigate("/my-games")}
        onLeaderboard={() => navigate("/leaderboard")}
        onChallenges={() => navigate("/challenges")}
        onRules={() => navigate("/rules")}
        onTutorial={() => navigate("/tutorial")}
      />

      {/* Page body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            backgroundColor: "#374151",
            border: "1px solid #4b5563",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Invite</div>

          {err && (
            <div
              style={{
                color: "#fecaca",
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.35)",
                borderRadius: 10,
                padding: 12,
                marginTop: 8,
              }}
            >
              {err}
            </div>
          )}

          {showOnboarding && userId && (
            <OnboardingModal
              userId={userId}
              onComplete={async () => {
                try {
                  setShowOnboarding(false)
                  await loadProfile(userId)
                  await createChallenge(userId)
                } catch (e: any) {
                  setErr(e?.message ?? String(e))
                }
              }}
            />
          )}

          {!showOnboarding && !challenge && (
            <div style={{ marginTop: 8, opacity: 0.9 }}>
              {busy ? "Preparing challenge..." : "Loading..."}
            </div>
          )}

          {challenge && !waiting && (
            <div style={{ marginTop: 12 }}>
              <div style={{ lineHeight: 1.4 }}>
                <b>{challenge.inviter?.username ?? "Someone"}</b> challenged you to a Daily game.
              </div>

              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button disabled={busy} onClick={() => respond("accept")} style={btnStylePrimary}>
                  Accept
                </button>
                <button disabled={busy} onClick={() => respond("decline")} style={btnStyleDanger}>
                  Decline
                </button>
              </div>
            </div>
          )}

          {challenge && waiting && (
            <div style={{ marginTop: 12 }}>
              <div style={{ lineHeight: 1.4 }}>Waiting for the inviter to accept…</div>

              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button onClick={() => navigate("/")} style={btnStyle}>
                  Home
                </button>
                <button onClick={() => navigate("/challenges")} style={btnStyle}>
                  Challenges
                </button>
              </div>

              <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12 }}>
                You can leave this page. When the inviter accepts, the game will appear in My Games.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}