// src/pages/PvPGameWrapper.tsx
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { fetchGame, endGame, type PvPGameData } from "../services/pvp_sync"
import { GamePage } from "../components/GamePage"
import type { Player, GameState } from "../engine/state"
import type { TimeControlId } from "../engine/ui_controller"

export function PvPGameWrapper() {
  const { gameId } = useParams<{ gameId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameData, setGameData] = useState<PvPGameData | null>(null)
  const [mySide, setMySide] = useState<Player | null>(null)
  const [myName, setMyName] = useState<string>("You")
  const [myElo, setMyElo] = useState<number>(1200)
  const [opponentName, setOpponentName] = useState<string>("Opponent")
  const [opponentElo, setOpponentElo] = useState<number>(1200)
  const lastSavedMoveRef = useRef<string | number>(-1)
  // Track last state we received from DB so we don't echo it back
  const lastReceivedKeyRef = useRef<string | null>(null)

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
        if (sessionError) throw new Error(`Auth error: ${sessionError.message}`)
        if (!sessionData.session) throw new Error("Not logged in")

        const userId = sessionData.session.user.id

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
        setMyName(myProfile?.username || "You")
        setMyElo(myStats?.elo || 1200)
        setOpponentName(oppProfile?.username || "Opponent")
        setOpponentElo(oppStats?.elo || 1200)
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

  // Subscribe to opponent moves via games table Realtime
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

          const key = snap.phase === "OPENING"
            ? `opening-${snap.openingPlaced.B}-${snap.openingPlaced.W}`
            : `${snap.turn}-${snap.phase}-${snap.log.length}`

          // Stamp what we received so onMoveComplete won't echo it back
          lastReceivedKeyRef.current = key

          setGameData(prev => ({
            ...prev!,
            current_state: snap,
            turn: snap.player,
            last_move_at: updated.last_move_at,
          }))
        }
      )
      .subscribe((status, err) => {
        console.log('PvP: Subscription status:', status)
        if (err) console.error('PvP: Subscription error:', err)
      })

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [gameId, mySide])

  const handleMoveComplete = useCallback(async (state: GameState) => {
    if (!gameId) return

    const stateKey = state.phase === "OPENING"
      ? `opening-${state.openingPlaced.B}-${state.openingPlaced.W}`
      : `${state.turn}-${state.phase}-${state.log.length}`
    if (stateKey === lastReceivedKeyRef.current) return

    try {
      await supabase
        .from("games")
        .update({
          current_state: state,
          last_move_at: new Date().toISOString(),
        })
        .eq("id", gameId)
    } catch (e) {
      console.error("Failed to sync state:", e)
      return
    }

    if (state.gameOver) {
      const saveKey = `gameover-${state.gameOver.winner}`
      if (saveKey !== lastSavedMoveRef.current) {
        lastSavedMoveRef.current = saveKey
        try {
          await endGame({
            gameId,
            winner: state.gameOver.winner,
            reason: state.gameOver.reason,
          })
        } catch (e) {
          console.error("Failed to end game:", e)
        }
      }
    }
  }, [gameId])

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
      onMoveComplete={handleMoveComplete}
    />
  )
}
