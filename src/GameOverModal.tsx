// src/components/GameOverModal.tsx
import type { GameState } from "../engine/state"

type Player = { username: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  g: GameState
  whitePlayer: Player
  bluePlayer: Player
  opponentType: "ai" | "pvp"
  onPlayComputer: () => void
  onRematch: () => void
}

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
    maxWidth: "90vw", width: "25rem",
    color: "#e8e4d8",
    fontFamily: "'EB Garamond', Georgia, serif",
    overflow: "hidden" as const,
  },
  header: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "#0d0d10",
    display: "flex", justifyContent: "space-between", alignItems: "center",
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
  statRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 12px", borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.07)",
    background: "#0d0d10",
    marginBottom: 6,
  },
  btn: {
    flex: 1, padding: "11px",
    borderRadius: 4,
    border: "1px solid rgba(184,150,106,0.45)",
    background: "rgba(184,150,106,0.12)",
    color: "#d4af7a", fontFamily: "'Cinzel', serif",
    fontWeight: 600, fontSize: "0.72rem",
    letterSpacing: "0.18em", textTransform: "uppercase" as const,
    cursor: "pointer",
  },
  btnGhost: {
    flex: 1, padding: "10px",
    borderRadius: 4,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "#6b6558", fontFamily: "'Cinzel', serif",
    fontWeight: 600, fontSize: "0.68rem",
    letterSpacing: "0.15em", textTransform: "uppercase" as const,
    cursor: "pointer",
  },
}

function winnerDescription(g: GameState, whitePlayer: Player, bluePlayer: Player): { text: string; color: string } {
  const go = g.gameOver!
  const reason = (go as any).reason as string | undefined
  const winner = go.winner
  const winnerName = winner === "W" ? whitePlayer.username : bluePlayer.username
  const winnerColor = winner === "W" ? "#e8e4d8" : "#5de8f7"

  if (reason?.toLowerCase() === "timeout")     return { text: `${winnerName} wins by Timeout`,     color: winnerColor }
  if (reason?.toLowerCase() === "resignation") return { text: `${winnerName} wins by Resignation`, color: winnerColor }
  if (reason?.toLowerCase() === "siegemate")   return { text: `${winnerName} wins by Siegemate`,   color: winnerColor }
  if (reason?.toLowerCase() === "collapse")    return { text: `${winnerName} wins by Collapse`,    color: winnerColor }
  return { text: `${winnerName} wins by Elimination`, color: winnerColor }
}

export function GameOverModal({ isOpen, onClose, g, whitePlayer, bluePlayer, opponentType, onPlayComputer, onRematch }: Props) {
  if (!isOpen || !g.gameOver) return null

  const { text: resultText, color: resultColor } = winnerDescription(g, whitePlayer, bluePlayer)

  const stats: [string, any, any][] = [
    ["Sieges",   (g as any).stats?.sieges?.W   ?? 0, (g as any).stats?.sieges?.B   ?? 0],
    ["Drafts",   (g as any).stats?.drafts?.W   ?? 0, (g as any).stats?.drafts?.B   ?? 0],
    ["Captures", (g as any).stats?.captures?.W ?? 0, (g as any).stats?.captures?.B ?? 0],
    ["Invades",  (g as any).stats?.invades?.W  ?? 0, (g as any).stats?.invades?.B  ?? 0],
  ]

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.title}>Game Over</div>
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

          {/* Result */}
          <div style={{
            textAlign: "center", marginBottom: 20,
            fontFamily: "'Cinzel', serif", fontSize: "1.1rem", fontWeight: 700,
            color: resultColor, letterSpacing: "0.04em",
          }}>
            {resultText}
          </div>

          {/* Match summary */}
          <div style={S.sectionLabel}>
            Summary <div style={S.rule} />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "#0d0d10" }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#6b6558", marginBottom: 4 }}>Rounds</div>
              <div style={{ fontFamily: "monospace", fontSize: "1.3rem", fontWeight: 700, color: "#e8e4d8" }}>{g.round}</div>
            </div>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "#0d0d10" }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#6b6558", marginBottom: 4 }}>Mode</div>
              <div style={{ fontFamily: "monospace", fontSize: "1.3rem", fontWeight: 700, color: "#e8e4d8" }}>Tournament</div>
            </div>
          </div>

          {/* Match stats */}
          <div style={S.sectionLabel}>
            Match Stats <div style={S.rule} />
          </div>
          <div style={{ marginBottom: 20 }}>
            {stats.map(([label, w, b]) => (
              <div key={label} style={S.statRow}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.78rem", fontWeight: 600, color: "#b0aa9e", letterSpacing: "0.08em" }}>
                  {label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "monospace", fontWeight: 700 }}>
                  <span style={{ color: "#e8e4d8" }}>W {String(w)}</span>
                  <span style={{ color: "#3a3830" }}>|</span>
                  <span style={{ color: "#5de8f7" }}>B {String(b)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btnGhost} onClick={onPlayComputer}>
              Play Computer
            </button>
            <button style={S.btn} onClick={onRematch}>
              Rematch
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
