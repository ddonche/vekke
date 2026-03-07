// src/components/AchievementsModal.tsx
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { sounds } from "../sounds"

type Achievement = {
  id: string
  key: string
  name: string
  description: string
  tier: string | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  achievements: Achievement[]
}

const TIER_COLOR: Record<string, string> = {
  gold:   "#f5c842",
  silver: "#b0b8c8",
  bronze: "#cd7f32",
  basic:  "#b8966a",
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
  closeBtn: {
    fontFamily: "'Cinzel', serif",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 4, width: 36, height: 36,
    color: "#6b6558", cursor: "pointer",
    fontSize: "1.1rem", lineHeight: 1 as const,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  body: { padding: "20px" },
}

export function AchievementsModal({ isOpen, onClose, achievements }: Props) {
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen && achievements.length > 0) {
      sounds.achievement?.play()
    }
  }, [isOpen, achievements.length])

  if (!isOpen || achievements.length === 0) return null

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.title}>
            {achievements.length === 1 ? "Achievement Unlocked" : "Achievements Unlocked"}
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

          {/* Achievement list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {achievements.map(a => {
              const tierColor = TIER_COLOR[a.tier ?? "basic"] ?? "#b8966a"
              return (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 8,
                  border: "1px solid rgba(184,150,106,0.2)",
                  background: "rgba(184,150,106,0.06)",
                }}>
                  <div style={{
                    width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                    background: tierColor,
                    boxShadow: `0 0 6px ${tierColor}88`,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: "'Cinzel', serif", fontSize: "0.82rem",
                      fontWeight: 600, color: "#e8e4d8", letterSpacing: "0.04em",
                    }}>
                      {a.name}
                      {a.tier && (
                        <span style={{
                          marginLeft: 8, fontSize: "0.6rem", letterSpacing: "0.12em",
                          color: tierColor, textTransform: "uppercase",
                        }}>
                          {a.tier}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: "'EB Garamond', serif", fontSize: "0.82rem",
                      color: "rgba(232,228,216,0.45)", marginTop: 2,
                    }}>
                      {a.description}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Profile nudge */}
          <div style={{
            padding: "10px 14px", borderRadius: 8,
            border: "1px solid rgba(93,232,247,0.12)",
            background: "rgba(93,232,247,0.04)",
            marginBottom: 20,
          }}>
            <div style={{
              fontFamily: "'EB Garamond', serif", fontSize: "0.84rem",
              color: "rgba(232,228,216,0.5)", lineHeight: 1.5,
            }}>
              Visit your{" "}
              <span
                onClick={() => { onClose(); navigate("/profile") }}
                style={{ color: "#5de8f7", cursor: "pointer", textDecoration: "underline" }}
              >
                profile
              </span>
              {" "}to see your rewards and track progress toward more.
            </div>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "11px",
              borderRadius: 4,
              border: "1px solid rgba(184,150,106,0.45)",
              background: "rgba(184,150,106,0.12)",
              color: "#d4af7a",
              fontFamily: "'Cinzel', serif",
              fontWeight: 600, fontSize: "0.72rem",
              letterSpacing: "0.18em", textTransform: "uppercase" as const,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>

        </div>
      </div>
    </div>
  )
}
