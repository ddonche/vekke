// src/pages/AiGameWrapper.tsx
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { fetchGame, type PvPGameData } from "../services/pvp_sync"
import { GamePage } from "../components/GamePage"
import type { Player, GameState } from "../engine/state"
import type { TimeControlId } from "../engine/ui_controller"

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

        // Profile + Elo (safe even if AI user has no profile)
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

        // Opponent naming: use ai_level if present
        const lvl = (game as any).ai_level as string | undefined
        const pretty =
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

        setOpponentName(pretty)
        setOpponentElo(1200)

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

  // Minimal persistence: update current_state + turn/status
  const handleMoveComplete = useCallback(
    async (state: GameState) => {
      if (!gameId) return
      const key = makeStateKey(state)
      if (lastSavedKeyRef.current === key) return
      lastSavedKeyRef.current = key

      const nowIso = new Date().toISOString()
      const nextTurn = (state as any)?.player ?? null
      const isOver = Boolean((state as any)?.gameOver)

      const patch: any = {
        current_state: state,
        last_move_at: nowIso,
        turn_started_at: nowIso,
      }
      if (nextTurn) patch.turn = nextTurn
      if (isOver) patch.status = "completed"

      const { error } = await supabase.from("games").update(patch).eq("id", gameId)
      if (error) {
        // Don’t hard-crash the UI; just surface something useful in console for now
        console.error("Failed to save AI game state:", error)
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