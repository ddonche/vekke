import React from "react"
import { SIZE } from "./engine/coords"
import type { Player, Token } from "./engine/state"
import type { Direction } from "./engine/directions"
import { DIR } from "./engine/directions"

interface GridBoardProps {
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
  tokenClass?: (side: "W" | "B") => string
}

export function GridBoard({
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
  tokenClass = (side: "W" | "B") => side === "W" ? "token-w-skin" : "token-b-skin",
}: GridBoardProps) {
  // Mobile: use same fixed sizing as IntersectionBoard
  // cellSize 58px spacing = 56px cell + 2px gap
  // padding 6px so first token center is at 6+28=34px (matches intersection padding 34px)
  const gridSize = mobile ? "56px" : "90px"
  const cellPadding = mobile ? "6px" : "16px"
  const cellGap = mobile ? "2px" : "5px"
  const cellBorderRadius = mobile ? "0.5rem" : "14px"
  const tokenSize = mobile ? "42px" : "70px"
  const notationSize = mobile ? "7px" : "10px"
  const notationTop = mobile ? "2px" : "4px"
  const notationLeft = mobile ? "3px" : "6px"
  
  // Calculate total board size for mobile
  const boardWidth = mobile ? (56 * 6 + 2 * 5 + 6 * 2) : undefined

  const board = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(6, ${gridSize})`,
        gridTemplateRows: `repeat(6, ${gridSize})`,
        gap: cellGap,
        padding: cellPadding,
        backgroundColor: "#4b5563",
        borderRadius: mobile ? "12px" : "20px",
        boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
        ...(mobile ? { width: boardWidth, height: boardWidth } : {}),
      }}
    >
      {Array.from({ length: SIZE }, (_, ry) => {
        const y = SIZE - 1 - ry
        return Array.from({ length: SIZE }, (_, x) => {
          const key = `${x},${y}`
          const t = boardMap.get(key)
          const isSelected = t && t.id === selectedTokenId
          const isEvasionSource = evasionSourcePos && x === evasionSourcePos.x && y === evasionSourcePos.y
          const isEvasionDest = evasionDestPos && x === evasionDestPos.x && y === evasionDestPos.y

          const col = String.fromCharCode(65 + x)
          const row = y + 1
          const notation = `${col}${row}`

          return (
            <div
              key={key}
              onClick={() => started && onSquareClick(x, y)}
              style={{
                width: mobile ? 56 : 90,
                height: mobile ? 56 : 90,
                backgroundColor: isSelected || isEvasionSource ? "#1f2937" : "#6b7280",
                borderRadius: cellBorderRadius,
                boxShadow: isSelected || isEvasionSource
                  ? `0 0 0 ${mobile ? "2px" : "3px"} #5de8f7`
                  : isEvasionDest
                    ? `0 0 0 ${mobile ? "2px" : "3px"} #a78bfa`
                    : "0 2px 4px rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor:
                  started && (phase === "OPENING" || Boolean(t) || evasionSourcePos != null)
                    ? "pointer"
                    : "default",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: notationTop,
                  left: notationLeft,
                  fontSize: notationSize,
                  fontWeight: mobile ? "bold" : 900,
                  color: "#9ca3af",
                  opacity: mobile ? 0.55 : 0.75,
                }}
              >
                {notation}
              </div>

              {/* Evasion source ghost - faded token showing where captured token was (only when no token there) */}
              {isEvasionSource && !t && evasionPlayer && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    className={tokenClass(evasionPlayer)}
                    style={{ width: tokenSize, height: tokenSize, borderRadius: "50%", opacity: 0.35 }}
                  />
                </div>
              )}

              {/* Evasion destination ghost - purple tint shows where token will land */}
              {isEvasionDest && evasionPlayer && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    className={tokenClass(evasionPlayer)}
                    style={{
                      width: tokenSize,
                      height: tokenSize,
                      borderRadius: "50%",
                      opacity: 0.55,
                      outline: `${mobile ? "2px" : "3px"} solid #a78bfa`,
                      outlineOffset: "2px",
                    }}
                  />
                </div>
              )}

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
                const cellSize = mobile ? 58 : 95
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
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      pointerEvents: "none",
                      transform: `translate(${currentX}px, ${currentY}px)`,
                    }}
                  >
                    <div
                      className={`${tokenClass(ghost.by)} token-ghost`}
                      style={{
                        width: tokenSize,
                        height: tokenSize,
                        borderRadius: "50%",
                        position: "relative",
                        opacity: 0.4 * alpha,
                      }}
                    />
                  </div>
                )
              })()}

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
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        className={`${tokenClass(ghost.by)} token-ghost`}
                        style={{
                          width: tokenSize,
                          height: tokenSize,
                          borderRadius: "50%",
                          position: "relative",
                          opacity: 0.4 * alpha,
                        }}
                      />
                    </div>
                  )
                })()}

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
                  const nx = x + dx
                  const ny = y + dy
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
                  <div style={{ position: "relative", width: tokenSize, height: tokenSize }}>
                    {/* Token circle */}
                    <div
                      className={tokenClass(t.owner as "W" | "B")}
                      style={{
                        width: tokenSize,
                        height: tokenSize,
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
                          border: `${mobile ? "2px" : "2px"} dashed #ee484c`,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                )
              })()}
            </div>
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
