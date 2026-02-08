import React from "react"
import { SIZE } from "./engine/coords"
import type { Player, Token } from "./engine/state"

interface GridBoardProps {
  boardMap: Map<string, Token>
  selectedTokenId: string | null
  ghost: {
    by: Player
    from: { x: number; y: number }
    tokenId: string
    born: number
  } | null
  started: boolean
  phase: string
  onSquareClick: (x: number, y: number) => void
  GHOST_MS: number
  mobile?: boolean
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
                backgroundColor: isSelected ? "#1f2937" : "#6b7280",
                borderRadius: cellBorderRadius,
                boxShadow: isSelected
                  ? `0 0 0 ${mobile ? "2px" : "3px"} #5de8f7`
                  : "0 2px 4px rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor:
                  started && (phase === "OPENING" || Boolean(t))
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
                        className={`token-${ghost.by === "B" ? "teal" : "white"} token-ghost`}
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

              {t && (
                <div
                  className={`token-${t.owner === "B" ? "teal" : "white"}`}
                  style={{
                    width: tokenSize,
                    height: tokenSize,
                    borderRadius: "50%",
                    position: "relative",
                  }}
                />
              )}
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
