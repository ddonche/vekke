import React from "react"
import { FlagImg } from "./FlagImg"

export type PlayerChipModel = {
  username: string
  avatar_url: string | null
  country_code: string | null
  elo: number | null
  tag?: string | null // "YOU" / "AI" / "PRO" etc
  account_tier?: string | null
  accent?: string | null
}

export function PlayerChip({ p, align = "left" }: { p: PlayerChipModel; align?: "left" | "right" }) {
  const name = p.username || "Player"
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: align === "right" ? "row-reverse" : "row" }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "#13131a",
          border: `1px solid ${p.accent ? `${p.accent}55` : "rgba(184,150,106,0.20)"}`,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.8rem", fontWeight: 800, color: "#b0aa9e" }}>
            {initials}
          </span>
        )}
      </div>

      <div style={{ textAlign: align === "right" ? "right" : "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
          <span
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "0.88rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "#e8e4d8",
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>

          {p.tag ? (
            <span
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: "0.55rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: p.accent ?? "#b8966a",
                opacity: 0.9,
              }}
            >
              {p.tag}
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: align === "right" ? "flex-end" : "flex-start", marginTop: 2 }}>
          <FlagImg cc={p.country_code} size={14} />
          {typeof p.elo === "number" ? (
            <span style={{ fontFamily: "monospace", fontSize: "0.9rem", fontWeight: 800, color: p.accent ?? "#b8966a" }}>
              {p.elo}
            </span>
          ) : (
            <span style={{ fontFamily: "monospace", fontSize: "0.9rem", fontWeight: 800, color: "#6b6558" }}>—</span>
          )}
        </div>
      </div>
    </div>
  )
}