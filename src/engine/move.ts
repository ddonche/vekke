import { Coord, SIZE } from "./coords"
import { DIR, Direction } from "./directions"

export type Route = {
  dir: Direction
  dist: number
  id: string
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE
}

/**
 * One "Vekke flanking" step.
 * If the naive step leaves the board, wrap to the opposite ENDPOINT of the
 * same row/col/diagonal line segment (not a torus).
 */
export function stepFlank(pos: Coord, dir: Direction): Coord {
  const { dx, dy } = DIR[dir]
  const nx = pos.x + dx
  const ny = pos.y + dy

  // Normal in-bounds step
  if (inBounds(nx, ny)) return { x: nx, y: ny }

  const x = pos.x
  const y = pos.y

  // Horizontal
  if (dy === 0) {
    // leaving left -> wrap to right endpoint; leaving right -> wrap to left endpoint
    if (nx < 0) return { x: SIZE - 1, y }
    if (nx >= SIZE) return { x: 0, y }
  }

  // Vertical
  if (dx === 0) {
    // leaving bottom -> wrap to top endpoint; leaving top -> wrap to bottom endpoint
    if (ny < 0) return { x, y: SIZE - 1 }
    if (ny >= SIZE) return { x, y: 0 }
  }

  // Diagonal: NE / SW (dx and dy same sign) => constant d = x - y
  if (dx === dy) {
    const d = x - y

    // valid x range where y = x - d is in bounds
    const minX = Math.max(0, d)
    const maxX = Math.min(SIZE - 1, (SIZE - 1) + d)

    const endA = { x: minX, y: minX - d }
    const endB = { x: maxX, y: maxX - d }

    // NE moves toward increasing x; SW toward decreasing x
    if (dx === 1) return endA // stepping off NE side => wrap to opposite endpoint
    else return endB          // stepping off SW side => wrap to opposite endpoint
  }

  // Diagonal: NW / SE (dx and dy opposite sign) => constant s = x + y
  const s = x + y

  // valid x range where y = s - x is in bounds
  const minX = Math.max(0, s - (SIZE - 1))
  const maxX = Math.min(SIZE - 1, s)

  const endA = { x: minX, y: s - minX }
  const endB = { x: maxX, y: s - maxX }

  // SE moves toward increasing x; NW toward decreasing x
  if (dx === 1) return endA // stepping off SE side => wrap to opposite endpoint
  else return endB          // stepping off NW side => wrap to opposite endpoint
}

export function moveByRoute(pos: Coord, route: Route): Coord {
  let cur = pos
  for (let i = 0; i < route.dist; i++) {
    cur = stepFlank(cur, route.dir)
  }
  return cur
}

export function traceByRoute(pos: Coord, route: Route): Coord[] {
  const out: Coord[] = []
  let cur = pos
  for (let i = 0; i < route.dist; i++) {
    cur = stepFlank(cur, route.dir)
    out.push(cur)
  }
  return out
}
