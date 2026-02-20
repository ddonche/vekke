// src/pages/PvPGameWrapper.tsx
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { fetchGame, endGame, type PvPGameData } from "../services/pvp_sync"
import { GamePage } from "../components/GamePage"
import type { Player, GameState } from "../engine/state"
import type { TimeControlId } from "../engine/ui_controller"

// ✅ One helper for ALL edge-function calls (actually fixes 401 Invalid JWT)
async function invokeAuthed<T>(fn: string, body: any): Promise<T> {
  // pull current session
  let { data: sess, error: sessErr } = await supabase.auth.getSession()
  if (sessErr) throw sessErr

  // if no session, you're not logged in
  if (!sess.session) throw new Error("Not logged in")

  // check token exp directly (source of truth)
  const getTokenExpMs = (token: string) => {
    const payloadB64 = token.split(".")[1]
    const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")))
    return (payloadJson.exp ?? 0) * 1000
  }

  let token = sess.session.access_token
  let expMs = 0

  try {
    expMs = getTokenExpMs(token)
  } catch {
    // if decode fails, force refresh anyway
    expMs = 0
  }

  const needsRefresh = !expMs || expMs <= Date.now() + 120_000

  if (needsRefresh) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) throw refreshErr
    if (!refreshed.session?.access_token) throw new Error("Refresh returned no session")

    sess = refreshed
    token = refreshed.session.access_token
  }

  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  })

  if (error) {
    const resp = (error as any)?.context as Response | undefined
    if (resp) {
      try {
        console.error(`${fn} error body:`, await resp.text())
      } catch {}
    }
    throw error
  }

  return data as T
}

function makeStateKey(s: GameState) {
  if ((s as any).gameOver) {
    const go: any = (s as any).gameOver
    return `gameover-${go.winner}-${go.reason}-${(s as any).log?.length ?? 0}`
  }
  if ((s as any).phase === "OPENING") {
    const op: any = (s as any).openingPlaced
    return `opening-${op?.B ?? 0}-${op?.W ?? 0}`
  }
  return `${(s as any).player}-${(s as any).phase}-${(s as any).log?.length ?? 0}`
}

