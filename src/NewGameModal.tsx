// src/components/NewGameModal.tsx
import type { TimeControlId } from "../engine/ui_controller"

type UserProfile = {
  username: string
  country_code: string | null
  country_name: string | null
  avatar_url: string | null
  order_id: string | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  userProfile: UserProfile | null
  myElo: number
  myPeak: number
  timeControlId: TimeControlId
  aiDifficulty: string
  boardStyle: "grid" | "intersection"
  loginWarn: string
  newGameMsg: string | null
  onSetTimeControlId: (id: TimeControlId) => void
  onSetAiDifficulty: (d: string) => void
  onSetBoardStyle: (s: "grid" | "intersection") => void
  onStartGame: () => Promise<void>
  onSignIn: () => void
  onEditProfile: () => void
  onLeaderboard: () => void
}

function eloColor(elo: number) {
  if (elo >= 2000) return "#D4AF37" // Grandmaster
  if (elo >= 1750) return "#7c2d12" // Senior Master
  if (elo >= 1500) return "#16a34a" // Master
  if (elo >= 1200) return "#dc2626" // Expert
  if (elo >= 900)  return "#2563eb" // Adept
  return "#6b6558"                  // Novice
}

const AI_LEVELS: { id: string; label: string; elo: number; color: string; outline?: boolean }[] = [
  { id: "novice",        label: "Novice",        elo: 600,  color: "#6b6558" },
  { id: "adept",         label: "Adept",         elo: 900,  color: "#2563eb" },
  { id: "expert",        label: "Expert",        elo: 1200, color: "#dc2626" },
  { id: "master",        label: "Master",        elo: 1500, color: "#16a34a" },
  { id: "senior_master", label: "Senior Master", elo: 1750, color: "#7c2d12" },
  { id: "grandmaster",   label: "Grandmaster",   elo: 2000, color: "#000000", outline: true },
]

// Shared style tokens — same as ProfileModal
const S = {
  overlay: {
    position: "fixed" as const, inset: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, padding: "20px",
  },
  card: {
    background: "#0f0f14",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: "0",
    maxWidth: "90vw", width: "25rem",
    color: "#e8e4d8",
    fontFamily: "'EB Garamond', Georgia, serif",
    maxHeight: "92vh", overflowY: "auto" as const,
    position: "relative" as const,
  },
  header: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "#0d0d10",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexShrink: 0 as const,
  },
  title: {
    fontFamily: "'Cinzel', serif", fontSize: "1.3rem", fontWeight: 700,
    letterSpacing: "0.06em", color: "#e8e4d8",
  },
  body: { padding: "20px" },
  sectionLabel: {
    fontFamily: "'Cinzel', serif", fontSize: "0.72rem", fontWeight: 600,
    letterSpacing: "0.45em", textTransform: "uppercase" as const,
    color: "#6b6558",
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 10,
  },
  rule: { flex: 1, height: 1, background: "rgba(255,255,255,0.07)" },
  divider: { height: 1, background: "rgba(255,255,255,0.07)", margin: "16px 0" },
  closeBtn: {
    fontFamily: "'Cinzel', serif",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 4, width: 36, height: 36,
    color: "#6b6558", cursor: "pointer",
    fontSize: "1.1rem", lineHeight: 1 as const,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "border-color 0.15s, color 0.15s",
  },
}

function OptionBtn({
  selected, onClick, children,
}: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 8,
        border: selected ? "1px solid rgba(93,232,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
        background: selected ? "rgba(93,232,247,0.04)" : "#0f0f14",
        color: selected ? "#5de8f7" : "#e8e4d8",
        fontFamily: "'Cinzel', serif",
        fontWeight: 600,
        cursor: "pointer",
        fontSize: "0.78rem",
        letterSpacing: "0.06em",
        transition: "all 0.12s",
        boxShadow: selected ? "0 0 12px rgba(93,232,247,0.08)" : "none",
      }}
    >
      {children}
    </button>
  )
}

