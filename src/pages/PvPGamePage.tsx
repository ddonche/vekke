// src/pages/PvPGamePage.tsx
import { useEffect, useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import {
  fetchGame,
  updateGameAfterMove,
  endGame,
  type PvPGameData,
} from "../services/pvp_sync"
import { useVekkeController, TIME_CONTROLS } from "../engine/ui_controller"
import type { Player, GameState } from "../engine/state"
import { Howl } from "howler"

// Import your sound files - adjust paths as needed
const sounds = {
  move: new Howl({ src: ["/sounds/move.mp3"] }),
  capture: new Howl({ src: ["/sounds/capture.mp3"] }),
  place: new Howl({ src: ["/sounds/place.mp3"] }),
  swap: new Howl({ src: ["/sounds/swap.mp3"] }),
  click: new Howl({ src: ["/sounds/click.mp3"] }),
  invalid: new Howl({ src: ["/sounds/invalid.mp3"] }),
  gameOver: new Howl({ src: ["/sounds/game-over.mp3"] }),
  siegeLock: new Howl({ src: ["/sounds/siege-lock.mp3"] }),
  siegeBreak: new Howl({ src: ["/sounds/siege-break.mp3"] }),
}

export function PvPGamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameData, setGameData] = useState<PvPGameData | null>(null)
  const [mySide, setMySide] = useState<Player | null>(null)
  const [opponentName, setOpponentName] = useState<string>("Opponent")
  const lastSyncedStateRef = useRef<string | null>(null)

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
        // Get current user
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw new Error(`Auth error: ${sessionError.message}`)
        if (!sessionData.session) throw new Error("Not logged in")

        const userId = sessionData.session.user.id

        // Fetch game
        const game = await fetchGame(gameId)
        if (!game) throw new Error("Game not found")

        // Determine which side we're playing
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

        // Fetch opponent's profile
        const { data: oppProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", opponentId)
          .maybeSingle()

        if (!mounted) return

        setMySide(side)
        setGameData(game)
        if (oppProfile?.username) setOpponentName(oppProfile.username)
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

  // Initialize controller with loaded state
  const initialState = gameData?.current_state ?? gameData?.initial_state
  const timeControlId = (gameData?.format ?? "standard") as any

  const { g, actions, started } = useVekkeController({
    sounds,
    opponentType: "pvp",
    mySide: mySide ?? undefined,
    initialState,
    onMoveComplete: async (state: GameState) => {
      if (!gameId || !mySide || !gameData) return

      // Debounce - only sync if state actually changed
      const stateKey = JSON.stringify(state)
      if (stateKey === lastSyncedStateRef.current) return
      lastSyncedStateRef.current = stateKey

      try {
        // Update games table with new state and turn (TURN-GUARDED)
        await updateGameAfterMove({
          gameId,
          newTurn: state.player,
          currentState: state,
          expectedTurn: mySide, // <- critical: prevents out-of-turn overwrites
        })

        // If game is over, call endGame
        if (state.gameOver) {
          await endGame({
            gameId,
            winner: state.gameOver.winner,
            reason: state.gameOver.reason,
          })
        }
      } catch (e: any) {
        console.error("Failed to sync move:", e)
        alert(`Failed to sync move: ${String(e?.message ?? e)}`)
      }
    },
  })

  // Subscribe to games snapshot updates via Realtime
  useEffect(() => {
    if (!gameId || !mySide) return

    const channel = supabase
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
          const snap = (updated.current_state ?? null) as GameState | null
          if (!snap) return

          // Apply the snapshot when it becomes MY turn (opponent just moved).
          // Use the snapshot's next-player field as the authoritative check.
          if (snap.player === mySide) {
            actions.loadState(snap)
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[PvP realtime] ${gameId} status:`, status)
        if (err) console.error(`[PvP realtime] ${gameId} error:`, err)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, mySide, actions])

  // Auto-start when game loads
  useEffect(() => {
    if (gameData && !started) {
      actions.setStarted(true)
    }
  }, [gameData, started, actions])

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

  const isMyTurn = g.player === mySide
  const timeControl = TIME_CONTROLS[timeControlId]

  return (
    <div
      style={{
        background: "#111",
        minHeight: "100vh",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: 800,
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Playing as</div>
          <div style={{ fontSize: 20, fontWeight: "bold" }}>{mySide === "W" ? "WAKE" : "BRAKE"}</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, opacity: 0.6 }}>vs</div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>{opponentName}</div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Time Control</div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>{timeControl.label}</div>
        </div>
      </div>

      {/* Turn indicator */}
      {!g.gameOver && (
        <div
          style={{
            padding: 12,
            background: isMyTurn ? "#065f46" : "#7c2d12",
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: "bold",
          }}
        >
          {isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
        </div>
      )}

      {/* Game over banner */}
      {g.gameOver && (
        <div
          style={{
            padding: 12,
            background: g.gameOver.winner === mySide ? "#065f46" : "#7c2d12",
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: "bold",
          }}
        >
          {g.gameOver.winner === mySide ? "YOU WIN!" : "YOU LOSE"}
          {" - "}
          {g.gameOver.reason}
        </div>
      )}

      {/*
        TODO: Render your actual game board here
        Use the same board rendering code from GamePage
        Pass in: g, actions, mySide, etc.

        For now, just show game state
      */}
      <div
        style={{
          background: "#1f2937",
          border: "1px solid #374151",
          borderRadius: 8,
          padding: 16,
          maxWidth: 800,
          width: "100%",
        }}
      >
        <div style={{ marginBottom: 8 }}>Round: {g.round}</div>
        <div style={{ marginBottom: 8 }}>Phase: {g.phase}</div>
        <div style={{ marginBottom: 8 }}>
          Reserves: W {g.reserves.W} | B {g.reserves.B}
        </div>
        <div style={{ marginBottom: 8 }}>
          Captives: W {g.captives.W} | B {g.captives.B}
        </div>
        <div>
          <strong>Board will render here once you integrate your GamePage board component</strong>
        </div>
      </div>
    </div>
  )
}
