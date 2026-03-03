import React from "react"

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