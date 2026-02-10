import React, { useEffect, useState } from "react"
import { SIZE, toSq, type Coord } from "./engine/coords"
import type { GameState, Player, Token } from "./engine/state"
import type { Direction } from "./engine/directions"
import { sounds } from "./sounds"
import { RouteIcon } from "./RouteIcon"
import { useVekkeController } from "./engine/ui_controller"
import { GridBoard } from "./GridBoard"
import { IntersectionBoard } from "./IntersectionBoard"
import { AuthModal } from "./AuthModal"
import { OnboardingModal } from "./OnboardingModal"
import { ProfileModal } from "./ProfileModal"
import { HelpModal } from "./HelpModal"
import { supabase } from "./supabase"

class ErrBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any; stack: string }
> {
  state = { err: null, stack: "" }

  static getDerivedStateFromError(err: any) {
    return { err, stack: "" }
  }

  componentDidCatch(err: any, info: any) {
    console.error("RENDER CRASH:", err)
    console.error("COMPONENT STACK:", info?.componentStack)
    this.setState({ stack: String(info?.componentStack ?? "") })
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: "1rem", color: "white", background: "#111" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Render crashed</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.err?.message ?? this.state.err)}
          </pre>
          {this.state.stack && (
            <>
              <div style={{ fontWeight: 900, marginTop: 12, marginBottom: 6 }}>
                Component stack
              </div>
              <pre style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>
                {this.state.stack}
              </pre>
            </>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const {
    g,
    selectedTokenId,
    selected,
    human,
    started,
    audioReady,
    aiDifficulty,
    clocks,
    timeControl,
    timeControlId,
    TIME_CONTROLS,
    boardMap,
    remainingRoutes,
    forcedYieldAvailable,
    earlySwapArmed,
    canPickQueueForSwap,
    canEarlySwap,
    canBuyExtraReinforcement,
    evasionArmed,
    canUseEvasion,
    pendingEvasion,
    evasionSourcePos,
    evasionPlayer,
    clockPlayer,
    constants: { EARLY_SWAP_COST, EXTRA_REINFORCEMENT_COST, EVASION_COST_CAPTIVES, EVASION_COST_RESERVES },
    actions,
  } = useVekkeController({ sounds, aiDelayMs: 1200 })

  const [ghost, setGhost] = useState<null | {
    by: Player
    from: Coord
    tokenId: string
    dir: Direction
    born: number
  }>(null)

  const GHOST_MS = 1000

  const [boardStyle, setBoardStyle] = useState<"grid" | "intersection">("grid")
  const [showLogExpanded, setShowLogExpanded] = useState(false)
  const [showChatExpanded, setShowChatExpanded] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState<"currentPlayer" | "evasion" | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<{
    username: string
    country_code: string | null
    country_name: string | null
    avatar_url: string | null
  } | null>(null)

  // Helper for padding numbers
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  // Format clock time from milliseconds
  const fmtClock = (ms: number) => {
    const totalSec = Math.max(0, Math.ceil(ms / 1000))
    const sec = totalSec % 60
    const totalMin = Math.floor(totalSec / 60)
    const min = totalMin % 60
    const hours = Math.floor(totalMin / 60)

    // Daily uses HH:MM:SS, others use M:SS
    if (timeControlId === "daily") {
      return `${hours}:${pad2(min)}:${pad2(sec)}`
    }
    return `${totalMin}:${pad2(sec)}`
  }

  // Ghost token animation (show the "from" square briefly after a move)
  useEffect(() => {
    if (!started) {
      setGhost(null)
      return
    }

    if (!g.lastMove) {
      setGhost(null)
      return
    }

    const lm = g.lastMove
    const elapsed = Date.now() - lm.moveNumber
    if (elapsed > GHOST_MS) {
      setGhost(null)
      return
    }

    // Anchor ghost data to the authoritative lastMove from the controller.
    setGhost({
      by: lm.by,
      from: lm.from,
      tokenId: lm.tokenId,
      dir: lm.dir,
      born: lm.moveNumber,
    })

    const interval = window.setInterval(() => {
      // Force re-render so alpha can decay over time.
      setGhost((prev) => (prev ? { ...prev } : prev))
    }, 50)

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setGhost(null)
    }, Math.max(0, GHOST_MS - elapsed))

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [started, g.lastMove?.moveNumber])

  // ===== TWO MODES ONLY: WEB vs MOBILE =====
  // Wider breakpoint so shrinking the browser reliably flips to mobile.
  const MOBILE_BREAKPOINT = 1100
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  // Board style toggle with 'B' key
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') {
        setBoardStyle(prev => prev === "grid" ? "intersection" : "grid")
      }
    }
    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [])

  // Auth state listener - check if user needs onboarding
  useEffect(() => {
    const checkOnboarding = async (userId: string) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, country_code, country_name, avatar_url")
        .eq("id", userId)
        .single()

      if (!profile) return

      // Store profile
      setUserProfile(profile)

      // Check if user needs onboarding
      const needsOnboarding = 
        profile.username.startsWith("user_") || 
        !profile.country_code

      if (needsOnboarding) {
        setShowOnboardingModal(true)
      }
    }

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        checkOnboarding(session.user.id)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        checkOnboarding(session.user.id)
      } else {
        setCurrentUserId(null)
        setUserProfile(null)
        setShowOnboardingModal(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const whitePlayer = {
    username: human === "W" 
      ? (userProfile?.username || "White Player")
      : "Computer",
    elo: 1842,
    avatar: "W",
    avatar_url: human === "W" && userProfile?.avatar_url 
      ? `${userProfile.avatar_url}?t=${Date.now()}` 
      : null,
    country: human === "W" 
      ? (userProfile?.country_code || "US")
      : "US",
  }

  const bluePlayer = {
    username: human === "B" 
      ? (userProfile?.username || "Blue Player")
      : "Computer",
    elo: 1798,
    avatar: "B",
    avatar_url: human === "B" && userProfile?.avatar_url 
      ? `${userProfile.avatar_url}?t=${Date.now()}` 
      : null,
    country: human === "B" 
      ? (userProfile?.country_code || "JP")
      : "JP",
  }

  // Display positioning: human always right/bottom, opponent always left/top
  const topPlayer = human === "W" ? bluePlayer : whitePlayer
  const bottomPlayer = human === "W" ? whitePlayer : bluePlayer
  const leftPlayer = human === "W" ? bluePlayer : whitePlayer
  const rightPlayer = human === "W" ? whitePlayer : bluePlayer

  // ------------------------------------------------------------
  // Chat
  // ------------------------------------------------------------
  type ChatMsg = { id: string; at: number; from: "W" | "B" | "SYS"; text: string }
  const [chatInput, setChatInput] = useState("")
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>(() => [
    { id: "seed-1", at: Date.now(), from: (human === "W" ? "B" : "W") as "W" | "B", text: "Good luck!" },
    { id: "seed-2", at: Date.now(), from: human as "W" | "B", text: "Thanks, you too!" },
  ])
  function pushChat(from: "W" | "B" | "SYS", text: string) {
    const t = String(text ?? "").trim()
    if (!t) return
    setChatMsgs((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, at: Date.now(), from, text: t }])
  }
  function sendChat() {
    pushChat(human as "W" | "B", chatInput)
    setChatInput("")
  }

  return (
    <ErrBoundary>
      <div
        style={{
          // FORCE full viewport, regardless of any global centering/max-width rules.
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

          .token-white {
            background: radial-gradient(circle at 30% 30%, #ffffff, #f5f5f5 15%, #c8c8c8 40%, #8e8e8e 65%, #5a5a5a);
            box-shadow:
              inset -0.15em -0.15em 0.5em rgba(0, 0, 0, 0.45),
              inset 0.15em 0.15em 0.5em rgba(255, 255, 255, 1),
              inset 0 0 1em rgba(0, 0, 0, 0.15),
              0 0.3em 0.8em rgba(0, 0, 0, 0.6),
              0 0.15em 0.3em rgba(0, 0, 0, 0.4);
            transform: translateZ(0);
            filter: drop-shadow(0 0.08em 0 rgba(0,0,0,0.22));
          }

          .token-teal {
            background: radial-gradient(circle at 30% 30%, #ffffff, #5de8f7 20%, #26c6da 40%, #00acc1 65%, #006064);
            box-shadow:
              inset -0.12em -0.12em 0.5em rgba(0, 0, 0, 0.5),
              inset 0.12em 0.12em 0.5em rgba(255, 255, 255, 0.6),
              inset 0 0 1em rgba(0, 137, 123, 0.2),
              0 0.3em 0.8em rgba(0, 0, 0, 0.6),
              0 0.15em 0.3em rgba(0, 0, 0, 0.4);
            transform: translateZ(0);
            filter: drop-shadow(0 0.08em 0 rgba(0,0,0,0.22));
          }

          .token-white::before,
          .token-teal::before {
            content: '';
            position: absolute;
            inset: 0.08em;
            border-radius: 50%;
            box-shadow:
              inset 0 0.04em 0.08em rgba(255,255,255,0.35),
              inset 0 -0.12em 0.16em rgba(0,0,0,0.45);
            pointer-events: none;
          }

          .token-white::after,
          .token-teal::after {
            content: '';
            position: absolute;
            top: 14%;
            left: 18%;
            width: 46%;
            height: 38%;
            border-radius: 50%;
            background: radial-gradient(circle at 35% 35%,
              rgba(255,255,255,0.75) 0%,
              rgba(255,255,255,0.28) 28%,
              rgba(255,255,255,0.00) 70%
            );
            filter: blur(0.08em);
            pointer-events: none;
          }

          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .hide-scrollbar {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }

          .token-ghost { opacity: 0.3; }
        `}</style>

        {!started && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#374151",
                border: "1px solid #4b5563",
                borderRadius: "12px",
                padding: "16px",
                maxWidth: "90vw",
                width: "25rem",
                color: "#e5e7eb",
                position: "relative",
              }}
            >
              {/* Close button */}
              <button
                onClick={() => actions.setStarted(true)}
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "4px",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent"
                }}
              >
                ×
              </button>

              {/* Logo */}
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <img 
                  src="/logo.png" 
                  alt="Vekke" 
                  style={{ height: "48px", width: "auto" }}
                />
              </div>

              {/* User section - Sign In or Welcome back */}
              {userProfile ? (
                // Logged in - compact horizontal layout
                <div
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "0.625rem",
                    border: "1px solid #4b5563",
                    backgroundColor: "#1f2937",
                    marginBottom: "12px",
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      backgroundColor: "#9ca3af",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      fontSize: "1.125rem",
                      fontWeight: "bold",
                      color: "#1f2937",
                      flexShrink: 0,
                    }}
                  >
                    {userProfile.avatar_url ? (
                      <img
                        src={`${userProfile.avatar_url}?t=${Date.now()}`}
                        alt={userProfile.username}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      userProfile.username[0].toUpperCase()
                    )}
                  </div>
                  
                  {/* Info grid */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: username and country */}
                    <div style={{ display: "flex", gap: "12px", alignItems: "baseline", marginBottom: "4px" }}>
                      <div style={{ fontSize: "0.9375rem", fontWeight: "bold", color: "#e5e7eb" }}>
                        {userProfile.username}
                      </div>
                      {userProfile.country_name && (
                        <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                          {userProfile.country_name}
                        </div>
                      )}
                    </div>
                    {/* Bottom row: edit profile */}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setShowProfileModal(true)
                      }}
                      style={{
                        color: "#9ca3af",
                        fontSize: "0.6875rem",
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      Edit Profile
                    </a>
                  </div>
                </div>
              ) : (
                // Not logged in - show Sign In button
                <button
                  onClick={() => setShowAuthModal(true)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "0.625rem",
                    border: "2px solid #111",
                    backgroundColor: "#ee484c",
                    color: "white",
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    marginBottom: "12px",
                  }}
                >
                  Sign In
                </button>
              )}

              {/* Promotional text - only show when not logged in */}
              {!userProfile && (
                <div
                  style={{
                    fontSize: "0.75rem",
                    opacity: 0.75,
                    marginBottom: "14px",
                    lineHeight: 1.35,
                    textAlign: "center",
                    color: "#d1d5db",
                  }}
                >
                  Create an account to play vs others, get ranked, play friends, and do tournaments.
                </div>
              )}

              {/* Separator */}
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#4b5563",
                  marginBottom: "14px",
                }}
              />

              {/* Time Control Selection */}
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  marginBottom: "8px",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Time Control
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                {(["standard", "rapid", "blitz", "daily"] as const).map((id) => {
                  const labels = {
                    standard: "10 mins",
                    rapid: "5 mins",
                    blitz: "3 mins",
                    daily: "24 hrs",
                  } as const

                  return (
                    <button
                      key={id}
                      onClick={() => actions.setTimeControlId(id)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: timeControlId === id ? "2px solid #5de8f7" : "1px solid #4b5563",
                        background: timeControlId === id ? "#1f2937" : "#374151",
                        color: timeControlId === id ? "#5de8f7" : "#e5e7eb",
                        fontWeight: 900,
                        cursor: "pointer",
                        fontSize: "0.875rem",
                      }}
                    >
                      {labels[id]}
                    </button>
                  )
                })}
              </div>

              {/* AI Difficulty Selection */}
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  marginBottom: "8px",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Opponent
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <button
                  onClick={() => actions.setAiDifficulty("novice")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: aiDifficulty === "novice" ? "2px solid #5de8f7" : "1px solid #4b5563",
                    background: aiDifficulty === "novice" ? "#1f2937" : "#374151",
                    color: aiDifficulty === "novice" ? "#5de8f7" : "#e5e7eb",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Novice AI
                </button>
                <button
                  onClick={() => actions.setAiDifficulty("intermediate")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: aiDifficulty === "intermediate" ? "2px solid #5de8f7" : "1px solid #4b5563",
                    background: aiDifficulty === "intermediate" ? "#1f2937" : "#374151",
                    color: aiDifficulty === "intermediate" ? "#5de8f7" : "#e5e7eb",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Intermediate AI
                </button>
                <button
                  onClick={() => {
                    // TODO: Wire up tutorial
                    console.log("Learn to Play clicked")
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #4b5563",
                    background: "#374151",
                    color: "#e5e7eb",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Tutorial
                </button>
              </div>

              <div
                style={{
                  fontSize: "0.6875rem",
                  opacity: 0.7,
                  marginBottom: "14px",
                  lineHeight: 1.35,
                  textAlign: "center",
                  color: "#9ca3af",
                }}
              >
                First time? Play our walkthrough tutorial
              </div>

              {/* Board Style Selection */}
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  marginBottom: "8px",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Board Style
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                <button
                  onClick={() => setBoardStyle("grid")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: boardStyle === "grid" ? "2px solid #5de8f7" : "1px solid #4b5563",
                    background: boardStyle === "grid" ? "#1f2937" : "#374151",
                    color: boardStyle === "grid" ? "#5de8f7" : "#e5e7eb",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Grid Squares
                </button>
                <button
                  onClick={() => setBoardStyle("intersection")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: boardStyle === "intersection" ? "2px solid #5de8f7" : "1px solid #4b5563",
                    background: boardStyle === "intersection" ? "#1f2937" : "#374151",
                    color: boardStyle === "intersection" ? "#5de8f7" : "#e5e7eb",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Intersections
                </button>
              </div>

              <div
                style={{
                  fontSize: "0.6875rem",
                  opacity: 0.7,
                  marginBottom: "14px",
                  lineHeight: 1.35,
                  textAlign: "center",
                  color: "#9ca3af",
                }}
              >
                {boardStyle === "grid" 
                  ? "Grid squares for learning and casual play"
                  : "Go-style intersections for tournament play"}
              </div>

              <button
                onClick={async () => {
                  await actions.unlockAudio()
                  actions.newGame(timeControlId)
                  actions.setStarted(true)
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "0.625rem",
                  border: "2px solid #111",
                  backgroundColor: "#ee484c",
                  color: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Start Game
              </button>

              {/* Bottom links */}
              <div
                style={{
                  marginTop: "16px",
                  textAlign: "center",
                  fontSize: "0.75rem",
                  color: "#9ca3af",
                }}
              >
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    console.log("Leaderboard clicked")
                  }}
                  style={{
                    color: "#9ca3af",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  Leaderboard
                </a>
                <span style={{ margin: "0 8px", opacity: 0.5 }}>•</span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    console.log("Wiki clicked")
                  }}
                  style={{
                    color: "#9ca3af",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  Wiki
                </a>
              </div>
            </div>
          </div>
        )}

        {isMobile ? (
          /* ===== MOBILE LAYOUT ===== */
          <>
            {/* Menu Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.375rem 0.5rem",
                backgroundColor: "#374151",
                borderBottom: "1px solid #4b5563",
                height: "2.25rem",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
              >
                <img 
                  src="/logo.png" 
                  alt="Vekke" 
                  style={{ height: "1.5rem", width: "auto" }}
                />
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {userProfile ? (
                  <>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setShowProfileModal(true)
                      }}
                      style={{
                        fontSize: "0.75rem",
                        color: "#e5e7eb",
                        fontWeight: "bold",
                        maxWidth: "120px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      {userProfile.username}
                    </a>
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut()
                      }}
                      style={{
                        fontSize: "0.75rem",
                        background: "none",
                        border: "1px solid #4b5563",
                        color: "#e5e7eb",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: "bold",
                      }}
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    style={{
                      fontSize: "0.75rem",
                      background: "none",
                      border: "1px solid #4b5563",
                      color: "#e5e7eb",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Login
                  </button>
                )}
              </div>
            </div>

            {/* Chat Section */}
            <div
              style={{
                backgroundColor: "#1f2937",
                borderBottom: "1px solid #4b5563",
              }}
            >
              <div
                style={{
                  padding: "0.375rem 0.5rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onClick={() => setShowChatExpanded(!showChatExpanded)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    fontWeight: "bold",
                    fontSize: "0.6875rem",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Chat</span>
                </div>
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    fontSize: "1rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {showChatExpanded ? "▲" : "▼"}
                </button>
              </div>

              {!showChatExpanded && (
                <div
                  style={{
                    padding: "0.375rem 0.5rem",
                    fontSize: "0.6875rem",
                    color: "#d1d5db",
                    borderTop: "1px solid #4b5563",
                  }}
                >
                  {chatMsgs.length > 0 && (() => {
                    const m = chatMsgs[chatMsgs.length - 1]
                    const name = m.from === "SYS" ? "System" : m.from === "B" ? bluePlayer.username : whitePlayer.username
                    const color = m.from === "SYS" ? "#9ca3af" : m.from === "B" ? "#5de8f7" : "#e5e7eb"
                    return <><span style={{ fontWeight: "bold", color }}>{name}:</span>{" "}{m.text}</>
                  })()}
                </div>
              )}

              {showChatExpanded && (
                <div style={{ borderTop: "1px solid #4b5563" }}>
                  <div style={{ display: "flex", gap: 6, padding: "0.375rem 0.5rem", borderBottom: "1px solid #4b5563" }}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendChat() }}
                      placeholder="Message…"
                      style={{ flexGrow: 1, background: "#111827", border: "1px solid #374151", borderRadius: 6, padding: "6px 8px", color: "#e5e7eb", outline: "none", fontSize: "0.6875rem" }}
                    />
                    <button onClick={sendChat} style={{ background: "#5de8f7", border: "none", borderRadius: 6, padding: "6px 10px", fontWeight: 900, cursor: "pointer", color: "#0b1220", fontSize: "0.6875rem", flexShrink: 0 }}>
                      Send
                    </button>
                  </div>
                  <div
                    style={{
                      padding: "0.5rem",
                      fontSize: "0.6875rem",
                      color: "#d1d5db",
                      maxHeight: "10rem",
                      overflowY: "auto",
                    }}
                    className="hide-scrollbar"
                  >
                    {[...chatMsgs].reverse().map((m) => {
                      const name = m.from === "SYS" ? "System" : m.from === "B" ? bluePlayer.username : whitePlayer.username
                      const color = m.from === "SYS" ? "#9ca3af" : m.from === "B" ? "#5de8f7" : "#e5e7eb"
                      return (
                        <div key={m.id} style={{ marginBottom: "0.25rem" }}>
                          <span style={{ fontWeight: "bold", color }}>{name}:</span>{" "}{m.text}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable Content Area */}
            <div style={{ flex: 1, overflowY: "auto" }} className="hide-scrollbar">
              {/* White Player */}
              <div
                style={{
                  padding: "0.25rem 0.375rem",
                  backgroundColor: "#374151",
                  borderBottom: "1px solid #4b5563",
                  flexShrink: 0,
                }}
              >
                {/* Top row: Player info (left) + Special moves (right) */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "0.375rem",
                    paddingBottom: "6px",
                  }}
                >
                  {/* Left 50%: Avatar, name, ELO */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <div
                      style={{
                        width: "2.25rem",
                        height: "2.25rem",
                        borderRadius: "50%",
                        backgroundColor: "#9ca3af",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.125rem",
                        fontWeight: "bold",
                        color: "#1f2937",
                        overflow: "hidden",
                      }}
                    >
                      {topPlayer.avatar_url ? (
                        <img
                          src={topPlayer.avatar_url}
                          alt={topPlayer.username}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        topPlayer.avatar
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "0.25rem",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: "bold",
                            fontSize: "0.8125rem",
                            color: "#e5e7eb",
                          }}
                        >
                          {topPlayer.username}
                        </span>
                        <span
                          style={{ fontSize: "0.6875rem", color: "#9ca3af" }}
                        >
                          ({topPlayer.elo})
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.6875rem",
                          color: "#d1d5db",
                        }}
                      >
                        <div
                          className={topPlayer.avatar === "W" ? "token-white" : "token-teal"}
                          style={{
                            width: "0.75rem",
                            height: "0.75rem",
                            borderRadius: "50%",
                            position: "relative",
                          }}
                        ></div>
                        <span>{topPlayer.avatar === "W" ? "White" : "Blue"}</span>
                        {topPlayer.country === "US" ? (
                          <svg
                            width="16"
                            height="12"
                            viewBox="0 0 16 12"
                            style={{ marginLeft: "6px" }}
                          >
                            <rect width="16" height="12" fill="#B22234" />
                            <rect y="1.5" width="16" height="1.5" fill="#fff" />
                            <rect y="4.5" width="16" height="1.5" fill="#fff" />
                            <rect y="7.5" width="16" height="1.5" fill="#fff" />
                            <rect y="10.5" width="16" height="1.5" fill="#fff" />
                            <rect width="6.4" height="6" fill="#3C3B6E" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="12"
                            viewBox="0 0 16 12"
                            style={{ marginLeft: "6px" }}
                          >
                            <circle cx="8" cy="6" r="4" fill="#BC002D" />
                          </svg>
                        )}
                        <span
                          style={{
                            fontSize: "0.625rem",
                            color: "#9ca3af",
                            fontWeight: "bold",
                          }}
                        >
                          {topPlayer.country}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right 50%: Special moves */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "0.5rem",
                    }}
                  >
                    {/* Route Swap - only show when it's this player's turn */}
                    {g.player === topPlayer.avatar && (
                      <button
                        onClick={() => canEarlySwap && actions.armEarlySwap()}
                        disabled={!canEarlySwap}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canEarlySwap ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canEarlySwap ? 1 : 0.5,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ee484c"
                          strokeWidth="1"
                        >
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <path d="M16 16h5v5" />
                        </svg>
                      </button>
                    )}

                    {/* Early Reinforcement - only show when it's this player's turn */}
                    {g.player === topPlayer.avatar && (
                      <button
                        onClick={() =>
                          canBuyExtraReinforcement &&
                          actions.buyExtraReinforcement()
                        }
                        disabled={!canBuyExtraReinforcement}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canBuyExtraReinforcement ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canBuyExtraReinforcement ? 1 : 0.5,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ee484c"
                          strokeWidth="1"
                        >
                          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                          <path d="M9 12h6" />
                          <path d="M12 9v6" />
                        </svg>
                      </button>
                    )}

                    {/* Evasion - only show when it's opponent's turn */}
                    {g.player !== topPlayer.avatar && (
                      <button
                        onClick={() => canUseEvasion && actions.armEvasion()}
                        disabled={!canUseEvasion}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canUseEvasion ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canUseEvasion ? 1 : 0.5,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ee484c"
                          strokeWidth="1"
                        >
                          <path d="M9 10h.01" />
                          <path d="M15 10h.01" />
                          <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
                        </svg>
                      </button>
                    )}

                    {/* Help icon */}
                    <button
                      onClick={() => setShowHelpModal(g.player === topPlayer.avatar ? "currentPlayer" : "evasion")}
                      style={{
                        background: "none",
                        border: "1px solid #6b7280",
                        borderRadius: "50%",
                        color: "#9ca3af",
                        fontSize: "1rem",
                        cursor: "pointer",
                        padding: "2px",
                        lineHeight: "1",
                        width: "1.5rem",
                        height: "1.5rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ?
                    </button>
                  </div>
                </div>

                {/* Bottom row: Reserves/Captives (left) + Route cards (right) */}
                <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "8px" }}>
                  {/* Left 50%: Reserves and Captives */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      gap: "0.75rem",
                      justifyContent: "center",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.6875rem",
                        color: "#e5e7eb",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.125rem",
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>R:</span>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.1875rem",
                          maxWidth: "5rem",
                        }}
                      >
                        {Array.from({ length: g.reserves[topPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div
                            key={i}
                            className={topPlayer.avatar === "W" ? "token-white" : "token-teal"}
                            style={{
                              width: "0.75rem",
                              height: "0.75rem",
                              borderRadius: "50%",
                              position: "relative",
                              display: "inline-block",
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "0.6875rem",
                        color: "#e5e7eb",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.125rem",
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>C:</span>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.1875rem",
                          maxWidth: "5rem",
                        }}
                      >
                        {Array.from({ length: g.captives.W }).map((_, i) => (
                          <div
                            key={i}
                            className="token-teal"
                            style={{
                              width: "0.75rem",
                              height: "0.75rem",
                              borderRadius: "50%",
                              position: "relative",
                              display: "inline-block",
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right 50%: Route cards */}
                  <div style={{ flex: 1, display: "flex", gap: "0.25rem", justifyContent: "space-between" }}>
                    {g.routes[topPlayer.avatar as "W" | "B"].slice(0, 4).map((r) => {
                      const isActive = g.player === topPlayer.avatar
                      const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                        const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                      const isSelected = g.pendingSwap.handRouteId === r.id

                      return (
                        <RouteIcon
                          key={r.id}
                          route={r}
                          onClick={() => isActive && !used && actions.playRoute(topPlayer.avatar as "W" | "B", r.id)}
                          selected={isSelected}
                          highlightColor="#ee484c"
                          style={{
                            width: "2.1875rem",
                            aspectRatio: "7/13",
                            cursor: isActive && !used ? "pointer" : "default",
                            opacity: used ? 0.3 : 1,
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Clock */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0.5rem",
                  backgroundColor: "#374151",
                  gap: "0.375rem",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2 2" />
                  <path d="M5 3 2 6" />
                  <path d="m22 6-3-3" />
                  <path d="M6.38 18.7 4 21" />
                  <path d="M17.64 18.67 20 21" />
                </svg>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.875rem", fontWeight: "bold" }}>
                  <div style={{ opacity: g.player === "W" ? 1 : 0.6 }}>
                    W {fmtClock(clocks.W)}
                  </div>
                  <div style={{ opacity: g.player === "B" ? 1 : 0.6 }}>
                    B {fmtClock(clocks.B)}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: "0.6875rem" }}>{timeControl.label}</div>
                </div>
              </div>

              {/* Phase Banner - between clock and board */}
              <div style={{ padding: "0 0.375rem", backgroundColor: "#374151" }}>
                <div style={{ height: 50, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6 }}>
                  {/* Messages Area - phase text and warnings */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: "#5de8f7",
                      textAlign: "center",
                      minHeight: 20,
                    }}
                  >
                    {evasionArmed ? (
                      `${g.player === "W" ? "B" : "W"} is currently in Evasion`
                    ) : (
                      <>
                        {g.phase}: {g.player}{" "}
                        {g.phase === "ACTION"
                          ? "make your moves"
                          : g.phase === "REINFORCE"
                            ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                  place {g.reinforcementsToPlace} reinforcements
                                  {Array.from({ length: g.reinforcementsToPlace }).map((_, i) => (
                                    <div 
                                      key={i} 
                                      className={g.player === "W" ? "token-white" : "token-teal"}
                                      style={{ width: "0.625rem", height: "0.625rem", borderRadius: "50%", position: "relative" }}
                                    />
                                  ))}
                                </span>
                              )
                            : g.phase === "SWAP"
                              ? "make a route swap"
                              : "place opening tokens"}
                      </>
                    )}
                    {g.warning && (
                        <div
                          style={{
                            marginTop: 3,
                            color: "#ef4444",
                            fontWeight: 900,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontSize: 11,
                          }}
                        >
                          {g.warning}
                        </div>
                      )}
                  </div>
                  
                  {/* Info Row - latest log and resign (won't move) */}
                  <div
                    style={{
                      fontSize: 11,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#d1d5db",
                      paddingLeft: 6,
                      paddingRight: 6,
                    }}
                  >
                    {g.log.length === 0 ? (
                      <div style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}>
                        No moves yet
                      </div>
                    ) : (
                      <div
                        key={g.log[0]}
                        style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}
                      >
                        {g.log[0].replace(/==/g, '').trim()}
                      </div>
                    )}
                    <button
                      onClick={() => actions.resign()}
                      disabled={!started || !!g.gameOver}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ee484c",
                        fontSize: 11,
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 900,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        opacity: (!started || !!g.gameOver) ? 0.5 : 1,
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ee484c"
                        strokeWidth="2"
                      >
                        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                        <path d="M12 8v4" />
                        <path d="M12 16h.01" />
                      </svg>
                      <span>Resign</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Board + Route Queue + Void */}
              <div
                style={{
                  display: "flex",
                  gap: "0.375rem",
                  padding: "0.75rem 0.375rem",
                  backgroundColor: "#374151",
                  flexShrink: 0,
                  justifyContent: "space-between",
                }}
              >
                {/* Left: Route Queue */}
                <div
                  style={{
                    backgroundColor: "#374151",
                    color: "#e5e7eb",
                    padding: "0.375rem",
                    borderRadius: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.1875rem",
                    alignItems: "center",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    flexShrink: 0,

                    // MIN SIZE so it doesn't collapse when empty
                    minWidth: "2.9375rem",
                    minHeight: "6.75rem",
                  }}
                >
                  <div style={{ fontWeight: "bold", fontSize: "0.625rem" }}>Q</div>
                  {g.queue.map((r, idx) => (
                    <RouteIcon
                      key={`${r.id}-${idx}`}
                      route={r}
                      onClick={() => canPickQueueForSwap && actions.pickQueueIndex(idx)}
                      selected={canPickQueueForSwap && g.pendingSwap.queueIndex === idx}
                      highlightColor="#ee484c"
                      style={{
                        width: "2.1875rem",
                        aspectRatio: "7/13",
                        cursor: canPickQueueForSwap ? "pointer" : "default",
                        verticalAlign: "top",
                      }}
                    />
                  ))}
                </div>

                {/* Center: Board */}
                {boardStyle === "grid" ? (
                  <GridBoard
                    boardMap={boardMap}
                    selectedTokenId={selectedTokenId}
                    ghost={ghost}
                    started={started}
                    phase={g.phase}
                    onSquareClick={actions.onSquareClick}
                    GHOST_MS={GHOST_MS}
                    mobile={true}
                    evasionSourcePos={evasionSourcePos}
                    evasionDestPos={pendingEvasion?.to ?? null}
                    evasionPlayer={evasionPlayer}
                  />
                ) : (
                  <IntersectionBoard
                    boardMap={boardMap}
                    selectedTokenId={selectedTokenId}
                    ghost={ghost}
                    started={started}
                    phase={g.phase}
                    onSquareClick={actions.onSquareClick}
                    GHOST_MS={GHOST_MS}
                    mobile={true}
                    evasionSourcePos={evasionSourcePos}
                    evasionDestPos={pendingEvasion?.to ?? null}
                    evasionPlayer={evasionPlayer}
                  />
                )}

                {/* Right: Void */}
                <div
                  style={{
                    backgroundColor: "#374151",
                    color: "#e5e7eb",
                    padding: "0.375rem",
                    borderRadius: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.125rem",
                    alignItems: "center",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    flexShrink: 0,

                    // MIN SIZE so it doesn't collapse when empty
                    minWidth: "2.9375rem",
                    minHeight: "4.75rem",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "0.625rem",
                      marginBottom: "2px",
                    }}
                  >
                    V
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                      {Array.from({ length: Math.min(g.void.W, 3) }).map((_, i) => (
                        <div
                          key={`vw${i}`}
                          className="token-white"
                          style={{
                            width: "0.75rem",
                            height: "0.75rem",
                            borderRadius: "50%",
                            position: "relative",
                          }}
                        ></div>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                      {Array.from({ length: Math.min(g.void.B, 2) }).map((_, i) => (
                        <div
                          key={`vb${i}`}
                          className="token-teal"
                          style={{
                            width: "0.75rem",
                            height: "0.75rem",
                            borderRadius: "50%",
                            position: "relative",
                          }}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Board style instruction */}
              <div style={{ fontSize: 10, color: "#9ca3af", opacity: 0.6, textAlign: "center", padding: "4px 0" }}>
                Press <span style={{ fontWeight: 900, color: "#d1d5db" }}>B</span> to switch board style
              </div>

              {/* Blue Player */}
              <div
                style={{
                  padding: "0.25rem 0.375rem",
                  backgroundColor: "#374151",
                  borderTop: "1px solid #4b5563",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "0.375rem",
                    paddingBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <div
                      style={{
                        width: "2.25rem",
                        height: "2.25rem",
                        borderRadius: "50%",
                        backgroundColor: "#9ca3af",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.125rem",
                        fontWeight: "bold",
                        color: "#1f2937",
                        overflow: "hidden",
                      }}
                    >
                      {bottomPlayer.avatar_url ? (
                        <img
                          src={bottomPlayer.avatar_url}
                          alt={bottomPlayer.username}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        bottomPlayer.avatar
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "0.25rem",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: "bold",
                            fontSize: "0.8125rem",
                            color: "#e5e7eb",
                          }}
                        >
                          {bottomPlayer.username}
                        </span>
                        <span
                          style={{ fontSize: "0.6875rem", color: "#9ca3af" }}
                        >
                          ({bottomPlayer.elo})
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.6875rem",
                          color: "#d1d5db",
                        }}
                      >
                        <div
                          className={bottomPlayer.avatar === "W" ? "token-white" : "token-teal"}
                          style={{
                            width: "0.75rem",
                            height: "0.75rem",
                            borderRadius: "50%",
                            position: "relative",
                          }}
                        ></div>
                        <span>{bottomPlayer.avatar === "W" ? "White" : "Blue"}</span>
                        {bottomPlayer.country === "US" ? (
                          <svg
                            width="16"
                            height="12"
                            viewBox="0 0 16 12"
                            style={{ marginLeft: "6px" }}
                          >
                            <rect width="16" height="12" fill="#B22234" />
                            <rect y="1.5" width="16" height="1.5" fill="#fff" />
                            <rect y="4.5" width="16" height="1.5" fill="#fff" />
                            <rect y="7.5" width="16" height="1.5" fill="#fff" />
                            <rect y="10.5" width="16" height="1.5" fill="#fff" />
                            <rect width="6.4" height="6" fill="#3C3B6E" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="12"
                            viewBox="0 0 16 12"
                            style={{ marginLeft: "6px" }}
                          >
                            <circle cx="8" cy="6" r="4" fill="#BC002D" />
                          </svg>
                        )}
                        <span
                          style={{
                            fontSize: "0.625rem",
                            color: "#9ca3af",
                            fontWeight: "bold",
                          }}
                        >
                          {bottomPlayer.country}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "0.5rem",
                    }}
                  >
                    {/* Route Swap - only show when it's this player's turn */}
                    {g.player === bottomPlayer.avatar && (
                      <button
                        onClick={() => canEarlySwap && actions.armEarlySwap()}
                        disabled={!canEarlySwap}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canEarlySwap ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canEarlySwap ? 1 : 0.5,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ee484c"
                          strokeWidth="1"
                        >
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <path d="M16 16h5v5" />
                        </svg>
                      </button>
                    )}

                    {/* Early Reinforcement - only show when it's this player's turn */}
                    {g.player === bottomPlayer.avatar && (
                      <button
                        onClick={() =>
                          canBuyExtraReinforcement &&
                          actions.buyExtraReinforcement()
                        }
                        disabled={!canBuyExtraReinforcement}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canBuyExtraReinforcement ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canBuyExtraReinforcement ? 1 : 0.5,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ee484c"
                          strokeWidth="1"
                        >
                          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                          <path d="M9 12h6" />
                          <path d="M12 9v6" />
                        </svg>
                      </button>
                    )}

                    {/* Evasion - only show when it's opponent's turn */}
                    {g.player !== bottomPlayer.avatar && (
                      <button
                        onClick={() => canUseEvasion && actions.armEvasion()}
                        disabled={!canUseEvasion}
                        style={{
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canUseEvasion ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canUseEvasion ? 1 : 0.5,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ee484c"
                          strokeWidth="1"
                        >
                          <path d="M9 10h.01" />
                          <path d="M15 10h.01" />
                          <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
                        </svg>
                      </button>
                    )}

                    <button
                      onClick={() => setShowHelpModal(g.player === bottomPlayer.avatar ? "currentPlayer" : "evasion")}
                      style={{
                        background: "none",
                        border: "1px solid #6b7280",
                        borderRadius: "50%",
                        color: "#9ca3af",
                        fontSize: "1rem",
                        cursor: "pointer",
                        padding: "2px",
                        lineHeight: "1",
                        width: "1.5rem",
                        height: "1.5rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ?
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "8px" }}>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      gap: "0.75rem",
                      justifyContent: "center",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.125rem",
                        alignItems: "flex-start",
                        fontSize: "0.6875rem",
                        color: "#e5e7eb",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>R:</span>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.1875rem",
                          maxWidth: "5rem",
                        }}
                      >
                        {Array.from({ length: g.reserves[bottomPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div
                            key={i}
                            className={bottomPlayer.avatar === "W" ? "token-white" : "token-teal"}
                            style={{
                              width: "0.75rem",
                              height: "0.75rem",
                              borderRadius: "50%",
                              position: "relative",
                              display: "inline-block",
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.125rem",
                        alignItems: "flex-start",
                        fontSize: "0.6875rem",
                        color: "#e5e7eb",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>C:</span>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.1875rem",
                          maxWidth: "5rem",
                        }}
                      >
                        {Array.from({ length: g.captives.B }).map((_, i) => (
                          <div
                            key={i}
                            className="token-white"
                            style={{
                              width: "0.75rem",
                              height: "0.75rem",
                              borderRadius: "50%",
                              position: "relative",
                              display: "inline-block",
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ flex: 1, display: "flex", gap: "0.25rem", justifyContent: "space-between" }}>
                    {g.routes[bottomPlayer.avatar as "W" | "B"].slice(0, 4).map((r) => {
                      const isActive = g.player === bottomPlayer.avatar
                      const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                        const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                      const isSelected = g.pendingSwap.handRouteId === r.id

                      return (
                        <RouteIcon
                          key={r.id}
                          route={r}
                          onClick={() => isActive && !used && actions.playRoute(bottomPlayer.avatar as "W" | "B", r.id)}
                          selected={isSelected}
                          highlightColor="#ee484c"
                          style={{
                            width: "2.1875rem",
                            aspectRatio: "7/13",
                            cursor: isActive && !used ? "pointer" : "default",
                            opacity: used ? 0.3 : 1,
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {(g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)) && (
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  {g.phase === "SWAP" ? (
                    <button
                      onClick={() => actions.confirmSwapAndEndTurn()}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 8,
                        border: "2px solid #3296ab",
                        background: "#374151",
                        fontWeight: 900,
                        fontSize: 13,
                        cursor: "pointer",
                        color: "#f9fafb",
                      }}
                    >
                      Confirm Swap & End Turn
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => actions.confirmEarlySwap()}
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 8,
                          border: "2px solid #3296ab",
                          background: "#374151",
                          fontWeight: 900,
                          fontSize: 13,
                          cursor: "pointer",
                          color: "#f9fafb",
                        }}
                      >
                        Confirm Early Swap
                      </button>

                      <button
                        onClick={() => actions.cancelEarlySwap()}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 8,
                          border: "1px solid #4b5563",
                          background: "transparent",
                          fontWeight: 900,
                          fontSize: 13,
                          cursor: "pointer",
                          color: "#f9fafb",
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Evasion Confirm/Cancel */}
              {evasionArmed && (
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  <button
                    onClick={() => actions.confirmEvasion()}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      border: "2px solid #3296ab",
                      background: "#374151",
                      fontWeight: 900,
                      fontSize: 13,
                      cursor: "pointer",
                      color: "#f9fafb",
                    }}
                  >
                    Confirm Evasion
                  </button>

                  <button
                    onClick={() => actions.cancelEvasion()}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid #4b5563",
                      background: "transparent",
                      fontWeight: 900,
                      fontSize: 13,
                      cursor: "pointer",
                      color: "#f9fafb",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {forcedYieldAvailable && (
                <button
                  onClick={() => actions.yieldForced()}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "0.5rem",
                    border: "2px solid #6b7280",
                    backgroundColor: "#374151",
                    fontWeight: "bold",
                    fontSize: "0.6875rem",
                    color: "#e5e7eb",
                    cursor: "pointer",
                    marginBottom: "0.5rem",
                  }}
                >
                  No usable routes — Yield {remainingRoutes.length} to Void
                </button>
              )}

              {/* Game Log */}
              <div
                style={{
                  backgroundColor: "#374151",
                  borderTop: "1px solid #4b5563",
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "0.375rem 0.5rem",
                    fontWeight: "bold",
                    fontSize: "0.6875rem",
                    color: "#e5e7eb",
                    backgroundColor: "#1f2937",
                    borderBottom: "1px solid #4b5563",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onClick={() => setShowLogExpanded(!showLogExpanded)}
                >
                  <span>Log</span>
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      color: "#9ca3af",
                      fontSize: "1rem",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: "1",
                    }}
                  >
                    {showLogExpanded ? "▲" : "▼"}
                  </button>
                </div>
                {showLogExpanded && (
                  <div
                    style={{
                      padding: "0.5rem",
                      fontSize: "0.625rem",
                      color: "#d1d5db",
                      fontFamily: "monospace",
                      overflowY: "auto",
                      maxHeight: "12rem",
                      lineHeight: "1.4",
                    }}
                    className="hide-scrollbar"
                  >
                    {g.log.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>No log entries yet.</div>
                    ) : (
                      g.log.map((l, i) => (
                        <div key={i} style={{ padding: "2px 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                          {l}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ===== WEB LAYOUT ===== */
          <>
            {/* Menu Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 20px",
                backgroundColor: "#374151",
                borderBottom: "1px solid #4b5563",
                height: "60px",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img 
                  src="/logo.png" 
                  alt="Vekke" 
                  style={{ height: "36px", width: "auto" }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {userProfile ? (
                  <>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setShowProfileModal(true)
                      }}
                      style={{
                        fontSize: "0.875rem",
                        color: "#e5e7eb",
                        fontWeight: "bold",
                        maxWidth: "150px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      {userProfile.username}
                    </a>
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut()
                      }}
                      style={{
                        fontSize: "0.875rem",
                        background: "none",
                        border: "1px solid #4b5563",
                        color: "#e5e7eb",
                        padding: "8px 16px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "bold",
                      }}
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    style={{
                      fontSize: "0.875rem",
                      background: "none",
                      border: "1px solid #4b5563",
                      color: "#e5e7eb",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Login
                  </button>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div
              style={{
                display: "flex",
                flexGrow: 1,
                padding: 20,
                overflow: "hidden",
                alignItems: "flex-start",
                gap: 12,
                justifyContent: "center",
              }}
            >
              {/* Left Column */}
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, alignSelf: "stretch", overflow: "hidden" }}>
                {/* White Player Section */}
                <div
                  style={{
                    padding: 12,
                    backgroundColor: "#374151",
                    borderRadius: 8,
                    border: g.player === leftPlayer.avatar ? "2px solid #5de8f7" : "1px solid #4b5563",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        backgroundColor: "#9ca3af",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                        fontWeight: 900,
                        color: "#1f2937",
                        overflow: "hidden",
                      }}
                    >
                      {leftPlayer.avatar_url ? (
                        <img
                          src={leftPlayer.avatar_url}
                          alt={leftPlayer.username}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        leftPlayer.avatar
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontWeight: 900, fontSize: 16, color: "#e5e7eb" }}>
                          {leftPlayer.username}
                        </span>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>({leftPlayer.elo})</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#d1d5db" }}>
                        <div className={leftPlayer.avatar === "W" ? "token-white" : "token-teal"} style={{ width: 14, height: 14, borderRadius: "50%", position: "relative" }} />
                        <span>{leftPlayer.avatar === "W" ? "White" : "Blue"}</span>
                        {leftPlayer.country === "US" ? (
                          <svg width="18" height="14" viewBox="0 0 16 12" style={{ marginLeft: 6 }}>
                            <rect width="16" height="12" fill="#B22234" />
                            <rect y="1.5" width="16" height="1.5" fill="#fff" />
                            <rect y="4.5" width="16" height="1.5" fill="#fff" />
                            <rect y="7.5" width="16" height="1.5" fill="#fff" />
                            <rect y="10.5" width="16" height="1.5" fill="#fff" />
                            <rect width="6.4" height="6" fill="#3C3B6E" />
                          </svg>
                        ) : (
                          <svg width="18" height="14" viewBox="0 0 16 12" style={{ marginLeft: 6 }}>
                            <circle cx="8" cy="6" r="4" fill="#BC002D" />
                          </svg>
                        )}
                        <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900 }}>{leftPlayer.country}</span>
                      </div>
                    </div>
                  </div>

                  {/* Special Actions */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, justifyContent: "flex-end" }}>
                    {/* Route Swap - only show when it's this player's turn */}
                    {g.player === leftPlayer.avatar && (
                      <button
                        onClick={() => canEarlySwap && actions.armEarlySwap()}
                        disabled={!canEarlySwap}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canEarlySwap ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canEarlySwap ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <path d="M16 16h5v5" />
                        </svg>
                      </button>
                    )}

                    {/* Early Reinforcement - only show when it's this player's turn */}
                    {g.player === leftPlayer.avatar && (
                      <button
                        onClick={() => canBuyExtraReinforcement && actions.buyExtraReinforcement()}
                        disabled={!canBuyExtraReinforcement}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canBuyExtraReinforcement ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canBuyExtraReinforcement ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                          <path d="M9 12h6" />
                          <path d="M12 9v6" />
                        </svg>
                      </button>
                    )}

                    {/* Evasion - only show when it's opponent's turn */}
                    {g.player !== leftPlayer.avatar && (
                      <button
                        onClick={() => canUseEvasion && actions.armEvasion()}
                        disabled={!canUseEvasion}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canUseEvasion ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canUseEvasion ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                          <path d="M9 10h.01" />
                          <path d="M15 10h.01" />
                          <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
                        </svg>
                      </button>
                    )}

                    <button
                      onClick={() => setShowHelpModal(g.player === leftPlayer.avatar ? "currentPlayer" : "evasion")}
                      style={{
                        background: "none",
                        border: "1px solid #6b7280",
                        borderRadius: "50%",
                        color: "#9ca3af",
                        fontSize: 20,
                        cursor: "pointer",
                        padding: 2,
                        lineHeight: "1",
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ?
                    </button>
                  </div>

                  {/* Reserves and Captives */}
                  <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Reserves</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Array.from({ length: g.reserves[leftPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={leftPlayer.avatar === "W" ? "token-white" : "token-teal"} style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Captives</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Array.from({ length: g.captives[leftPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={leftPlayer.avatar === "W" ? "token-teal" : "token-white"} style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Route Cards */}
                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Route Cards</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {g.routes[leftPlayer.avatar as "W" | "B"].slice(0, 4).map((r) => {
                        const isActive = g.player === leftPlayer.avatar
                        const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                          const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                        const isSelected = g.pendingSwap.handRouteId === r.id
                        return (
                          <RouteIcon
                            key={r.id}
                            route={r}
                            onClick={() => isActive && !used && actions.playRoute(leftPlayer.avatar as "W" | "B", r.id)}
                            selected={isSelected}
                            highlightColor="#ee484c"
                            style={{
                              width: 50,
                              aspectRatio: "7/13",
                              cursor: isActive && !used ? "pointer" : "default",
                              opacity: used ? 0.3 : 1,
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Chat Section */}
                <div
                  style={{
                    backgroundColor: "#374151",
                    borderRadius: 8,
                    border: "1px solid #4b5563",
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      backgroundColor: "#1f2937",
                      borderBottom: "1px solid #4b5563",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, fontSize: 13, color: "#e5e7eb" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>Chat</span>
                    </div>
                  </div>
                  <div style={{ borderBottom: "1px solid #4b5563", padding: "10px 12px", display: "flex", gap: 8, flexShrink: 0 }}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendChat() }}
                      placeholder="Type a message…"
                      style={{ flexGrow: 1, background: "#111827", border: "1px solid #374151", borderRadius: 8, padding: "8px 10px", color: "#e5e7eb", outline: "none", fontSize: 12 }}
                    />
                    <button onClick={sendChat} style={{ background: "#5de8f7", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 900, cursor: "pointer", color: "#0b1220", fontSize: 12, flexShrink: 0 }}>
                      Send
                    </button>
                  </div>
                  <div
                    style={{
                      padding: 12,
                      fontSize: 12,
                      color: "#d1d5db",
                      overflowY: "auto",
                      flexGrow: 1,
                      minHeight: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {[...chatMsgs].reverse().map((m) => {
                      const name = m.from === "SYS" ? "System" : m.from === "B" ? bluePlayer.username : whitePlayer.username
                      const color = m.from === "SYS" ? "#9ca3af" : m.from === "B" ? "#5de8f7" : "#e5e7eb"
                      return (
                        <div key={m.id} style={{ marginBottom: 8 }}>
                          <span style={{ fontWeight: 900, color }}>{name}:</span>{" "}{m.text}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Queue */}
              <div
                style={{
                  backgroundColor: "#374151",
                  color: "#e5e7eb",
                  padding: 12,
                  borderRadius: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  alignItems: "center",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  flexShrink: 0,
                  minWidth: 74,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4 }}>Queue</div>
                {g.queue.map((r, idx) => (
                  <RouteIcon
                    key={`${r.id}-${idx}`}
                    route={r}
                    onClick={() => canPickQueueForSwap && actions.pickQueueIndex(idx)}
                    selected={canPickQueueForSwap && g.pendingSwap.queueIndex === idx}
                    highlightColor="#ee484c"
                    style={{
                      width: 50,
                      aspectRatio: "7/13",
                      cursor: canPickQueueForSwap ? "pointer" : "default",
                    }}
                  />
                ))}
              </div>

              {/* Center: Timers + Board */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flexShrink: 0 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 20,
                    alignItems: "center",
                    padding: "12px 24px",
                    backgroundColor: "#374151",
                    borderRadius: 12,
                    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2 2" />
                    <path d="M5 3 2 6" />
                    <path d="m22 6-3-3" />
                    <path d="M6.38 18.7 4 21" />
                    <path d="M17.64 18.67 20 21" />
                  </svg>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#e5e7eb", opacity: g.player === "W" ? 1 : 0.6 }}>
                      W {fmtClock(clocks.W)}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#e5e7eb", opacity: g.player === "B" ? 1 : 0.6 }}>
                      B {fmtClock(clocks.B)}
                    </div>
                    <div style={{ fontSize: 18, color: "#9ca3af", opacity: 0.75 }}>{timeControl.label}</div>
                  </div>
                </div>

                {/* Phase Banner - moved between clock and board */}
                <div style={{ width: "100%", maxWidth: 597, height: 60, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }}>
                  {/* Messages Area - phase text and warnings */}
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: "#5de8f7",
                      textAlign: "center",
                      minHeight: 24,
                    }}
                  >
                    {evasionArmed ? (
                      `${g.player === "W" ? "B" : "W"} is currently in Evasion`
                    ) : (
                      <>
                        {g.phase}: {g.player}{" "}
                        {g.phase === "ACTION"
                          ? "make your moves"
                          : g.phase === "REINFORCE"
                            ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                  place {g.reinforcementsToPlace} reinforcements
                                  {Array.from({ length: g.reinforcementsToPlace }).map((_, i) => (
                                    <div 
                                      key={i} 
                                      className={g.player === "W" ? "token-white" : "token-teal"}
                                      style={{ width: "0.75rem", height: "0.75rem", borderRadius: "50%", position: "relative" }}
                                    />
                                  ))}
                                </span>
                              )
                            : g.phase === "SWAP"
                              ? "make a route swap"
                              : "place opening tokens"}
                      </>
                    )}
                    {g.warning && (
                        <div
                          style={{
                            marginTop: 4,
                            color: "#ef4444",
                            fontWeight: 900,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontSize: 13,
                          }}
                        >
                          {g.warning}
                        </div>
                      )}
                  </div>
                  
                  {/* Info Row - latest log and resign (won't move) */}
                  <div
                    style={{
                      fontSize: 13,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#d1d5db",
                      paddingLeft: 8,
                      paddingRight: 8,
                    }}
                  >
                    {g.log.length === 0 ? (
                      <div style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}>
                        No moves yet
                      </div>
                    ) : (
                      <div
                        key={g.log[0]}
                        style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}
                      >
                        {g.log[0].replace(/==/g, '').trim()}
                      </div>
                    )}
                    <button
                      onClick={() => actions.resign()}
                      disabled={!started || !!g.gameOver}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ee484c",
                        fontSize: 13,
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 900,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        opacity: (!started || !!g.gameOver) ? 0.5 : 1,
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ee484c"
                        strokeWidth="2"
                      >
                        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                        <path d="M12 8v4" />
                        <path d="M12 16h.01" />
                      </svg>
                      <span>Resign</span>
                    </button>
                  </div>
                </div>

                {boardStyle === "grid" ? (
                  <GridBoard
                    boardMap={boardMap}
                    selectedTokenId={selectedTokenId}
                    ghost={ghost}
                    started={started}
                    phase={g.phase}
                    onSquareClick={actions.onSquareClick}
                    GHOST_MS={GHOST_MS}
                    mobile={false}
                    evasionSourcePos={evasionSourcePos}
                    evasionDestPos={pendingEvasion?.to ?? null}
                    evasionPlayer={evasionPlayer}
                  />
                ) : (
                  <IntersectionBoard
                    boardMap={boardMap}
                    selectedTokenId={selectedTokenId}
                    ghost={ghost}
                    started={started}
                    phase={g.phase}
                    onSquareClick={actions.onSquareClick}
                    GHOST_MS={GHOST_MS}
                    mobile={false}
                    evasionSourcePos={evasionSourcePos}
                    evasionDestPos={pendingEvasion?.to ?? null}
                    evasionPlayer={evasionPlayer}
                  />
                )}

                {/* Board style instruction */}
                <div style={{ fontSize: 11, color: "#9ca3af", opacity: 0.6, textAlign: "center" }}>
                  Press <span style={{ fontWeight: 900, color: "#d1d5db" }}>B</span> to switch board style
                </div>

                {/* Swap / Early-swap confirm buttons live under the board, like the mockup wants "confirm where confirm normally is" */}
                {(g.phase === "SWAP" || (g.phase === "ACTION" && earlySwapArmed)) && (
                  <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 597 }}>
                    {g.phase === "SWAP" ? (
                      <button
                        onClick={() => actions.confirmSwapAndEndTurn()}
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 10,
                          border: "2px solid #3296ab",
                          background: "#374151",
                          fontWeight: 900,
                          fontSize: 13,
                          cursor: "pointer",
                          color: "#f9fafb",
                        }}
                      >
                        Confirm Swap & End Turn
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => actions.confirmEarlySwap()}
                          style={{
                            flex: 1,
                            padding: 12,
                            borderRadius: 10,
                            border: "2px solid #3296ab",
                            background: "#374151",
                            fontWeight: 900,
                            fontSize: 13,
                            cursor: "pointer",
                            color: "#f9fafb",
                          }}
                        >
                          Confirm Early Swap
                        </button>
                        <button
                          onClick={() => actions.cancelEarlySwap()}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 10,
                            border: "1px solid #4b5563",
                            background: "transparent",
                            fontWeight: 900,
                            fontSize: 13,
                            cursor: "pointer",
                            color: "#f9fafb",
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Evasion Confirm/Cancel */}
                {evasionArmed && (
                  <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 597 }}>
                    <button
                      onClick={() => actions.confirmEvasion()}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 10,
                        border: "2px solid #3296ab",
                        background: "#374151",
                        fontWeight: 900,
                        fontSize: 13,
                        cursor: "pointer",
                        color: "#f9fafb",
                      }}
                    >
                      Confirm Evasion
                    </button>

                    <button
                      onClick={() => actions.cancelEvasion()}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid #4b5563",
                        background: "transparent",
                        fontWeight: 900,
                        fontSize: 13,
                        cursor: "pointer",
                        color: "#f9fafb",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {forcedYieldAvailable && (
                  <button
                    onClick={() => actions.yieldForced()}
                    style={{
                      width: "100%",
                      maxWidth: 597,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "2px solid #6b7280",
                      backgroundColor: "#374151",
                      fontWeight: 900,
                      fontSize: 13,
                      color: "#e5e7eb",
                      cursor: "pointer",
                    }}
                  >
                    No usable routes — Yield {remainingRoutes.length} to Void
                  </button>
                )}
              </div>

              {/* Void */}
              <div
                style={{
                  backgroundColor: "#374151",
                  color: "#e5e7eb",
                  padding: 12,
                  borderRadius: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  alignItems: "center",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  flexShrink: 0,
                  width: 74, // match Queue
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4 }}>Void</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {Array.from({ length: Math.min(g.void.W, 8) }).map((_, i) => (
                      <div key={`vw${i}`} className="token-white" style={{ width: 18, height: 18, borderRadius: "50%", position: "relative" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {Array.from({ length: Math.min(g.void.B, 8) }).map((_, i) => (
                      <div key={`vb${i}`} className="token-teal" style={{ width: 18, height: 18, borderRadius: "50%", position: "relative" }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, alignSelf: "stretch", overflow: "hidden" }}>
                {/* Blue Player Section */}
                <div
                  style={{
                    padding: 12,
                    backgroundColor: "#374151",
                    borderRadius: 8,
                    border: g.player === rightPlayer.avatar ? "2px solid #5de8f7" : "1px solid #4b5563",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        backgroundColor: "#9ca3af",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                        fontWeight: 900,
                        color: "#1f2937",
                        overflow: "hidden",
                      }}
                    >
                      {rightPlayer.avatar_url ? (
                        <img
                          src={rightPlayer.avatar_url}
                          alt={rightPlayer.username}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        rightPlayer.avatar
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontWeight: 900, fontSize: 16, color: "#e5e7eb" }}>
                          {rightPlayer.username}
                        </span>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>({rightPlayer.elo})</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#d1d5db" }}>
                        <div className={rightPlayer.avatar === "W" ? "token-white" : "token-teal"} style={{ width: 14, height: 14, borderRadius: "50%", position: "relative" }} />
                        <span>{rightPlayer.avatar === "W" ? "White" : "Blue"}</span>
                        {rightPlayer.country === "US" ? (
                          <svg width="18" height="14" viewBox="0 0 16 12" style={{ marginLeft: 6 }}>
                            <rect width="16" height="12" fill="#B22234" />
                            <rect y="1.5" width="16" height="1.5" fill="#fff" />
                            <rect y="4.5" width="16" height="1.5" fill="#fff" />
                            <rect y="7.5" width="16" height="1.5" fill="#fff" />
                            <rect y="10.5" width="16" height="1.5" fill="#fff" />
                            <rect width="6.4" height="6" fill="#3C3B6E" />
                          </svg>
                        ) : (
                          <svg width="18" height="14" viewBox="0 0 16 12" style={{ marginLeft: 6 }}>
                            <circle cx="8" cy="6" r="4" fill="#BC002D" />
                          </svg>
                        )}
                        <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900 }}>{rightPlayer.country}</span>
                      </div>
                    </div>
                  </div>

                  {/* Special Actions */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, justifyContent: "flex-end" }}>
                    {/* Route Swap - only show when it's this player's turn */}
                    {g.player === rightPlayer.avatar && (
                      <button
                        onClick={() => canEarlySwap && actions.armEarlySwap()}
                        disabled={!canEarlySwap}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canEarlySwap ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canEarlySwap ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <path d="M16 16h5v5" />
                        </svg>
                      </button>
                    )}

                    {/* Early Reinforcement - only show when it's this player's turn */}
                    {g.player === rightPlayer.avatar && (
                      <button
                        onClick={() => canBuyExtraReinforcement && actions.buyExtraReinforcement()}
                        disabled={!canBuyExtraReinforcement}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canBuyExtraReinforcement ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canBuyExtraReinforcement ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                          <path d="M9 12h6" />
                          <path d="M12 9v6" />
                        </svg>
                      </button>
                    )}

                    {/* Evasion - only show when it's opponent's turn */}
                    {g.player !== rightPlayer.avatar && (
                      <button
                        onClick={() => canUseEvasion && actions.armEvasion()}
                        disabled={!canUseEvasion}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: "#1f2937",
                          border: "1px solid #6b7280",
                          cursor: canUseEvasion ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: canUseEvasion ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                          <path d="M9 10h.01" />
                          <path d="M15 10h.01" />
                          <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
                        </svg>
                      </button>
                    )}

                    <button
                      onClick={() => setShowHelpModal(g.player === rightPlayer.avatar ? "currentPlayer" : "evasion")}
                      style={{
                        background: "none",
                        border: "1px solid #6b7280",
                        borderRadius: "50%",
                        color: "#9ca3af",
                        fontSize: 20,
                        cursor: "pointer",
                        padding: 2,
                        lineHeight: "1",
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ?
                    </button>
                  </div>

                  {/* Reserves and Captives */}
                  <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Reserves</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Array.from({ length: g.reserves[rightPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={rightPlayer.avatar === "W" ? "token-white" : "token-teal"} style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Captives</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Array.from({ length: g.captives[rightPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={rightPlayer.avatar === "W" ? "token-teal" : "token-white"} style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Route Cards */}
                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Route Cards</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {g.routes[rightPlayer.avatar as "W" | "B"].slice(0, 4).map((r) => {
                        const isActive = g.player === rightPlayer.avatar
                        const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                          const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                        const isSelected = g.pendingSwap.handRouteId === r.id
                        return (
                          <RouteIcon
                            key={r.id}
                            route={r}
                            onClick={() => isActive && !used && actions.playRoute(rightPlayer.avatar as "W" | "B", r.id)}
                            selected={isSelected}
                            highlightColor="#ee484c"
                            style={{
                              width: 50,
                              aspectRatio: "7/13",
                              cursor: isActive && !used ? "pointer" : "default",
                              opacity: used ? 0.3 : 1,
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Game Log */}
                <div
                  style={{
                    backgroundColor: "#374151",
                    borderRadius: 8,
                    border: "1px solid #4b5563",
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      backgroundColor: "#1f2937",
                      borderBottom: "1px solid #4b5563",
                      fontWeight: 900,
                      fontSize: 13,
                      color: "#e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    onClick={() => setShowLogExpanded(!showLogExpanded)}
                  >
                    <span>Log</span>
                    <span style={{ fontSize: 14, opacity: 0.7 }}>{showLogExpanded ? "▲" : "▼"}</span>
                  </div>
                  {showLogExpanded && (
                  <div
                    style={{
                      padding: 12,
                      fontSize: 11,
                      color: "#d1d5db",
                      fontFamily: "monospace",
                      overflowY: "auto",
                      flexGrow: 1,
                      minHeight: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {g.log.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>No log entries yet.</div>
                    ) : (
                      g.log.map((l, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          {l}
                        </div>
                      ))
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>
          </>

        )}

        {/* Game Over Modal */}
        {g.gameOver && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#374151",
                border: "1px solid #4b5563",
                borderRadius: "12px",
                padding: "16px",
                maxWidth: "90vw",
                width: "25rem",
                color: "#e5e7eb",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "1.125rem",
                  marginBottom: "12px",
                  textAlign: "center",
                }}
              >
                GAME OVER
              </div>

              <div
                style={{
                  textAlign: "center",
                  fontSize: "1rem",
                  marginBottom: "12px",
                  fontWeight: 900,
                }}
              >
                {(() => {
                  const go = g.gameOver!
                  const reason = (go as any).reason as string | undefined
                  const winner = go.winner
                  const winnerName = winner === "W" ? "WHITE" : "BLUE"
                  const loserName = winner === "W" ? "BLUE" : "WHITE"
                  const winnerColor = winner === "W" ? "#e5e7eb" : "#5de8f7"
                  const loserColor = winner === "W" ? "#5de8f7" : "#e5e7eb"

                  if (reason === "timeout") {
                    return (
                      <span style={{ color: loserColor }}>
                        {loserName} loses by timeout
                      </span>
                    )
                  }
                  if (reason === "resignation") {
                    return (
                      <span style={{ color: winnerColor }}>
                        {winnerName} wins by resignation
                      </span>
                    )
                  }
                  if (reason === "siegemate") {
                    return (
                      <span style={{ color: winnerColor }}>
                        {winnerName} wins by siegemate
                      </span>
                    )
                  }
                  // elimination (or undefined for backwards compat)
                  return (
                    <span style={{ color: winnerColor }}>
                      {winnerName} wins by elimination
                    </span>
                  )
                })()}
              </div>

              {/* Match summary */}
              <div
                style={{
                  background: "#1f2937",
                  border: "1px solid #4b5563",
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  fontSize: 12,
                  color: "#d1d5db",
                }}
              >
                <div>
                  <div style={{ opacity: 0.75, fontWeight: 800 }}>Rounds</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#f9fafb" }}>{g.round}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ opacity: 0.75, fontWeight: 800 }}>Mode</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#f9fafb" }}>Tournament</div>
                </div>
              </div>

              {/* Match stats */}
              <div
                style={{
                  background: "#1f2937",
                  border: "1px solid #4b5563",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 14,
                  display: "grid",
                  gap: 8,
                  fontSize: 12,
                  color: "#e5e7eb",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 2, color: "#f9fafb" }}>Match Stats</div>

                {[
                  ["Sieges", (g as any).stats?.sieges?.W ?? 0, (g as any).stats?.sieges?.B ?? 0],
                  ["Drafts", (g as any).stats?.drafts?.W ?? 0, (g as any).stats?.drafts?.B ?? 0],
                  ["Captures", (g as any).stats?.captures?.W ?? 0, (g as any).stats?.captures?.B ?? 0],
                  ["Invades", (g as any).stats?.invades?.W ?? 0, (g as any).stats?.invades?.B ?? 0],
                ].map(([label, w, b]) => (
                  <div
                    key={String(label)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid rgba(75,85,99,0.7)",
                      background: "rgba(55,65,81,0.6)",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#f9fafb" }}>{label as string}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                      <span style={{ color: "#e5e7eb" }}>W {String(w)}</span>
                      <span style={{ opacity: 0.4 }}>|</span>
                      <span style={{ color: "#5de8f7" }}>B {String(b)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  actions.newGame()
                  actions.setStarted(false)
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "0.625rem",
                  border: "2px solid #111",
                  backgroundColor: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                New Game
              </button>
            </div>
          </div>
        )}

        {/* Auth Modal */}
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

        {/* Onboarding Modal */}
        {showOnboardingModal && currentUserId && (
          <OnboardingModal
            userId={currentUserId}
            onComplete={async () => {
              setShowOnboardingModal(false)
              // Refetch profile to update UI
              const { data: profile } = await supabase
                .from("profiles")
                .select("username, country_code, country_name, avatar_url")
                .eq("id", currentUserId)
                .single()
              if (profile) {
                setUserProfile(profile)
              }
            }}
          />
        )}

        {/* Profile Modal */}
        {showProfileModal && currentUserId && (
          <ProfileModal
            userId={currentUserId}
            onClose={() => setShowProfileModal(false)}
            onUpdate={async () => {
              // Refetch profile to update UI
              const { data: profile } = await supabase
                .from("profiles")
                .select("username, country_code, country_name, avatar_url")
                .eq("id", currentUserId)
                .single()
              if (profile) {
                setUserProfile(profile)
              }
            }}
          />
        )}

        {/* Help Modal */}
        {showHelpModal && (
          <HelpModal
            topic={showHelpModal}
            onClose={() => setShowHelpModal(null)}
          />
        )}
      </div>
    </ErrBoundary>
  )
}

export default App