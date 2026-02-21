// src/pages/AiGameWrapper.tsx
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { fetchGame, type PvPGameData } from "../services/pvp_sync"
import { GamePage } from "../components/GamePage"
import type { Player, GameState } from "../engine/state"
import { AI_RATING, type TimeControlId } from "../engine/ui_controller"
import type { AiLevel } from "../engine/ai"

// Same helper as PvPGameWrapper — refreshes token before calling edge functions
async function invokeAuthed<T>(fn: string, body: any): Promise<T> {
  const { data: sess, error: sessErr } = await supabase.auth.getSession()
  if (sessErr) throw sessErr
  if (!sess.session) throw new Error("No session token (not logged in)")
  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${sess.session.access_token}` },
  })
  if (error) throw error
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

export function AiGameWrapper() {
  const { gameId } = useParams<{ gameId: string }>()
  const nav = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameData, setGameData] = useState<PvPGameData | null>(null)

  const [mySide, setMySide] = useState<Player | null>(null)
  const [myName, setMyName] = useState<string>("You")
  const [myElo, setMyElo] = useState<number>(1200)
  const [opponentName, setOpponentName] = useState<string>("Computer")
  const [opponentElo, setOpponentElo] = useState<number>(1200)

  const [initialClocks, setInitialClocks] = useState<{ W: number; B: number } | undefined>(
    undefined
  )

  const lastSavedKeyRef = useRef<string | null>(null)
  const prevPlayerRef = useRef<string | null>(null)

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
        if (sessionError) throw new Error(`Auth error: ${sessionError.message}`)
        if (!sessionData.session) throw new Error("Not logged in")

        const userId = sessionData.session.user.id

        const game = await fetchGame(gameId)
        if (!game) throw new Error("Game not found")

        // Determine side (same as PvP wrapper)
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

        // Profile + Elo for the human player
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .maybeSingle()

        const { data: myStats } = await supabase
          .from("player_stats")
          .select("elo")
          .eq("user_id", userId)
          .maybeSingle()

        // Fetch AI player profile from DB (AI players now have profile rows)
        const { data: oppProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", opponentId)
          .maybeSingle()

        // Fallback opponent name from ai_level if no DB profile
        const lvl = (game as any).ai_level as AiLevel | undefined
        const fallbackName =
          lvl === "senior_master"
            ? "Senior Master AI"
            : lvl
            ? `${lvl.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} AI`
            : "Computer"

        if (!mounted) return

        setMySide(side)
        setGameData(game)

        setMyName(myProfile?.username || "You")
        setMyElo(myStats?.elo || 1200)

        setOpponentName(oppProfile?.username || fallbackName)
        setOpponentElo(lvl ? (AI_RATING[lvl] ?? 1200) : 1200)

        // Initial clocks (same logic as PvP wrapper)
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
  }, [gameId])

  // Persist state to DB after each move (both human and AI turns)
  const handleMoveComplete = useCallback(
    async (state: GameState, clocks?: { W: number; B: number }) => {
      if (!gameId) return
      const key = makeStateKey(state)
      if (lastSavedKeyRef.current === key) return
      lastSavedKeyRef.current = key

      const nowIso = new Date().toISOString()
      const nextTurn = (state as any)?.player ?? null
      const isOver = Boolean((state as any)?.gameOver)

      const turnFlipped =
        prevPlayerRef.current === null || prevPlayerRef.current !== nextTurn
      prevPlayerRef.current = nextTurn

      const patch: any = {
        current_state: state,
        last_move_at: nowIso,
      }
      if (turnFlipped || isOver) patch.turn_started_at = nowIso
      if (clocks) {
        patch.clocks_w_ms = Math.round(clocks.W)
        patch.clocks_b_ms = Math.round(clocks.B)
      }
      if (nextTurn) patch.turn = nextTurn

      const { error } = await supabase.from("games").update(patch).eq("id", gameId)
      if (error) {
        console.error("Failed to save AI game state:", error)
        return
      }

      // Finalize game — updates status to "ended", writes Elo + stats
      // finalize_game skips Elo changes when an AI player is involved (AI_IDS check)
      if (isOver) {
        const go = (state as any).gameOver
        await invokeAuthed("finalize_game", {
          gameId,
          winner: go.winner,
          reason: go.reason,
        }).catch((e) => console.error("finalize_game failed:", e))
      }
    },
    [gameId]
  )

  const requestRematch = useCallback(() => {
    // simplest: go back to new AI game screen
    nav("/ai/new")
  }, [nav])

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>
  if (error) return <div style={{ padding: 24, color: "crimson" }}>{error}</div>
  if (!gameData || !mySide) return <div style={{ padding: 24 }}>Missing game data</div>

  return (
    <GamePage
      opponentType="ai"
      mySide={mySide}
      initialState={gameData.current_state ?? gameData.initial_state}
      myName={myName}
      myElo={myElo}
      opponentName={opponentName}
      opponentElo={opponentElo}
      opponentUserId={mySide === "W" ? gameData.brake_id : gameData.wake_id}
      externalGameData={gameData}
      initialTimeControlId={(gameData.format as TimeControlId) ?? "standard"}
      initialClocks={initialClocks}
      onMoveComplete={handleMoveComplete}
      onRequestRematch={requestRematch}
    />
  )
}