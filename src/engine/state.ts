import type { Coord } from "./coords"
import type { Route } from "./move"

export type Player = "W" | "B"
export type Phase = "OPENING" | "ACTION" | "REINFORCE" | "SWAP"

export type Token = {
  id: string
  owner: Player
  pos: Coord
  in: "BOARD" | "CAPTIVE" | "VOID"
}

export type LastMove = {
  by: Player
  tokenId: string
  from: Coord
  to: Coord
  moveNumber: number
}

export type GameOver = { winner: Player }

export type GameState = {
  mode: "tournament"

  phase: Phase
  player: Player
  turn: number
  round: number

  tokens: Token[]
  tokenSerial: { W: number; B: number }
  reserves: { W: number; B: number }
  captives: { W: number; B: number }

  voidCount: number
  turnInvades: { W: number; B: number }

  deck: Route[]
  routes: { W: Route[]; B: Route[] }
  queue: Route[]
  usedRoutes: string[]

  openingPlaced: { W: number; B: number }
  reinforcementsToPlace: number
  pendingSwap: { handRouteId: string | null; queueIndex: number | null }

  warning: string | null
  log: string[]

  lastMove: LastMove | null
  gameOver: GameOver | null
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function makeDeck(): Route[] {
  const deck: Route[] = []

  // Existing routes: all directions, distance 1–3
  for (let dir = 1; dir <= 8; dir++) {
    for (let dist = 1; dist <= 3; dist++) {
      deck.push({
        id: `${dir}/${dist}`,
        dir: dir as any,
        dist: dist as any,
      })
    }
  }

  // NEW: orthogonal-only distance 4
  for (let dir = 1; dir <= 8; dir += 2) {
    deck.push({
      id: `${dir}/4`,
      dir: dir as any,
      dist: 4 as any,
    })
  }

  return deck
}

export function newGame(): GameState {
  const deck = makeDeck()
  shuffleInPlace(deck)

  return {
    mode: "tournament",

    phase: "OPENING",
    player: "B",
    turn: 1,
    round: 0,

    tokens: [],
    tokenSerial: { W: 0, B: 0 },
    reserves: { W: 18, B: 18 },
    captives: { W: 0, B: 0 },

    voidCount: 0,
    turnInvades: { W: 0, B: 0 },

    deck,
    routes: { W: [], B: [] },
    queue: [],
    usedRoutes: [],

    openingPlaced: { W: 0, B: 0 },

    reinforcementsToPlace: 0,

    pendingSwap: { handRouteId: null, queueIndex: null },

    warning: null,
    log: [],

    lastMove: null,

    gameOver: null,
  }
}

