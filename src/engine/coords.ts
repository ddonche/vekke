export const SIZE = 6
export const FILES = ["A","B","C","D","E","F"]

export type Coord = { x: number; y: number }

export function wrap(n: number): number {
  return ((n % SIZE) + SIZE) % SIZE
}

export function toSq(c: Coord): string {
  return `${FILES[c.x]}${c.y + 1}`
}

export function fromSq(sq: string): Coord {
  const file = sq[0]
  const rank = Number(sq.slice(1))
  return {
    x: FILES.indexOf(file),
    y: rank - 1,
  }
}
