import React from "react"

export function FlagImg({ cc, size = 16 }: { cc: string | null | undefined; size?: number }) {
  const s = (cc ?? "").trim().toLowerCase()
  if (!s || s.length !== 2) return null
  return (
    <img
      src={`https://flagicons.lipis.dev/flags/4x3/${s}.svg`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={s.toUpperCase()}
      style={{ display: "inline-block", verticalAlign: "middle", borderRadius: 2, flexShrink: 0 }}
      onError={(e) => {
        e.currentTarget.style.display = "none"
      }}
    />
  )
}