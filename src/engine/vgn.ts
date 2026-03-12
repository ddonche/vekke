import type { GameState, Player, Token } from "./state"
import type { TimeControlId } from "./ui_controller"

// ---------- helpers ----------
function sq(x: number, y: number) {
  const file = String.fromCharCode("A".charCodeAt(0) + x)
  const rank = (y + 1).toString()
  return `${file}${rank}`
}

function tokenKey(t: Token): string {
  return t.id
}

type Loc = string // "A1" | "RESERVE" | "CAPTIVE" | "VOID" | "HAND" | "QUEUE" | "DECK"

function tokenLoc(t: Token): Loc {
  if (t.in === "BOARD") return sq(t.pos.x, t.pos.y)
  return t.in
}

function fmtRoute(dir: number, dist: number) {
  return `${dir}/${dist}`
}

function isSquare(v: string): boolean {
  return /^[A-F][1-6]$/.test(v)
}

function other(p: Player): Player {
  return p === "W" ? "B" : "W"
}

function inc<K extends string>(obj: Record<K, number>, key: K, n = 1) {
  obj[key] = (obj[key] ?? 0) + n
}

function takeOne(arr: string[], value: string): boolean {
  const idx = arr.indexOf(value)
  if (idx === -1) return false
  arr.splice(idx, 1)
  return true
}

// ---------- VGN Recorder ----------
export class VgnRecorder {
  private lines: string[] = []
  private gameStartPerfMs: number
  private lastNonMetaT = 0

  private roundN = 1
  private lastTurnPlayer: Player | null = null

  constructor(args: {
    gameId: string
    ruleset: string
    version?: number
    whiteId: string
    blueId: string
    tokensW: number
    tokensB: number
    tc: { id: TimeControlId; baseMs: number; incMs: number }
    gameStartPerfMs: number
  }) {
    this.gameStartPerfMs = args.gameStartPerfMs

    const v = args.version ?? 1
    this.lines.push(`META|GAME|id=${args.gameId}|ruleset=${args.ruleset}|version=${v}`)
    this.lines.push(`META|PLAYERS|W=${args.whiteId}|B=${args.blueId}`)
    this.lines.push(`META|TOKENS|W=${args.tokensW}|B=${args.tokensB}`)
    this.lines.push(`META|TC|mode=${args.tc.id}|base=${args.tc.baseMs}|inc=${args.tc.incMs}`)
    this.lines.push(this.mkLine(0, `ROUND|n=1`))
  }

  private nowT(perfNow: number): number {
    return Math.max(0, Math.round(perfNow - this.gameStartPerfMs))
  }

  private mkLine(t: number, body: string) {
    const dt = this.lastNonMetaT === 0 ? null : Math.max(0, t - this.lastNonMetaT)
    this.lastNonMetaT = t
    return dt != null ? `t=${t}|dt=${dt}|${body}` : `t=${t}|${body}`
  }

