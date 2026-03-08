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

  const dur = `${durationMs}ms`
  const keyTimes = "0;0.4;0.6;1"
  const leftValues = `0 0; ${inward} 0; ${inward} 0; 0 0`
  const rightValues = `0 0; ${-inward} 0; ${-inward} 0; 0 0`

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      <defs>
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

  const safeLabels = useMemo(
    () => (labels && labels.length ? labels : ["Preparing match..."]),
    [labels]
  )

  const activeLabel = safeLabels[idx % safeLabels.length]

  useEffect(() => {
    if (safeLabels.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % safeLabels.length), 650)
    return () => clearInterval(t)
  }, [safeLabels])

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

  if (isMobile) {
    return (
      <div
        onClick={onDone}
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(circle at top, rgba(27,39,46,0.35) 0%, rgba(10,10,12,1) 45%, rgba(10,10,12,1) 100%)",
          color: "#e8e4d8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "18px 12px",
          zIndex: 9999,
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
            padding: "26px 10px 22px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              width: "100%",
            }}
          >
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "rgba(184,150,106,0.72)",
                userSelect: "none",
              }}
            >
              You
            </div>

            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <PlayerChip p={left} align="center" />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              margin: "2px 0",
            }}
          >
            <VekkeLogoLoader
              size={38}
              gap={22}
              overlap={8}
              durationMs={2400}
            />

            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.34em",
                textTransform: "uppercase",
                color: "rgba(232,228,216,0.52)",
                userSelect: "none",
              }}
            >
              VS
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              width: "100%",
            }}
          >
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "rgba(184,150,106,0.72)",
                userSelect: "none",
              }}
            >
              Opponent
            </div>

            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <PlayerChip p={right} align="center" />
            </div>
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: 330,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: "1.08rem",
                lineHeight: 1.28,
                color: "#e8e4d8",
                wordBreak: "break-word",
              }}
            >
              {subtitleLine}
            </div>

            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.14em",
                color: "rgba(93,232,247,0.82)",
                minHeight: 16,
                wordBreak: "break-word",
              }}
            >
              {activeLabel}
            </div>
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: 280,
              height: 6,
              borderRadius: 999,
              background: "rgba(184,150,106,0.15)",
              border: "1px solid rgba(184,150,106,0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(pct * 100)}%`,
                background:
                  "linear-gradient(90deg, rgba(93,232,247,0.25), rgba(93,232,247,0.9))",
                transition: "width 0.06s linear",
              }}
            />
          </div>

          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(184,150,106,0.45)",
              userSelect: "none",
            }}
          >
            tap anywhere to skip
          </div>
        </div>
      </div>
    )
  }

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
        padding: 18,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(860px, 100%)",
          padding: "20px 18px 16px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 14,
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
              gap: 10,
            }}
          >
            <VekkeLogoLoader size={72} gap={48} overlap={16} durationMs={2400} />
            <div
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 11,
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

        <div style={{ marginTop: 14, textAlign: "center" }}>
          <div
            style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: "1.12rem",
              color: "#e8e4d8",
              marginBottom: 8,
            }}
          >
            {subtitleLine}
          </div>

          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 11,
              letterSpacing: "0.12em",
              color: "rgba(93,232,247,0.75)",
              minHeight: 16,
              marginBottom: 12,
            }}
          >
            {activeLabel}
          </div>

          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "rgba(184,150,106,0.14)",
              border: "1px solid rgba(184,150,106,0.18)",
              overflow: "hidden",
              width: "min(520px, 100%)",
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
              marginTop: 10,
              fontSize: 11,
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