export function PvPGameWrapper() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameData, setGameData] = useState<PvPGameData | null>(null)

  const [mySide, setMySide] = useState<Player | null>(null)
  const [myName, setMyName] = useState<string>("You")
  const [myElo, setMyElo] = useState<number>(1200)

  const [opponentName, setOpponentName] = useState<string>("Opponent")
  const [opponentElo, setOpponentElo] = useState<number>(1200)

  const [myUserId, setMyUserId] = useState<string | null>(null)

  const [rematchInviteToken, setRematchInviteToken] = useState<string | null>(null)
  const [rematchFromName, setRematchFromName] = useState<string>("Opponent")
  const seenInviteRef = useRef<string | null>(null)

  const lastSavedMoveRef = useRef<string | number>(-1)
  const lastReceivedKeyRef = useRef<string | null>(null)
  const prevPlayerRef = useRef<string | null>(null)

  const [initialClocks, setInitialClocks] = useState<{ W: number; B: number } | undefined>(
    undefined
  )

  // Load game data on mount
  useEffect(() => {
    if (!gameId) {
      setError("Missing game ID")
      setLoading(false)
      return
    }

    let mounted = true

    ;(async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        // If not logged in, bounce to "/" and let GamePage open auth modal.
        if (sessionError || !sessionData.session) {
          navigate(`/auth?openAuth=1&returnTo=${encodeURIComponent(`/pvp/${gameId}`)}`, { replace: true })
          return
        }

        const userId = sessionData.session.user.id
        setMyUserId(userId)

        const game = await fetchGame(gameId)
        if (!game) throw new Error("Game not found")

        let side: Player
        let opponentId: string
        if (userId === game.wake_id) {
          side = "W"
          opponentId = game.brake_id
        } else if (userId === game.brake_id) {
          side = "B"
          opponentId = game.wake_id
        } else {
          throw new Error("You are not a player in this game")
        }

        const { data: myProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .maybeSingle()

        const { data: oppProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", opponentId)
          .maybeSingle()

        const { data: myStats } = await supabase
          .from("player_stats")
          .select("elo")
          .eq("user_id", userId)
          .maybeSingle()

        const { data: oppStats } = await supabase
          .from("player_stats")
          .select("elo")
          .eq("user_id", opponentId)
          .maybeSingle()

        if (!mounted) return

        setMySide(side)
        setGameData(game)

        prevPlayerRef.current = (game.current_state as any)?.player ?? null

        setMyName(myProfile?.username || "You")
        setMyElo(myStats?.elo || 1200)

        setOpponentName(oppProfile?.username || "Opponent")
        setOpponentElo(oppStats?.elo || 1200)

        setRematchFromName(oppProfile?.username || "Opponent")

        // Restore clocks from DB so refresh does NOT reset the clock
        if (game.clocks_w_ms != null && game.clocks_b_ms != null && game.turn_started_at) {
          const elapsed = Date.now() - new Date(game.turn_started_at).getTime()
          const currentPlayer = (game.current_state as any)?.player ?? game.turn
          setInitialClocks({
            W: currentPlayer === "W" ? Math.max(0, game.clocks_w_ms - elapsed) : game.clocks_w_ms,
            B: currentPlayer === "B" ? Math.max(0, game.clocks_b_ms - elapsed) : game.clocks_b_ms,
          })
        }

        setLoading(false)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message ?? String(e))
        setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [gameId, navigate])

  // Subscribe to game updates so game-over shows immediately for both players
  useEffect(() => {
    if (!gameId || !mySide) return

    const subscription = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const updated = payload.new as PvPGameData
          const snap = updated.current_state as GameState | null
          if (!snap) return

          lastReceivedKeyRef.current = makeStateKey(snap)

          setGameData((prev) => ({
            ...prev!,
            status: updated.status,
            winner_id: (updated as any).winner_id,
            loser_id: (updated as any).loser_id,
            end_reason: (updated as any).end_reason,
            ended_at: (updated as any).ended_at,
            current_state: snap,
            turn: (snap as any).player,
            last_move_at: updated.last_move_at,
            clocks_w_ms: (updated as any).clocks_w_ms,
            clocks_b_ms: (updated as any).clocks_b_ms,
            turn_started_at: (updated as any).turn_started_at,
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [gameId, mySide])

  // Subscribe to rematch invites targeted at this user
  useEffect(() => {
    if (!myUserId) return

    const chan = supabase
      .channel(`rematch:${myUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_invites",
          filter: `invited_user_id=eq.${myUserId}`,
        },
        (payload) => {
          const inv = payload.new as any
          if ((inv.invite_type ?? "pvp") !== "rematch") return

          const token = String(inv.invite_token)
          if (seenInviteRef.current === token) return
          seenInviteRef.current = token

          const exp = new Date(inv.expires_at).getTime()
          if (!Number.isFinite(exp) || exp < Date.now()) return

          setRematchInviteToken(token)
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_invites",
          filter: `invited_user_id=eq.${myUserId}`,
        },
        (payload) => {
          const inv = payload.new as any
          if ((inv.invite_type ?? "pvp") !== "rematch") return

          const token = String(inv.invite_token)
          if (rematchInviteToken && token === rematchInviteToken) {
            if (inv.accepted_at || inv.declined_at) {
              setRematchInviteToken(null)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(chan)
    }
  }, [myUserId, rematchInviteToken])

  const handleMoveComplete = useCallback(
    async (state: GameState, clocks: { W: number; B: number }) => {
      if (!gameId) return

      // If this state came from the DB subscription, don't echo it back
      const stateKey = makeStateKey(state)
      if (stateKey === lastReceivedKeyRef.current) return

      // Turn flip detection (controls turn_started_at)
      const turnFlipped =
        prevPlayerRef.current === null || prevPlayerRef.current !== (state as any).player
      prevPlayerRef.current = (state as any).player

      const nowIso = new Date().toISOString()
      const update: any = {
        current_state: state,
        last_move_at: nowIso,
        clocks_w_ms: Math.round(clocks.W),
        clocks_b_ms: Math.round(clocks.B),
      }

      // Anchor for elapsed-clock reconstruction after refresh
      if (turnFlipped || (state as any).gameOver) {
        update.turn_started_at = nowIso
      }

      const { error: upErr } = await supabase.from("games").update(update).eq("id", gameId)
      if (upErr) {
        console.error("Failed to sync state to games:", upErr)
        return
      }

      // If gameOver, finalize on the server (rating + stats should be done server-side)
      if ((state as any).gameOver) {
        const go: any = (state as any).gameOver

        // Dedup
        const saveKey = `gameover-${go.winner}-${go.reason}`
        if (saveKey === lastSavedMoveRef.current) return
        lastSavedMoveRef.current = saveKey

        // Preferred: finalize_game edge function (idempotent, should update player_stats + rating_applied)
        try {
          await invokeAuthed("finalize_game", {
            gameId,
            winner: go.winner,
            reason: go.reason,
          })
        } catch (e) {
          console.error("finalize_game failed (falling back to endGame):", e)
          // Fallback: whatever your old service does (may not update stats reliably)
          try {
            await endGame({ gameId, winner: go.winner, reason: go.reason })
          } catch (e2) {
            console.error("endGame fallback failed:", e2)
          }
        }
      }
    },
    [gameId]
  )

  // Rematch: create invite (must be authed)
  const requestRematch = useCallback(async () => {
    if (!gameId) return
    try {
      const data = await invokeAuthed<{ inviteToken: string; reused?: boolean }>(
        "create_rematch_invite",
        { sourceGameId: gameId }
      )
      console.log("Rematch invite:", data?.inviteToken, data?.reused ? "(reused)" : "")
    } catch (e) {
      console.error("create_rematch_invite failed:", e)
    }
  }, [gameId])

  const acceptRematch = useCallback(async () => {
    if (!rematchInviteToken) return
    try {
      const data = await invokeAuthed<{ gameId: string }>("accept_invite", {
        inviteToken: rematchInviteToken,
      })
      if (data?.gameId) window.location.href = `/pvp/${data.gameId}`
    } catch (e) {
      console.error("accept_invite failed:", e)
    }
  }, [rematchInviteToken])

  const declineRematch = useCallback(async () => {
    if (!rematchInviteToken) return
    try {
      await invokeAuthed("decline_invite", { inviteToken: rematchInviteToken })
      setRematchInviteToken(null)
    } catch (e) {
      console.error("decline_invite failed:", e)
    }
  }, [rematchInviteToken])

  if (loading) {
    return (
      <div style={{ padding: 16, color: "white", background: "#111", minHeight: "100vh" }}>
        Loading game...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: "red", background: "#111", minHeight: "100vh" }}>
        Error: {error}
      </div>
    )
  }

  if (!gameData || !mySide) {
    return (
      <div style={{ padding: 16, color: "white", background: "#111", minHeight: "100vh" }}>
        Unable to load game
      </div>
    )
  }

  return (
    <>
      {rematchInviteToken && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 12,
              padding: 16,
              width: 360,
              color: "white",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Rematch request</div>
            <div style={{ opacity: 0.9, marginBottom: 12 }}>
              {rematchFromName} would like a rematch.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={declineRematch}>Decline</button>
              <button onClick={acceptRematch}>Accept</button>
            </div>
          </div>
        </div>
      )}

      <GamePage
        opponentType="pvp"
        mySide={mySide}
        initialState={gameData.current_state ?? gameData.initial_state}
        myName={myName}
        myElo={myElo}
        opponentName={opponentName}
        opponentElo={opponentElo}
        externalGameData={gameData}
        initialTimeControlId={(gameData.format as TimeControlId) ?? "standard"}
        initialClocks={initialClocks}
        onMoveComplete={handleMoveComplete}
        onRequestRematch={requestRematch}
      />
    </>
  )
}