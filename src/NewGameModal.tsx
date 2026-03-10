// src/components/NewGameModal.tsx
import type { TimeControlId } from "../engine/ui_controller"

type Props = {
  isOpen: boolean
  onClose: () => void
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
  onTutorial: () => void
  isMuted: boolean
  onToggleMute: () => void
}

const AI_LEVELS: { id: string; label: string; elo: number; color: string; outline?: boolean }[] = [
  { id: "novice",        label: "Novice",        elo: 600,  color: "#6b6558" },
  { id: "adept",         label: "Adept",         elo: 900,  color: "#2563eb" },
  { id: "expert",        label: "Expert",        elo: 1200, color: "#dc2626" },
  { id: "master",        label: "Master",        elo: 1500, color: "#16a34a" },
  { id: "senior_master", label: "Senior Master", elo: 1750, color: "#7c2d12" },
  { id: "grandmaster",   label: "Grandmaster",   elo: 2000, color: "#000000", outline: true },
]

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
}

function OptionBtn({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "10px 12px", borderRadius: 8,
        border: selected ? "1px solid rgba(93,232,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
        background: selected ? "rgba(93,232,247,0.04)" : "#0f0f14",
        color: selected ? "#5de8f7" : "#e8e4d8",
        fontFamily: "'Cinzel', serif", fontWeight: 600, cursor: "pointer",
        fontSize: "0.78rem", letterSpacing: "0.06em", transition: "all 0.12s",
        boxShadow: selected ? "0 0 12px rgba(93,232,247,0.08)" : "none",
      }}
    >
      {children}
    </button>
  )
}

export function NewGameModal({
  isOpen, onClose,
  timeControlId, aiDifficulty, boardStyle,
  loginWarn, newGameMsg,
  onSetTimeControlId, onSetAiDifficulty, onSetBoardStyle,
  onStartGame, onSignIn, onTutorial,
  isMuted, onToggleMute,
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={onToggleMute}
              title={isMuted ? "Unmute music" : "Mute music"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="#6b6558">
                  <path d="M80 416L128 416L262.1 535.2C268.5 540.9 276.7 544 285.2 544C304.4 544 320 528.4 320 509.2L320 130.8C320 111.6 304.4 96 285.2 96C276.7 96 268.5 99.1 262.1 104.8L128 224L80 224C53.5 224 32 245.5 32 272L32 368C32 394.5 53.5 416 80 416zM399 239C389.6 248.4 389.6 263.6 399 272.9L446 319.9L399 366.9C389.6 376.3 389.6 391.5 399 400.8C408.4 410.1 423.6 410.2 432.9 400.8L479.9 353.8L526.9 400.8C536.3 410.2 551.5 410.2 560.8 400.8C570.1 391.4 570.2 376.2 560.8 366.9L513.8 319.9L560.8 272.9C570.2 263.5 570.2 248.3 560.8 239C551.4 229.7 536.2 229.6 526.9 239L479.9 286L432.9 239C423.5 229.6 408.3 229.6 399 239z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="#b8966a">
                  <path d="M112 416L160 416L294.1 535.2C300.5 540.9 308.7 544 317.2 544C336.4 544 352 528.4 352 509.2L352 130.8C352 111.6 336.4 96 317.2 96C308.7 96 300.5 99.1 294.1 104.8L160 224L112 224C85.5 224 64 245.5 64 272L64 368C64 394.5 85.5 416 112 416zM505.1 171C494.8 162.6 479.7 164.2 471.3 174.5C462.9 184.8 464.5 199.9 474.8 208.3C507.3 234.7 528 274.9 528 320C528 365.1 507.3 405.3 474.8 431.8C464.5 440.2 463 455.3 471.3 465.6C479.6 475.9 494.8 477.4 505.1 469.1C548.3 433.9 576 380.2 576 320.1C576 260 548.3 206.3 505.1 171.1zM444.6 245.5C434.3 237.1 419.2 238.7 410.8 249C402.4 259.3 404 274.4 414.3 282.8C425.1 291.6 432 305 432 320C432 335 425.1 348.4 414.3 357.3C404 365.7 402.5 380.8 410.8 391.1C419.1 401.4 434.3 402.9 444.6 394.6C466.1 376.9 480 350.1 480 320C480 289.9 466.1 263.1 444.5 245.5z"/>
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="#6b6558">
                <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
              </svg>
            </button>
          </div>
        </div>

        <div style={S.body}>

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
            <button
              onClick={onTutorial}
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
              width: "100%", padding: "11px", borderRadius: 4,
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

          {/* Theme credit */}
          <div style={{ textAlign: "center", marginTop: 16, fontFamily: "'Cinzel', serif", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b6558" }}>
            ♪ "Rainwall" — Janden
          </div>

        </div>
      </div>
    </div>
  )
}
