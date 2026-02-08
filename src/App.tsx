import React, { useEffect, useState } from "react"
import { SIZE, toSq, type Coord } from "./engine/coords"
import type { GameState, Player, Token } from "./engine/state"
import { sounds } from "./sounds"
import { RouteIcon } from "./RouteIcon"
import { useVekkeController } from "./engine/ui_controller"

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
    boardMap,
    remainingRoutes,
    forcedYieldAvailable,
    earlySwapArmed,
    canPickQueueForSwap,
    canEarlySwap,
    canBuyExtraReinforcement,
    constants: { EARLY_SWAP_COST, EXTRA_REINFORCEMENT_COST },
    actions,
  } = useVekkeController({ sounds, aiDelayMs: 1200 })

  const [ghost, setGhost] = useState<null | {
    by: Player
    from: Coord
    tokenId: string
    born: number
  }>(null)

  const GHOST_MS = 1000

  const [showLogExpanded, setShowLogExpanded] = useState(false)
  const [showChatExpanded, setShowChatExpanded] = useState(false)

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

  const whitePlayer = {
    username: human === "W" ? "WhitePlayer" : "Computer",
    elo: 1842,
    avatar: "W",
    country: "US",
  }

  const bluePlayer = {
    username: human === "B" ? "BluePlayer" : "Computer",
    elo: 1798,
    avatar: "B",
    country: "JP",
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
                NEW GAME
              </div>

              <div
                style={{
                  fontSize: "0.8125rem",
                  opacity: 0.85,
                  marginBottom: "12px",
                  lineHeight: 1.35,
                  textAlign: "center",
                  color: "#d1d5db",
                }}
              >
                Select your opponent's difficulty level and begin a new game.
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                <button
                  onClick={() => actions.setAiDifficulty("beginner")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: aiDifficulty === "beginner" ? "2px solid #5de8f7" : "1px solid #4b5563",
                    background: aiDifficulty === "beginner" ? "#1f2937" : "#374151",
                    color: aiDifficulty === "beginner" ? "#5de8f7" : "#e5e7eb",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Beginner AI
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
              </div>

              <button
                onClick={async () => {
                  await actions.unlockAudio()
                  actions.setStarted(true)
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
                Start Game
              </button>

              {!audioReady && (
                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "0.75rem",
                    opacity: 0.6,
                    textAlign: "center",
                    color: "#9ca3af",
                  }}
                >
                  Tip: click once anywhere if audio is blocked.
                </div>
              )}
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
                <div
                  style={{
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "50%",
                    backgroundColor: "#5de8f7",
                    border: "2px solid #26c6da",
                  }}
                ></div>
                <div style={{ fontWeight: "bold", fontSize: "0.6875rem" }}>
                  VEKKE
                </div>
              </div>
              <button
                style={{
                  fontSize: "1rem",
                  background: "none",
                  border: "none",
                  color: "#e5e7eb",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                ☰
              </button>
            </div>

            {/* Phase Banner */}
            <div
              style={{
                padding: "0.5rem",
                backgroundColor: "#1f2937",
                borderBottom: "1px solid #4b5563",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: "bold",
                  marginBottom: "0.25rem",
                  color: "#5de8f7",
                  textAlign: "center",
                }}
              >
                {g.phase}: {g.player}{" "}
                {g.phase === "ACTION"
                  ? "make your moves"
                  : g.phase === "REINFORCE"
                    ? "place reinforcements"
                    : g.phase === "SWAP"
                      ? "make a route swap"
                      : "place opening tokens"}
                {g.warning && (
                    <div
                      style={{
                        marginBottom: "0.25rem",
                        color: "#ef4444",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {g.warning}
                    </div>
                  )}
              </div>

              <div
                style={{
                  fontSize: "0.6875rem",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  color: "#d1d5db",
                }}
              >
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <span>
                    Placed: B {g.openingPlaced.B}/3, W {g.openingPlaced.W}/3
                  </span>
                  <span>Round: {g.round}</span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#d1d5db"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2 2" />
                      <path d="M5 3 2 6" />
                      <path d="m22 6-3-3" />
                      <path d="M6.38 18.7 4 21" />
                      <path d="M17.64 18.67 20 21" />
                    </svg>
                    <span style={{ fontWeight: "bold" }}>W: 5:23</span>
                    <span>|</span>
                    <span>B: 4:15</span>
                  </div>
                </div>
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ee484c",
                    fontSize: "0.6875rem",
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    position: "absolute",  
                    right: "0.5rem",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
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
                  <span style={{ fontWeight: "bold", color: "#5de8f7" }}>
                    Computer:
                  </span>{" "}
                  Good luck!
                </div>
              )}

              {showChatExpanded && (
                <div
                  style={{
                    padding: "0.5rem",
                    fontSize: "0.6875rem",
                    color: "#d1d5db",
                    maxHeight: "12.5rem",
                    overflowY: "auto",
                    borderTop: "1px solid #4b5563",
                  }}
                  className="hide-scrollbar"
                >
                  <div style={{ marginBottom: "0.25rem" }}>
                    <span style={{ fontWeight: "bold", color: "#5de8f7" }}>
                      Computer:
                    </span>{" "}
                    Good luck!
                  </div>
                  <div style={{ marginBottom: "0.25rem" }}>
                    <span style={{ fontWeight: "bold", color: "#5de8f7" }}>
                      You:
                    </span>{" "}
                    Thanks, you too!
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
                      }}
                    >
                      {whitePlayer.avatar}
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
                          {whitePlayer.username}
                        </span>
                        <span
                          style={{ fontSize: "0.6875rem", color: "#9ca3af" }}
                        >
                          ({whitePlayer.elo})
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
                          className="token-white"
                          style={{
                            width: "0.75rem",
                            height: "0.75rem",
                            borderRadius: "50%",
                            position: "relative",
                          }}
                        ></div>
                        <span>White</span>
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
                        <span
                          style={{
                            fontSize: "0.625rem",
                            color: "#9ca3af",
                            fontWeight: "bold",
                          }}
                        >
                          US
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
                    {/* Route Swap */}
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

                    {/* Early Reinforcement */}
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

                    {/* Help icon */}
                    <button
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
                        {Array.from({ length: g.reserves.W }).map((_, i) => (
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
                    {g.routes.W.slice(0, 4).map((r) => {
                      const isActive = g.player === "W"
                      const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                        const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                      const isSelected = g.pendingSwap.handRouteId === r.id

                      return (
                        <RouteIcon
                          key={r.id}
                          route={r}
                          onClick={() => isActive && !used && actions.playRoute("W", r.id)}
                          style={{
                            width: "2.1875rem",
                            aspectRatio: "7/13",
                            cursor: isActive && !used ? "pointer" : "default",
                            opacity: used ? 0.3 : 1,
                            border: isSelected ? "2px solid #5de8f7" : "none",
                            borderRadius: "0.25rem",
                          }}
                        />
                      )
                    })}
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
                      style={{
                        width: "2.1875rem",
                        aspectRatio: "7/13",
                        cursor: canPickQueueForSwap ? "pointer" : "default",
                        border:
                          canPickQueueForSwap && g.pendingSwap.queueIndex === idx
                            ? "2px solid #5de8f7"
                            : "none",
                        borderRadius: "0.25rem",
                        verticalAlign: "top",
                      }}
                    />
                  ))}
                </div>

                {/* Center: Board */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, 1fr)",
                    gridTemplateRows: "repeat(6, 1fr)",
                    gap: "0.125rem",
                    padding: "0.375rem",
                    backgroundColor: "#4b5563",
                    borderRadius: "12px",
                    boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                    flex: 1,
                    aspectRatio: "1/1",
                  }}
                >
                  {Array.from({ length: SIZE }, (_, ry) => {
                    const y = SIZE - 1 - ry
                    return Array.from({ length: SIZE }, (_, x) => {
                      const key = `${x},${y}`
                      const sq = toSq({ x, y })
                      const t = boardMap.get(key)
                      const isSelected = t && t.id === selectedTokenId

                      const col = String.fromCharCode(65 + x)
                      const row = y + 1
                      const notation = `${col}${row}`

                      return (
                        <div
                          key={key}
                          onClick={() => started && actions.onSquareClick(x, y)}
                          style={{
                            backgroundColor: isSelected ? "#1f2937" : "#6b7280",
                            borderRadius: "0.5rem",
                            boxShadow: isSelected
                              ? "0 0 0 2px #5de8f7"
                              : "0 2px 4px rgba(0,0,0,0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            aspectRatio: "1/1",
                            cursor:
                              started && (g.phase === "OPENING" || Boolean(t))
                                ? "pointer"
                                : "default",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: "2px",
                              left: "3px",
                              fontSize: "7px",
                              fontWeight: "bold",
                              color: "#9ca3af",
                              opacity: 0.55,
                            }}
                          >
                            {notation}
                          </div>


                          {ghost &&
                            (() => {
                              const elapsed = Date.now() - ghost.born
                              if (elapsed > GHOST_MS) return null
                              if (ghost.from.x !== x || ghost.from.y !== y) return null
                              const alpha = Math.max(0, 1 - elapsed / GHOST_MS)

                              return (
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "grid",
                                    placeItems: "center",
                                    pointerEvents: "none",
                                  }}
                                >
                                  <div
                                    className={`token-${ghost.by === "B" ? "teal" : "white"} token-ghost`}
                                    style={{
                                      width: "75%",
                                      height: "75%",
                                      borderRadius: "50%",
                                      position: "relative",
                                      opacity: 0.4 * alpha,
                                    }}
                                  />
                                </div>
                              )
                            })()}

                                                    {t && (
                            <div
                              className={`token-${t.owner === "B" ? "teal" : "white"}`}
                              style={{
                                width: "75%",
                                height: "75%",
                                borderRadius: "50%",
                                position: "relative",
                              }}
                            />
                          )}
                        </div>
                      )
                    })
                  })}
                </div>

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
                      }}
                    >
                      {bluePlayer.avatar}
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
                          {bluePlayer.username}
                        </span>
                        <span
                          style={{ fontSize: "0.6875rem", color: "#9ca3af" }}
                        >
                          ({bluePlayer.elo})
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
                          className="token-teal"
                          style={{
                            width: "0.75rem",
                            height: "0.75rem",
                            borderRadius: "50%",
                            position: "relative",
                          }}
                        ></div>
                        <span>Blue</span>
                        <svg
                          width="16"
                          height="12"
                          viewBox="0 0 16 12"
                          style={{ marginLeft: "6px" }}
                        >
                          <rect width="16" height="12" fill="#fff" />
                          <circle cx="8" cy="6" r="3.6" fill="#BC002D" />
                        </svg>
                        <span
                          style={{
                            fontSize: "0.625rem",
                            color: "#9ca3af",
                            fontWeight: "bold",
                          }}
                        >
                          JP
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
                    <button
                      disabled
                      style={{
                        width: "1.5rem",
                        height: "1.5rem",
                        borderRadius: "50%",
                        backgroundColor: "#1f2937",
                        border: "1px solid #6b7280",
                        cursor: "default",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.5,
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
                    <button
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
                        {Array.from({ length: g.reserves.B }).map((_, i) => (
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
                    {g.routes.B.slice(0, 4).map((r) => {
                      const isActive = g.player === "B"
                      const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                        const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                      const isSelected = g.pendingSwap.handRouteId === r.id

                      return (
                        <RouteIcon
                          key={r.id}
                          route={r}
                          onClick={() => isActive && !used && actions.playRoute("B", r.id)}
                          style={{
                            width: "2.1875rem",
                            aspectRatio: "7/13",
                            cursor: isActive && !used ? "pointer" : "default",
                            opacity: used ? 0.3 : 1,
                            border: isSelected ? "2px solid #5de8f7" : "none",
                            borderRadius: "0.25rem",
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
                      flexGrow: 1,
                      lineHeight: "1.4",
                    }}
                    className="hide-scrollbar"
                  >
                    {g.log.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>No log entries yet.</div>
                    ) : (
                      g.log.map((l, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "4px 0",
                            borderBottom:
                              i < g.log.length - 1
                                ? "1px solid rgba(75, 85, 99, 0.3)"
                                : "none",
                          }}
                        >
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
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    backgroundColor: "#5de8f7",
                    border: "2px solid #26c6da",
                  }}
                />
                <div style={{ fontWeight: 800, fontSize: 18, color: "#e5e7eb" }}>
                  VEKKE
                </div>
              </div>
              <button
                style={{
                  fontSize: 24,
                  background: "none",
                  border: "none",
                  color: "#e5e7eb",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                ☰
              </button>
            </div>

            {/* Phase Banner */}
            <div
              style={{
                padding: "12px 20px",
                backgroundColor: "#1f2937",
                borderBottom: "1px solid #4b5563",
                flexShrink: 0,
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  marginBottom: 6,
                  color: "#5de8f7",
                  textAlign: "center",
                }}
              >
                {g.phase}: {g.player}{" "}
                {g.phase === "ACTION"
                  ? "make your moves"
                  : g.phase === "REINFORCE"
                    ? "place reinforcements"
                    : g.phase === "SWAP"
                      ? "make a route swap"
                      : "place opening tokens"}
                {g.warning && (
                    <div
                      style={{
                        marginBottom: 6,
                        color: "#ef4444",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {g.warning}
                    </div>
                  )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  color: "#d1d5db",
                }}
              >
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <span>
                    Placed: B {g.openingPlaced.B}/3, W {g.openingPlaced.W}/3
                  </span>
                  <span>Round: {g.round}</span>
                </div>
                <button
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
                    position: "absolute",  
                    right: "0.5rem",
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
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
                {/* White Player Section */}
                <div
                  style={{
                    padding: 12,
                    backgroundColor: "#374151",
                    borderRadius: 8,
                    border: "1px solid #4b5563",
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
                      }}
                    >
                      {whitePlayer.avatar}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontWeight: 900, fontSize: 16, color: "#e5e7eb" }}>
                          {whitePlayer.username}
                        </span>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>({whitePlayer.elo})</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#d1d5db" }}>
                        <div className="token-white" style={{ width: 14, height: 14, borderRadius: "50%", position: "relative" }} />
                        <span>White</span>
                        <svg width="18" height="14" viewBox="0 0 16 12" style={{ marginLeft: 6 }}>
                          <rect width="16" height="12" fill="#B22234" />
                          <rect y="1.5" width="16" height="1.5" fill="#fff" />
                          <rect y="4.5" width="16" height="1.5" fill="#fff" />
                          <rect y="7.5" width="16" height="1.5" fill="#fff" />
                          <rect y="10.5" width="16" height="1.5" fill="#fff" />
                          <rect width="6.4" height="6" fill="#3C3B6E" />
                        </svg>
                        <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900 }}>US</span>
                      </div>
                    </div>
                  </div>

                  {/* Special Actions */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => g.player === "W" && canEarlySwap && actions.armEarlySwap()}
                      disabled={!(g.player === "W" && canEarlySwap)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: "#1f2937",
                        border: "1px solid #6b7280",
                        cursor: g.player === "W" && canEarlySwap ? "pointer" : "default",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: g.player === "W" && canEarlySwap ? 1 : 0.5,
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                        <path d="M16 16h5v5" />
                      </svg>
                    </button>

                    <button
                      onClick={() => g.player === "W" && canBuyExtraReinforcement && actions.buyExtraReinforcement()}
                      disabled={!(g.player === "W" && canBuyExtraReinforcement)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: "#1f2937",
                        border: "1px solid #6b7280",
                        cursor: g.player === "W" && canBuyExtraReinforcement ? "pointer" : "default",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: g.player === "W" && canBuyExtraReinforcement ? 1 : 0.5,
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                        <path d="M9 12h6" />
                        <path d="M12 9v6" />
                      </svg>
                    </button>

                    <button
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
                        {Array.from({ length: g.reserves.W }).map((_, i) => (
                          <div key={i} className="token-white" style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Captives</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Array.from({ length: g.captives.W }).map((_, i) => (
                          <div key={i} className="token-teal" style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Route Cards */}
                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Route Cards</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {g.routes.W.slice(0, 4).map((r) => {
                        const isActive = g.player === "W"
                        const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                          const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                        const isSelected = g.pendingSwap.handRouteId === r.id
                        return (
                          <RouteIcon
                            key={r.id}
                            route={r}
                            onClick={() => isActive && !used && actions.playRoute("W", r.id)}
                            style={{
                              width: 50,
                              aspectRatio: "7/13",
                              cursor: isActive && !used ? "pointer" : "default",
                              opacity: used ? 0.3 : 1,
                              border: isSelected ? "2px solid #5de8f7" : "none",
                              borderRadius: 6,
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
                    minHeight: 260,
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
                  <div
                    style={{
                      padding: 12,
                      fontSize: 12,
                      color: "#d1d5db",
                      overflowY: "auto",
                      flexGrow: 1,
                      lineHeight: 1.6,
                    }}
                    className="hide-scrollbar"
                  >
                    {/* Placeholder chat */}
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 900, color: "#5de8f7" }}>{bluePlayer.username}:</span> Good luck!
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 900, color: "#e5e7eb" }}>{whitePlayer.username}:</span> Thanks, you too!
                    </div>
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
                    style={{
                      width: 50,
                      aspectRatio: "7/13",
                      cursor: canPickQueueForSwap ? "pointer" : "default",
                      border: canPickQueueForSwap && g.pendingSwap.queueIndex === idx ? "2px solid #5de8f7" : "none",
                      borderRadius: 6,
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2">
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2 2" />
                      <path d="M5 3 2 6" />
                      <path d="m22 6-3-3" />
                      <path d="M6.38 18.7 4 21" />
                      <path d="M17.64 18.67 20 21" />
                    </svg>
                    <span style={{ fontSize: 24, fontWeight: 900, color: "#e5e7eb" }}>W: 5:23</span>
                  </div>
                  <div style={{ fontSize: 18, color: "#9ca3af" }}>|</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18, color: "#d1d5db" }}>B: 4:15</span>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, 90px)",
                    gridTemplateRows: "repeat(6, 90px)",
                    gap: 5,
                    padding: 16,
                    backgroundColor: "#4b5563",
                    borderRadius: 20,
                    boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                  }}
                >
                  {Array.from({ length: SIZE }, (_, ry) => {
                    const y = SIZE - 1 - ry
                    return Array.from({ length: SIZE }, (_, x) => {
                      const key = `${x},${y}`
                      const t = boardMap.get(key)
                      const isSelected = t && t.id === selectedTokenId
                      const col = String.fromCharCode(65 + x)
                      const row = y + 1
                      const notation = `${col}${row}`

                      return (
                        <div
                          key={key}
                          onClick={() => started && actions.onSquareClick(x, y)}
                          style={{
                            width: 90,
                            height: 90,
                            backgroundColor: "#6b7280",
                            borderRadius: 14,
                            boxShadow: isSelected ? "0 0 0 3px #5de8f7" : "0 2px 4px rgba(0,0,0,0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            cursor: started ? "pointer" : "default",
                          }}
                        >
                          <div style={{ position: "absolute", top: 4, left: 6, fontSize: 10, fontWeight: 900, color: "#9ca3af", opacity: 0.75 }}>
                            {notation}
                          </div>

                          {ghost &&
                            (() => {
                              const elapsed = Date.now() - ghost.born
                              if (elapsed > GHOST_MS) return null
                              if (ghost.from.x !== x || ghost.from.y !== y) return null
                              const alpha = Math.max(0, 1 - elapsed / GHOST_MS)

                              return (
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "grid",
                                    placeItems: "center",
                                    pointerEvents: "none",
                                  }}
                                >
                                  <div
                                    className={`token-${ghost.by === "B" ? "teal" : "white"} token-ghost`}
                                    style={{
                                      width: 70,
                                      height: 70,
                                      borderRadius: "50%",
                                      position: "relative",
                                      opacity: 0.4 * alpha,
                                    }}
                                  />
                                </div>
                              )
                            })()}

                                                    {t && (
                            <div
                              className={`token-${t.owner === "B" ? "teal" : "white"}`}
                              style={{ width: 70, height: 70, borderRadius: "50%", position: "relative" }}
                            />
                          )}
                        </div>
                      )
                    })
                  })}
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
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
                {/* Blue Player Section */}
                <div
                  style={{
                    padding: 12,
                    backgroundColor: "#374151",
                    borderRadius: 8,
                    border: "1px solid #4b5563",
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
                      }}
                    >
                      {bluePlayer.avatar}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontWeight: 900, fontSize: 16, color: "#e5e7eb" }}>
                          {bluePlayer.username}
                        </span>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>({bluePlayer.elo})</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#d1d5db" }}>
                        <div className="token-teal" style={{ width: 14, height: 14, borderRadius: "50%", position: "relative" }} />
                        <span>Blue</span>
                        <svg width="18" height="14" viewBox="0 0 16 12" style={{ marginLeft: 6 }}>
                          <rect width="16" height="12" fill="#fff" />
                          <circle cx="8" cy="6" r="3.6" fill="#BC002D" />
                        </svg>
                        <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900 }}>JP</span>
                      </div>
                    </div>
                  </div>

                  {/* Special Actions */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, justifyContent: "flex-end" }}>
                    <button
                      disabled
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: "#1f2937",
                        border: "1px solid #6b7280",
                        cursor: "default",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.5,
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="1">
                        <path d="M9 10h.01" />
                        <path d="M15 10h.01" />
                        <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
                      </svg>
                    </button>
                    <button
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
                        {Array.from({ length: g.reserves.B }).map((_, i) => (
                          <div key={i} className="token-teal" style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Captives</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Array.from({ length: g.captives.B }).map((_, i) => (
                          <div key={i} className="token-white" style={{ width: 16, height: 16, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Route Cards */}
                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 900, marginBottom: 6 }}>Route Cards</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {g.routes.B.slice(0, 4).map((r) => {
                        const isActive = g.player === "B"
                        const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                          const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                        const isSelected = g.pendingSwap.handRouteId === r.id
                        return (
                          <RouteIcon
                            key={r.id}
                            route={r}
                            onClick={() => isActive && !used && actions.playRoute("B", r.id)}
                            style={{
                              width: 50,
                              aspectRatio: "7/13",
                              cursor: isActive && !used ? "pointer" : "default",
                              opacity: used ? 0.3 : 1,
                              border: isSelected ? "2px solid #5de8f7" : "none",
                              borderRadius: 6,
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
                    minHeight: 260,
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
                    }}
                  >
                    <span>Log</span>
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{showLogExpanded ? "Expanded" : ""}</span>
                  </div>
                  <div
                    style={{
                      padding: 12,
                      fontSize: 11,
                      color: "#d1d5db",
                      fontFamily: "monospace",
                      overflowY: "auto",
                      flexGrow: 1,
                      lineHeight: 1.5,
                    }}
                    className="hide-scrollbar"
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
                  color: g.gameOver.winner === "W" ? "#e5e7eb" : "#5de8f7",
                  fontWeight: 900,
                }}
              >
                {g.gameOver.winner === "W" ? "WHITE" : "BLUE"} WINS!
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
                onClick={() => actions.newGame()}
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
      </div>
    </ErrBoundary>
  )
}

export default App