  note(perfNow: number, text: string) {
    const t = this.nowT(perfNow)
    const safe = text.replace(/"/g, '\\"')
    this.lines.push(this.mkLine(t, `NOTE|text="${safe}"`))
  }

  onTurnChange(perfNow: number, nextPlayer: Player) {
    const t = this.nowT(perfNow)

    if (this.lastTurnPlayer == null) {
      this.lastTurnPlayer = nextPlayer
      return
    }
    if (this.lastTurnPlayer === nextPlayer) return

    this.roundN += 1
    this.lines.push(this.mkLine(t, `ROUND|n=${this.roundN}`))
    this.lastTurnPlayer = nextPlayer
  }

  // Pure state-transition ledger:
  // emit only factual transfers of tokens and routes.
  captureDiff(
    perfNow: number,
    prev: GameState,
    next: GameState,
    lastPlayedRoute?: { by: Player; routeId: string } | null
  ) {
    const t = this.nowT(perfNow)

    const prevById = new Map<string, Token>()
    const nextById = new Map<string, Token>()
    for (const tok of prev.tokens) prevById.set(tokenKey(tok), tok)
    for (const tok of next.tokens) nextById.set(tokenKey(tok), tok)

    const reserveToBoardCount: Record<Player, number> = { W: 0, B: 0 }
    const boardToReserveCount: Record<Player, number> = { W: 0, B: 0 }
    const boardCaptureCount: Record<Player, number> = { W: 0, B: 0 }

    const lmPrev = (prev as any).lastMove
    const lmNext = (next as any).lastMove
    const lastMoveChanged =
      lmNext && (!lmPrev || lmPrev.moveNumber !== lmNext.moveNumber)

    const routeById = (by: Player, routeId: string) => {
      return (
        next.routes?.[by]?.find((rr: any) => rr.id === routeId) ??
        prev.routes?.[by]?.find((rr: any) => rr.id === routeId) ??
        null
      )
    }

    // ---- TOKEN TRANSFERS ----

    // 1) Existing or newly created tokens in next
    for (const tok of next.tokens) {
      const id = tokenKey(tok)
      const old = prevById.get(id)

      // Newly created board token => RESERVE -> BOARD
      if (!old) {
        if (tok.in === "BOARD") {
          const to = tokenLoc(tok)
          this.lines.push(this.mkLine(t, `p=${tok.owner}|from=RESERVE|to=${to}`))
          inc(reserveToBoardCount, tok.owner)
        }
        continue
      }

      const oldIn = old.in
      const newIn = tok.in

      if (oldIn === "BOARD" && newIn === "BOARD") {
        const from = sq(old.pos.x, old.pos.y)
        const to = sq(tok.pos.x, tok.pos.y)
        if (from !== to) {
          let routeStr: string | null = null
          if (
            lastMoveChanged &&
            lmNext?.tokenId === tok.id &&
            lastPlayedRoute &&
            lastPlayedRoute.by === lmNext.by
          ) {
            const r = routeById(lastPlayedRoute.by, lastPlayedRoute.routeId)
            if (r) routeStr = fmtRoute(r.dir, r.dist)
          }

          if (routeStr) {
            this.lines.push(this.mkLine(t, `p=${tok.owner}|from=${from}|route=${routeStr}|to=${to}`))
          } else {
            this.lines.push(this.mkLine(t, `p=${tok.owner}|from=${from}|to=${to}`))
          }
        }
        continue
      }

      if (oldIn === "RESERVE" && newIn === "BOARD") {
        const to = tokenLoc(tok)
        this.lines.push(this.mkLine(t, `p=${tok.owner}|from=RESERVE|to=${to}`))
        inc(reserveToBoardCount, tok.owner)
        continue
      }

      if (oldIn === "BOARD" && newIn === "CAPTIVE") {
        const from = sq(old.pos.x, old.pos.y)
        const capturer = other(tok.owner)
        this.lines.push(this.mkLine(t, `p=${capturer}|from=${from}|to=CAPTIVE`))
        inc(boardCaptureCount, capturer)
        continue
      }

      if (oldIn === "BOARD" && newIn === "VOID") {
        const from = sq(old.pos.x, old.pos.y)
        this.lines.push(this.mkLine(t, `p=${tok.owner}|from=${from}|to=VOID`))
        continue
      }

      if (oldIn === "BOARD" && newIn === "RESERVE") {
        const from = sq(old.pos.x, old.pos.y)
        this.lines.push(this.mkLine(t, `p=${tok.owner}|from=${from}|to=RESERVE`))
        inc(boardToReserveCount, tok.owner)
        continue
      }
    }

    // 2) Tokens removed entirely from state
    // Current engine does this for mulligan: BOARD token disappears and reserves increase.
    for (const tok of prev.tokens) {
      const id = tokenKey(tok)
      if (nextById.has(id)) continue

      if (tok.in === "BOARD") {
        const from = sq(tok.pos.x, tok.pos.y)
        this.lines.push(this.mkLine(t, `p=${tok.owner}|from=${from}|to=RESERVE`))
        inc(boardToReserveCount, tok.owner)
      }
    }

    // ---- OFF-BOARD COUNT TRANSFERS ----
    // Pure deltas only. No game semantics.
    for (const p of ["W", "B"] as Player[]) {
      const prevReserve = prev.reserves[p] ?? 0
      const nextReserve = next.reserves[p] ?? 0

      const prevCaptive = prev.captives[p] ?? 0
      const nextCaptive = next.captives[p] ?? 0

      const prevVoid = prev.void[p] ?? 0
      const nextVoid = next.void[p] ?? 0

      // RESERVE -> VOID
      // Subtract placements because those are already emitted as RESERVE -> BOARD.
      const reserveSpentToVoid =
        Math.max(0, prevReserve - nextReserve - reserveToBoardCount[p])
      if (reserveSpentToVoid > 0) {
        this.lines.push(this.mkLine(t, `p=${p}|from=RESERVE|to=VOID|yield=${reserveSpentToVoid}`))
      }

      // VOID -> RESERVE
      // Subtract BOARD -> RESERVE because those are already emitted separately.
      const reserveGainedFromVoid =
        Math.max(0, nextReserve - prevReserve - boardToReserveCount[p])
      if (reserveGainedFromVoid > 0) {
        this.lines.push(this.mkLine(t, `p=${p}|from=VOID|to=RESERVE|count=${reserveGainedFromVoid}`))
      }

      // CAPTIVE -> VOID
      const captiveSpentToVoid = Math.max(0, prevCaptive - nextCaptive)
      if (captiveSpentToVoid > 0) {
        this.lines.push(this.mkLine(t, `p=${p}|from=CAPTIVE|to=VOID|yield=${captiveSpentToVoid}`))
      }

      // VOID -> CAPTIVE
      // Subtract BOARD -> CAPTIVE because capture lines are already emitted.
      const captiveGainedFromVoid =
        Math.max(0, nextCaptive - prevCaptive - boardCaptureCount[p])
      if (captiveGainedFromVoid > 0) {
        this.lines.push(this.mkLine(t, `p=${p}|from=VOID|to=CAPTIVE|count=${captiveGainedFromVoid}`))
      }
    }

    // ---- ROUTE TRANSFERS ----
    const emitRouteTransfers = () => {
      const prevHandW = (prev.routes?.W ?? []) as any[]
      const prevHandB = (prev.routes?.B ?? []) as any[]
      const nextHandW = (next.routes?.W ?? []) as any[]
      const nextHandB = (next.routes?.B ?? []) as any[]

      const prevQueue = ((prev as any).queue ?? []) as any[]
      const nextQueue = ((next as any).queue ?? []) as any[]

      const prevDeck = ((prev as any).deck ?? []) as any[]
      const nextDeck = ((next as any).deck ?? []) as any[]

      const multiset = (arr: any[]) => {
        const m = new Map<string, number>()
        for (const r of arr) m.set(r.id, (m.get(r.id) ?? 0) + 1)
        return m
      }

      const diffOut = (a: Map<string, number>, b: Map<string, number>) => {
        const out: string[] = []
        for (const [id, cnt] of a) {
          const left = cnt - (b.get(id) ?? 0)
          for (let i = 0; i < left; i++) out.push(id)
        }
        return out
      }

      const lookup = (id: string) => {
        const all = [
          ...prevHandW, ...prevHandB,
          ...nextHandW, ...nextHandB,
          ...prevQueue, ...nextQueue,
          ...prevDeck, ...nextDeck,
        ]
        return all.find((r) => r.id === id) ?? null
      }

      const prevHW = multiset(prevHandW), nextHW = multiset(nextHandW)
      const prevHB = multiset(prevHandB), nextHB = multiset(nextHandB)
      const prevQ = multiset(prevQueue), nextQ = multiset(nextQueue)
      const prevD = multiset(prevDeck), nextD = multiset(nextDeck)

      const qRemoved = diffOut(prevQ, nextQ)
      const qAdded = diffOut(nextQ, prevQ)
      const dRemoved = diffOut(prevD, nextD)
      const dAdded = diffOut(nextD, prevD)
      const wAdded = diffOut(nextHW, prevHW)
      const bAdded = diffOut(nextHB, prevHB)
      const wRemoved = diffOut(prevHW, nextHW)
      const bRemoved = diffOut(prevHB, nextHB)

      // HAND additions: QUEUE -> HAND or DECK -> HAND
      for (const id of wAdded) {
        const r = lookup(id)
        if (!r) continue
        if (takeOne(qRemoved, id)) {
          this.lines.push(this.mkLine(t, `p=W|route=${fmtRoute(r.dir, r.dist)}|from=QUEUE|to=HAND`))
        } else if (takeOne(dRemoved, id)) {
          this.lines.push(this.mkLine(t, `p=W|route=${fmtRoute(r.dir, r.dist)}|from=DECK|to=HAND`))
        }
      }

      for (const id of bAdded) {
        const r = lookup(id)
        if (!r) continue
        if (takeOne(qRemoved, id)) {
          this.lines.push(this.mkLine(t, `p=B|route=${fmtRoute(r.dir, r.dist)}|from=QUEUE|to=HAND`))
        } else if (takeOne(dRemoved, id)) {
          this.lines.push(this.mkLine(t, `p=B|route=${fmtRoute(r.dir, r.dist)}|from=DECK|to=HAND`))
        }
      }

      // HAND removals: HAND -> DECK
      for (const id of wRemoved) {
        const r = lookup(id)
        if (!r) continue
        if (takeOne(dAdded, id)) {
          this.lines.push(this.mkLine(t, `p=W|route=${fmtRoute(r.dir, r.dist)}|from=HAND|to=DECK`))
        }
      }

      for (const id of bRemoved) {
        const r = lookup(id)
        if (!r) continue
        if (takeOne(dAdded, id)) {
          this.lines.push(this.mkLine(t, `p=B|route=${fmtRoute(r.dir, r.dist)}|from=HAND|to=DECK`))
        }
      }

      // DECK -> QUEUE refill
      for (const id of [...qAdded]) {
        const r = lookup(id)
        if (!r) continue
        if (takeOne(dRemoved, id)) {
          this.lines.push(this.mkLine(t, `route=${fmtRoute(r.dir, r.dist)}|from=DECK|to=QUEUE`))
        }
      }
    }

    emitRouteTransfers()
  }

  end(perfNow: number, winner: Player, reason: string) {
    const t = this.nowT(perfNow)
    const loser: Player = winner === "W" ? "B" : "W"

    const type =
      reason === "resignation"
        ? "RESIGN"
        : reason === "timeout"
          ? "TIMEOUT"
          : reason === "siegemate"
            ? "SIEGEMATE"
            : reason === "collapse"
              ? "COLLAPSE"
              : "ELIMINATION"

    const tag = type === "TIMEOUT" ? "LOSS" : "WIN"

    this.lines.push(this.mkLine(t, `${tag}|type=${type}|winner=${winner}|loser=${loser}`))
  }

  toString() {
    return this.lines.join("\n")
  }

  toLines() {
    return [...this.lines]
  }
}