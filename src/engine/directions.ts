export type Direction = 1|2|3|4|5|6|7|8

export const DIR: Record<Direction, { dx: number; dy: number }> = {
  1: { dx:  0, dy:  1 }, // N
  2: { dx:  1, dy:  1 }, // NE
  3: { dx:  1, dy:  0 }, // E
  4: { dx:  1, dy: -1 }, // SE
  5: { dx:  0, dy: -1 }, // S
  6: { dx: -1, dy: -1 }, // SW
  7: { dx: -1, dy:  0 }, // W
  8: { dx: -1, dy:  1 }, // NW
}
