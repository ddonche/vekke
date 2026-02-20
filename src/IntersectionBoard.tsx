import React from "react"
import { SIZE } from "./engine/coords"
import type { Player, Token } from "./engine/state"
import type { Direction } from "./engine/directions"
import { DIR } from "./engine/directions"

interface IntersectionBoardProps {
  boardMap: Map<string, Token>
  selectedTokenId: string | null
  ghost: {
    by: Player
    from: { x: number; y: number }
    tokenId: string
    dir: Direction
    born: number
  } | null
  started: boolean
  phase: string
  onSquareClick: (x: number, y: number) => void
  GHOST_MS: number
  mobile?: boolean
  evasionSourcePos?: { x: number; y: number } | null
  evasionDestPos?: { x: number; y: number } | null
  evasionPlayer?: Player | null
  highlightColor?: string
  bodyColor?: string
}

export function IntersectionBoard({
  boardMap,
  selectedTokenId,
  ghost,
  started,
  phase,
  onSquareClick,
  GHOST_MS,
  mobile = false,
  evasionSourcePos = null,
  evasionDestPos = null,
  evasionPlayer = null,
  highlightColor = "#ee484c",
  bodyColor = "#26c6da",
}: IntersectionBoardProps) {
  // Mobile: match GridBoard flex proportions
  // Grid uses: gap 0.125rem (2px), padding 0.375rem (6px), 6 cells
  // For a ~360px container: cell ≈ 56px, spacing ≈ 58px, first center ≈ 34px
  const cellSize = mobile ? 58 : 95
  const padding = mobile ? 34 : 61
  const boardSize = 8
  const playableSize = 6
  const svgSize = mobile ? (cellSize * (playableSize - 1) + padding * 2) : 597
  const tokenRadius = mobile ? 21 : 35

  const offset = (boardSize - playableSize) / 2
  const halfCell = cellSize / 2
  const startPos = padding - 0.5 * cellSize
  const endPos = padding + (playableSize - 1 + 0.5) * cellSize

  // Grid lines
  const gridLines: JSX.Element[] = []
  for (let i = 0; i < playableSize; i++) {
    const pos = padding + i * cellSize

    // Horizontal
    gridLines.push(
      <line
        key={`h${i}`}
        x1={startPos}
        y1={pos}
        x2={endPos}
        y2={pos}
        stroke={mobile ? "#666" : "#444"}
        strokeWidth={1}
        opacity={mobile ? 0.5 : 0.5}
      />
    )

    // Vertical
    gridLines.push(
      <line
        key={`v${i}`}
        x1={pos}
        y1={startPos}
        x2={pos}
        y2={endPos}
        stroke={mobile ? "#666" : "#444"}
        strokeWidth={1}
        opacity={mobile ? 0.5 : 0.5}
      />
    )
  }

  // Diagonal lines
  const diagRange = playableSize + 1
  for (let i = -(diagRange - 2); i < diagRange - 1; i++) {
    let x1, y1, x2, y2
    if (i <= 0) {
      x1 = startPos
      y1 = startPos - i * cellSize
      const length = Math.min(endPos - startPos, endPos - y1)
      x2 = x1 + length
      y2 = y1 + length
    } else {
      x1 = startPos + i * cellSize
      y1 = startPos
      const length = Math.min(endPos - x1, endPos - startPos)
      x2 = x1 + length
      y2 = y1 + length
    }

    gridLines.push(
      <line
        key={`diag1-${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={mobile ? "#666" : "#444"}
        strokeWidth={1}
        opacity={mobile ? 0.5 : 0.5}
      />
    )
  }

  for (let i = 0; i < diagRange + (diagRange - 2); i++) {
    let x1, y1, x2, y2
    if (i < diagRange) {
      x1 = startPos + i * cellSize
      y1 = startPos
      const length = Math.min(x1 - startPos, endPos - startPos)
      x2 = x1 - length
      y2 = y1 + length
    } else {
      x1 = endPos
      y1 = startPos + (i - diagRange + 1) * cellSize
      const length = Math.min(endPos - startPos, endPos - y1)
      x2 = x1 - length
      y2 = y1 + length
    }

    gridLines.push(
      <line
        key={`diag2-${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={mobile ? "#666" : "#444"}
        strokeWidth={1}
        opacity={mobile ? 0.5 : 0.5}
      />
    )
  }

  // Intersection dots and clickable areas
  const intersections: JSX.Element[] = []
  for (let row = 0; row < playableSize; row++) {
    for (let col = 0; col < playableSize; col++) {
      const x = padding + col * cellSize
      const y = padding + row * cellSize
      const boardX = col
      const boardY = playableSize - 1 - row
      const key = `${boardX},${boardY}`
      const t = boardMap.get(key)
      const isSelected = t && t.id === selectedTokenId
      const isEvasionSource = evasionSourcePos && boardX === evasionSourcePos.x && boardY === evasionSourcePos.y
      const isEvasionDest = evasionDestPos && boardX === evasionDestPos.x && boardY === evasionDestPos.y

      // Clickable area
      intersections.push(
        <circle
          key={`click-${key}`}
          cx={x}
          cy={y}
          r={cellSize / 2}
          fill="transparent"
          cursor={started && (phase === "OPENING" || Boolean(t) || evasionSourcePos != null) ? "pointer" : "default"}
          onClick={() => started && onSquareClick(boardX, boardY)}
        />
      )

      // Intersection dot
      intersections.push(
        <circle
          key={`dot-${key}`}
          cx={x}
          cy={y}
          r={mobile ? 4 : 5}
          fill={isSelected ? "#5de8f7" : highlightColor}
          pointerEvents="none"
        />
      )

      // Highlight ring around selected token
      if (isSelected) {
        const highlightRadius = (mobile ? 21 : 35) + (mobile ? 6 : 8)
        intersections.push(
          <circle
            key={`highlight-${key}`}
            cx={x}
            cy={y}
            r={highlightRadius}
            fill="none"
            stroke="#5de8f7"
            strokeWidth={mobile ? 2 : 3}
            pointerEvents="none"
          />
        )
      }

      // Evasion source ring - cyan, marks where captured token came from
      if (isEvasionSource) {
        const highlightRadius = (mobile ? 21 : 35) + (mobile ? 6 : 8)
        intersections.push(
          <circle
            key={`evasion-src-${key}`}
            cx={x}
            cy={y}
            r={highlightRadius}
            fill="none"
            stroke="#5de8f7"
            strokeWidth={mobile ? 2 : 3}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )
      }

      // Evasion dest ring - purple, marks selected destination
      if (isEvasionDest) {
        const highlightRadius = (mobile ? 21 : 35) + (mobile ? 6 : 8)
        intersections.push(
          <circle
            key={`evasion-dest-${key}`}
            cx={x}
            cy={y}
            r={highlightRadius}
            fill="none"
            stroke="#a78bfa"
            strokeWidth={mobile ? 2 : 3}
            pointerEvents="none"
          />
        )
      }
    }
  }

  const board = (
    <div style={{ 
      position: "relative", 
      width: svgSize, 
      height: svgSize,
    }}>
      <svg width={svgSize} height={svgSize}>
        {gridLines}
        {intersections}
      </svg>

      {/* Tokens rendered as HTML divs positioned absolutely */}
      {Array.from({ length: SIZE }, (_, ry) => {
        const y = SIZE - 1 - ry
        return Array.from({ length: SIZE }, (_, x) => {
          const key = `${x},${y}`
          const t = boardMap.get(key)
          const isSelected = t && t.id === selectedTokenId
          const row = y
          const col = x
          const isEvasionSource = evasionSourcePos && x === evasionSourcePos.x && y === evasionSourcePos.y
          const isEvasionDest = evasionDestPos && x === evasionDestPos.x && y === evasionDestPos.y

          const posX = padding + col * cellSize
          const posY = padding + ((playableSize - 1 - row)) * cellSize

          return (
            <React.Fragment key={key}>
              {/* Trailing ghost token - shows direction of movement */}
              {ghost && t && t.id === ghost.tokenId && (() => {
                const elapsed = Date.now() - ghost.born
                if (elapsed > GHOST_MS) return null
                const alpha = Math.max(0, 1 - elapsed / GHOST_MS)
                
                // Get actual route direction and negate for opposite
                const dir = DIR[ghost.dir]
                const oppositeDx = -dir.dx
                const oppositeDy = -dir.dy
                
                // Calculate offset (0.5 cells in opposite direction)
                const startOffsetX = oppositeDx * cellSize * 0.5
                const startOffsetY = oppositeDy * cellSize * 0.5
                
                // Animate from start to center
                const progress = Math.min(1, elapsed / GHOST_MS)
                const currentX = startOffsetX * (1 - progress)
                const currentY = -startOffsetY * (1 - progress) // Negate Y for screen coords
                
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: posX - tokenRadius + currentX,
                      top: posY - tokenRadius + currentY,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      className={`token-${ghost.by === "B" ? "teal" : "white"} token-ghost`}
                      style={{
                        width: tokenRadius * 2,
                        height: tokenRadius * 2,
                        borderRadius: "50%",
                        position: "relative",
                        opacity: 0.4 * alpha,
                      }}
                    />
                  </div>
                )
              })()}

              {/* Ghost token */}
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
                        left: posX - tokenRadius,
                        top: posY - tokenRadius,
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        className={`token-${ghost.by === "B" ? "teal" : "white"} token-ghost`}
                        style={{
                          width: tokenRadius * 2,
                          height: tokenRadius * 2,
                          borderRadius: "50%",
                          position: "relative",
                          opacity: 0.4 * alpha,
                        }}
                      />
                    </div>
                  )
                })()}

              {/* Actual token */}
              {t && (() => {
                // Calculate siege status
                const directions = [
                  [0, 1],   // N
                  [1, 1],   // NE
                  [1, 0],   // E
                  [1, -1],  // SE
                  [0, -1],  // S
                  [-1, -1], // SW
                  [-1, 0],  // W
                  [-1, 1],  // NW
                ]
                
                let enemyNeighbors = 0
                const enemy = t.owner === "W" ? "B" : "W"
                
                for (const [dx, dy] of directions) {
                  const nx = col + dx
                  const ny = row + dy
                  if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
                    const neighborKey = `${nx},${ny}`
                    const neighbor = boardMap.get(neighborKey)
                    if (neighbor && neighbor.owner === enemy) {
                      enemyNeighbors++
                    }
                  }
                }
                
                const locked = enemyNeighbors >= 4
                
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: posX - tokenRadius,
                      top: posY - tokenRadius,
                      pointerEvents: "none",
                    }}
                  >
                    {/* Token circle */}
                    <div
                      className={`token-${t.owner === "B" ? "teal" : "white"}`}
                      style={{
                        width: tokenRadius * 2,
                        height: tokenRadius * 2,
                        borderRadius: "50%",
                        position: "relative",
                      }}
                    />
                    
                    {/* Siege ring - dashed for 4+ enemies */}
                    {locked && (
                      <div
                        style={{
                          position: "absolute",
                          inset: mobile ? "-3px" : "-4px",
                          borderRadius: "50%",
                          border: `${mobile ? "2px" : "2px"} dashed ${highlightColor}`,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                )
              })()}

              {/* Evasion source ghost - faded token showing where captured token was (only when no token there) */}
              {isEvasionSource && !t && evasionPlayer && (
                <div
                  style={{
                    position: "absolute",
                    left: posX - tokenRadius,
                    top: posY - tokenRadius,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    className={`token-${evasionPlayer === "B" ? "teal" : "white"}`}
                    style={{
                      width: tokenRadius * 2,
                      height: tokenRadius * 2,
                      borderRadius: "50%",
                      opacity: 0.35,
                    }}
                  />
                </div>
              )}

              {/* Evasion destination ghost - shows where token will land */}
              {isEvasionDest && evasionPlayer && (
                <div
                  style={{
                    position: "absolute",
                    left: posX - tokenRadius,
                    top: posY - tokenRadius,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    className={`token-${evasionPlayer === "B" ? "teal" : "white"}`}
                    style={{
                      width: tokenRadius * 2,
                      height: tokenRadius * 2,
                      borderRadius: "50%",
                      opacity: 0.55,
                      outline: `${mobile ? "2px" : "3px"} solid #a78bfa`,
                      outlineOffset: "2px",
                    }}
                  />
                </div>
              )}
            </React.Fragment>
          )
        })
      })}
    </div>
  )
  
  if (mobile) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {board}
      </div>
    )
  }
  
  return board
}
