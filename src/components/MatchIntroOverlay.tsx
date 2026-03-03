// src/components/MatchIntroOverlay.tsx
import React, { useEffect, useMemo, useState } from "react"
import { PlayerChip, type PlayerChipModel } from "./PlayerChip"

export function VekkeLogoLoader({
  size = 72,
  gap = 48,
  overlap = 16,
  durationMs = 2400,
  white = "#ffffff",
  teal = "#2f97a8",
  overlapRed = "#e34b55",
}: {
  size?: number
  gap?: number
  overlap?: number
  durationMs?: number
  white?: string
  teal?: string
  overlapRed?: string
}) {
  const r = size / 2
  const w = size * 2 + gap
  const h = size
  const inward = gap / 2 + overlap

  // SMIL timing: converge, hold, separate
  const dur = `${durationMs}ms`
  const keyTimes = "0;0.4;0.6;1"
  const leftValues = `0 0; ${inward} 0; ${inward} 0; 0 0`
  const rightValues = `0 0; ${-inward} 0; ${-inward} 0; 0 0`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        {/* Moving mask: the "right circle" shape moves with the teal circle */}
        <mask id="vekkeRightMask">
          <rect x="0" y="0" width={w} height={h} fill="black" />
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              dur={dur}
              repeatCount="indefinite"
              keyTimes={keyTimes}
              values={rightValues}
              calcMode="spline"
              keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
            />
            <circle cx={w - r} cy={r} r={r} fill="white" />
          </g>
        </mask>
      </defs>

      {/* Left circle (white) */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          dur={dur}
          repeatCount="indefinite"
          keyTimes={keyTimes}
          values={leftValues}
          calcMode="spline"
          keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
        />
        <circle cx={r} cy={r} r={r} fill={white} />
      </g>

      {/* Right circle (teal) */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          dur={dur}
          repeatCount="indefinite"
          keyTimes={keyTimes}
          values={rightValues}
          calcMode="spline"
          keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
        />
        <circle cx={w - r} cy={r} r={r} fill={teal} />
      </g>

      {/* Overlap region (red): left circle painted red, clipped by the moving right circle mask */}
      <g mask="url(#vekkeRightMask)">
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            dur={dur}
            repeatCount="indefinite"
            keyTimes={keyTimes}
            values={leftValues}
            calcMode="spline"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
          />
          <circle cx={r} cy={r} r={r} fill={overlapRed} />
        </g>
      </g>
    </svg>
  )
}

export function MatchIntroOverlay({
  left,
  right,
  subtitleLine,
  labels,
  onDone,
}: {
  left: PlayerChipModel
  right: PlayerChipModel
  subtitleLine: string
  labels: string[]
  onDone: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [pct, setPct] = useState(0)

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const safeLabels = useMemo(() => (labels && labels.length ? labels : ["Preparing match..."]), [labels])
  const activeLabel = safeLabels[idx % safeLabels.length]

  // Rotate label
  useEffect(() => {
    if (safeLabels.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % safeLabels.length), 650)
    return () => clearInterval(t)
  }, [safeLabels])

  // Progress + auto-finish
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const DURATION_MS = 9000

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS)
      setPct(p)
      if (p >= 1) {
        onDone()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onDone])

  return (
    <div
      onClick={onDone}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#0a0a0c",
        color: "#e8e4d8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? 10 : 18,
        zIndex: 9999,
      }}
    >
      {/* INNER WRAPPER — borderless */}
      <div
        style={{
          width: "min(860px, 100%)",
          padding: isMobile ? "10px 10px 10px" : "20px 18px 16px",
        }}
      >
        {/* top row: chips + loader */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: isMobile ? 8 : 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <PlayerChip p={left} align="left" />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: isMobile ? 6 : 10,
            }}
          >
            <VekkeLogoLoader size={isMobile ? 60 : 72} gap={isMobile ? 40 : 48} overlap={isMobile ? 14 : 16} durationMs={2400} />
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: isMobile ? 10 : 11,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "rgba(184,150,106,0.75)",
                userSelect: "none",
              }}
            >
              Match Intro
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PlayerChip p={right} align="right" />
          </div>
        </div>

        {/* center text */}
        <div style={{ marginTop: isMobile ? 8 : 14, textAlign: "center" }}>
          <div
            style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: isMobile ? "1.02rem" : "1.12rem",
              color: "#e8e4d8",
              marginBottom: isMobile ? 4 : 8,
            }}
          >
            {subtitleLine}
          </div>

          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: isMobile ? 10 : 11,
              letterSpacing: "0.12em",
              color: "rgba(93,232,247,0.75)",
              minHeight: isMobile ? 14 : 16,
              marginBottom: isMobile ? 8 : 12,
            }}
          >
            {activeLabel}
          </div>

          {/* progress */}
          <div
            style={{
              height: isMobile ? 7 : 8,
              borderRadius: 999,
              background: "rgba(184,150,106,0.14)",
              border: "1px solid rgba(184,150,106,0.18)",
              overflow: "hidden",
              width: isMobile ? "min(420px, 92vw)" : "min(520px, 100%)",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(pct * 100)}%`,
                background: "linear-gradient(90deg, rgba(93,232,247,0.25), rgba(93,232,247,0.85))",
                transition: "width 0.06s linear",
              }}
            />
          </div>

          <div
            style={{
              marginTop: isMobile ? 6 : 10,
              fontSize: isMobile ? 10 : 11,
              color: "rgba(184,150,106,0.55)",
              fontFamily: "'Cinzel', serif",
              letterSpacing: "0.10em",
              userSelect: "none",
            }}
          >
            (click to skip)
          </div>
        </div>
      </div>
    </div>
  )
}