export function NewGameModal({
  isOpen, onClose,
  userProfile, myElo, myPeak,
  timeControlId, aiDifficulty, boardStyle,
  loginWarn, newGameMsg,
  onSetTimeControlId, onSetAiDifficulty, onSetBoardStyle,
  onStartGame, onSignIn, onEditProfile, onLeaderboard,
}: Props) {
  if (!isOpen) return null

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/logo.png" alt="Vekke" style={{ height: 32, width: "auto" }} />
            <div style={S.title}>New Game</div>
          </div>
          <button
            onClick={onClose}
            style={S.closeBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,150,106,0.5)"; e.currentTarget.style.color = "#d4af7a" }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#6b6558" }}
          >
            ×
          </button>
        </div>

        <div style={S.body}>

          {/* Player card */}
          {userProfile ? (
            <div style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(184,150,106,0.2)",
              background: "#0d0d10",
              marginBottom: 16,
              display: "flex", gap: 12, alignItems: "center",
            }}>
              {/* Avatar */}
              <div style={{
                width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                background: "#13131a", border: "1px solid rgba(184,150,106,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}>
                {userProfile.avatar_url
                  ? <img src={`${userProfile.avatar_url}?t=${Date.now()}`} alt={userProfile.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.9rem", fontWeight: 700, color: "#b0aa9e" }}>{userProfile.username[0].toUpperCase()}</span>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: "1rem", fontWeight: 700, color: "#e8e4d8" }}>
                    {userProfile.username}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: "0.9rem", color: eloColor(myElo) }}>
                    {myElo}
                    {myPeak !== myElo ? <span style={{ color: "#6b6558", marginLeft: 4, fontSize: "0.8rem" }}>(peak {myPeak})</span> : null}
                  </span>
                </div>
                <button
                  onClick={onEditProfile}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: "'EB Garamond', Georgia, serif",
                    fontSize: "0.95rem", fontStyle: "italic", color: "#6b6558",
                    textDecoration: "none",
                  }}
                >
                  Edit Profile
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={onSignIn}
                style={{
                  width: "100%", padding: "11px",
                  borderRadius: 4, marginBottom: 10,
                  border: "1px solid rgba(184,150,106,0.45)",
                  background: "rgba(184,150,106,0.12)",
                  color: "#d4af7a", fontFamily: "'Cinzel', serif",
                  fontWeight: 600, fontSize: "0.72rem",
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Sign In
              </button>
              <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1rem", fontStyle: "italic", color: "#6b6558", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
                Create an account to play vs others, get ranked, and compete in tournaments.
              </p>
            </>
          )}

          <div style={S.divider} />

          {/* Time Control */}
          <div style={S.sectionLabel}>
            Time Control <div style={S.rule} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["standard", "rapid", "blitz", "daily"] as const).map((id) => {
              const labels = { standard: "10 min", rapid: "5 min", blitz: "3 min", daily: "24 hr" }
              return (
                <OptionBtn key={id} selected={timeControlId === id} onClick={() => onSetTimeControlId(id)}>
                  {labels[id]}
                </OptionBtn>
              )
            })}
          </div>

          {/* Opponent Skill */}
          <div style={S.sectionLabel}>
            Opponent Skill <div style={S.rule} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {AI_LEVELS.map(({ id, label, elo, color, outline }) => {
              const sel = aiDifficulty === id
              return (
                <button
                  key={id}
                  onClick={() => onSetAiDifficulty(id)}
                  style={{
                    padding: "10px 12px", borderRadius: 8,
                    border: sel ? "1px solid rgba(93,232,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
                    background: sel ? "rgba(93,232,247,0.04)" : "#0f0f14",
                    color: sel ? "#5de8f7" : "#e8e4d8",
                    fontFamily: "'Cinzel', serif", fontWeight: 600,
                    cursor: "pointer", fontSize: "0.78rem",
                    transition: "all 0.12s",
                    boxShadow: sel ? "0 0 12px rgba(93,232,247,0.08)" : "none",
                    textAlign: "left" as const,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                      background: color,
                      boxShadow: outline ? "0 0 0 1px rgba(255,255,255,0.2)" : "none",
                      display: "inline-block",
                    }} />
                    {label}
                  </div>
                  <div style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "0.85rem", fontStyle: "italic", color: sel ? "rgba(93,232,247,0.6)" : "#6b6558" }}>
                    {elo}{id === "grandmaster" ? "+" : ""}
                  </div>
                </button>
              )
            })}
            {/* Tutorial full-width */}
            <button
              onClick={() => console.log("Tutorial clicked")}
              style={{
                gridColumn: "1 / -1",
                padding: "10px 12px", borderRadius: 8,
                border: "1px dashed rgba(255,255,255,0.07)",
                background: "#0d0d10",
                color: "#6b6558",
                fontFamily: "'Cinzel', serif", fontWeight: 600,
                cursor: "pointer", fontSize: "0.78rem",
                letterSpacing: "0.1em",
              }}
            >
              Tutorial
            </button>
          </div>

          {/* Board Style */}
          <div style={S.sectionLabel}>
            Board Style <div style={S.rule} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <OptionBtn selected={boardStyle === "grid"} onClick={() => onSetBoardStyle("grid")}>
              Grid Squares
            </OptionBtn>
            <OptionBtn selected={boardStyle === "intersection"} onClick={() => onSetBoardStyle("intersection")}>
              Intersections
            </OptionBtn>
          </div>
          <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1rem", fontStyle: "italic", color: "#6b6558", textAlign: "center", marginBottom: 16, lineHeight: 1.4 }}>
            {boardStyle === "grid"
              ? "Grid squares for learning and casual play"
              : "Go-style intersections for tournament play"}
          </p>

          {/* Warnings / errors */}
          {loginWarn && (
            <div style={{ padding: "10px 12px", marginBottom: 12, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, fontFamily: "'EB Garamond', Georgia, serif", fontSize: "0.95rem", color: "#b0aa9e" }}>
              {loginWarn}
            </div>
          )}
          {newGameMsg && (
            <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(238,72,76,0.3)", background: "rgba(238,72,76,0.08)", fontFamily: "'EB Garamond', Georgia, serif", fontSize: "0.95rem", color: "#fca5a5" }}>
              {newGameMsg}
            </div>
          )}

          {/* Start Game */}
          <button
            onClick={onStartGame}
            style={{
              width: "100%", padding: "11px",
              borderRadius: 4, marginBottom: 16,
              border: "1px solid rgba(184,150,106,0.45)",
              background: "rgba(184,150,106,0.12)",
              color: "#d4af7a", fontFamily: "'Cinzel', serif",
              fontWeight: 600, fontSize: "0.72rem",
              letterSpacing: "0.18em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Start Game
          </button>

          {/* Footer links */}
          <div style={{ textAlign: "center" }}>
            <button
              onClick={onLeaderboard}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1rem", fontStyle: "italic", color: "#6b6558" }}
            >
              Leaderboard
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
