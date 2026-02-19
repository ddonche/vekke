import type { GameState, Player, Token } from "./state"
import type { TimeControlId, TimeControl } from "./ui_controller"

// ---------- helpers ----------
function sq(x: number, y: number) {
  // coords are 0..5? map to A1..F6 (confirm your coord conventions)
  const file = String.fromCharCode("A".charCodeAt(0) + x)
  const rank = (y + 1).toString()
  return `${file}${rank}`
}

function tokenKey(t: Token): string {
  // engine has ids; we use them internally only
  return t.id
}

type Loc = string // "A1" | "RESERVE" | "CAPTIVE" | "VOID" | "HAND" | "QUEUE" | "DECK"

function tokenLoc(t: Token): Loc {
  if (t.in === "BOARD") return sq(t.pos.x, t.pos.y)
  return t.in // "RESERVE" | "CAPTIVE" | "VOID"
}

function fmtRoute(dir: number, dist: number) {
  return `${dir}/${dist}`
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

    // optional round marker at start (ties later lines)
    this.lines.push(this.mkLine(0, `ROUND|n=1`))
  }

  private nowT(perfNow: number): number {
    return Math.max(0, Math.round(perfNow - this.gameStartPerfMs))
  }

  private mkLine(t: number, body: string) {
    // dt is optional; include it for readability if you want.
    // We'll include dt for non-META lines except the first.
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

    // increment "round" every time turn changes? (turn-based marker)
    // If you want "round" to mean both players completed a turn, adjust here.
    this.roundN += 1
    this.lines.push(this.mkLine(t, `ROUND|n=${this.roundN}`))
    this.lastTurnPlayer = nextPlayer
  }

  // Core: diff previous and next state and emit VGN transfers
  captureDiff(perfNow: number, prev: GameState, next: GameState, lastPlayedRoute?: { by: Player; routeId: string } | null) {
    const t = this.nowT(perfNow)

    // ---- TOKENS: per-token diff (using ids internally) ----
    const prevById = new Map<string, Token>()
    for (const tok of prev.tokens) prevById.set(tokenKey(tok), tok)

    // Count token moves by (p, from, to)
    const tokenMoves = new Map<string, number>() // key => count
    const bump = (p: Player, from: Loc, to: Loc, n: number) => {
      const k = `${p}|${from}|${to}`
      tokenMoves.set(k, (tokenMoves.get(k) ?? 0) + n)
    }

    for (const tok of next.tokens) {
      const old = prevById.get(tokenKey(tok))
      if (!old) continue
      const from = tokenLoc(old)
      const to = tokenLoc(tok)
      if (from === to) continue
      bump(tok.owner, from, to, 1)
    }

    // Emit token transfers:
    // - BOARD placements: from=RESERVE to=A3
    // - Captures: from=E5 to=CAPTIVE (p is capturer per your spec, NOT the captured owner)
    //   For captures we need capturer, which is NOT tok.owner (captured owner).
    //   We’ll handle captures via next.lastMove and board removals instead of token owner moves.

    // First: placements/moves for the moving player using lastMove + lastPlayedRoute
    // Use lastMove if present and changed.
    const lmPrev = (prev as any).lastMove
    const lmNext = (next as any).lastMove

    const lastMoveChanged =
      lmNext && (!lmPrev || lmPrev.moveNumber !== lmNext.moveNumber)

    if (lastMoveChanged) {
      const by: Player = lmNext.by
      const fromSq = sq(lmNext.from.x, lmNext.from.y)
      const toSq = sq(lmNext.to.x, lmNext.to.y)

      // route string: derive from routeId if provided
      let routeStr: string | null = null
      if (lastPlayedRoute && lastPlayedRoute.by === by) {
        const r = next.routes[by].find((rr: any) => rr.id === lastPlayedRoute.routeId) // might be missing if it was consumed
        // fallback: search prev hand too
        const r2 =
          r ??
          prev.routes[by].find((rr: any) => rr.id === lastPlayedRoute.routeId) ??
          null
        if (r2) routeStr = fmtRoute(r2.dir, r2.dist)
      }

      if (routeStr) {
        this.lines.push(this.mkLine(t, `p=${by}|from=${fromSq}|route=${routeStr}|to=${toSq}`))
      } else {
        // If routeStr missing, still log the move (but this is a red flag to fix route lookup)
        this.lines.push(this.mkLine(t, `p=${by}|from=${fromSq}|to=${toSq}`))
      }

      // capture: if a token was captured this move, it should now be in CAPTIVE and lmNext.tokenId exists
      // Your controller uses lm.tokenId, so we can locate the capture square by lmNext.to.
      // Per spec: p is capturer, from is capture square, to=CAPTIVE
      const capturedTokenId = lmNext.tokenId as string | undefined
      if (capturedTokenId) {
        const capSq = toSq
        // We only emit capture if we can verify a board token disappeared at that square OR a token moved to CAPTIVE.
        // (This keeps it factual.)
        // Simple check: total captives increased for capturer.
        const capCountPrev = prev.captives[by] ?? 0
        const capCountNext = next.captives[by] ?? 0
        if (capCountNext > capCountPrev) {
          this.lines.push(this.mkLine(t, `p=${by}|from=${capSq}|to=CAPTIVE`))
        }
      }
    }

    // ---- YIELD: tokens moved to VOID from RESERVE/CAPTIVE (aggregate) ----
    // We can infer yield counts from tokenMoves using token.owner as payer (matches your spec p=...).
    // Note: VOID is global; yield lines must include from=... and to=VOID and yield=n.
    for (const [k, n] of tokenMoves.entries()) {
      const [p, from, to] = k.split("|") as [Player, Loc, Loc]
      if (to !== "VOID") continue
      if (from !== "RESERVE" && from !== "CAPTIVE") continue
      this.lines.push(this.mkLine(t, `p=${p}|from=${from}|to=VOID|yield=${n}`))
    }

    // ---- RANSOM: pay 2 captives to recover 1 from void ----
    for (const p of ["W", "B"] as Player[]) {
      const captivesDelta = (next.captives[p] ?? 0) - (prev.captives[p] ?? 0)
      const voidDelta = (next.void[p] ?? 0) - (prev.void[p] ?? 0)
      const reservesDelta = (next.reserves[p] ?? 0) - (prev.reserves[p] ?? 0)

      // Ransom pattern: exactly -2 captives, -1 void, +1 reserves
      if (captivesDelta === -2 && voidDelta === -1 && reservesDelta === 1) {
        // Express as transfers: 2 captives consumed, 1 recovered from void
        this.lines.push(this.mkLine(t, `p=${p}|from=CAPTIVE|to=VOID|ransom=2`))
        this.lines.push(this.mkLine(t, `p=${p}|from=VOID|to=RESERVE|ransomed=1`))
      }
    }

    // ---- ROUTES: diff hand/queue/deck ----
    // This assumes your state has:
    // - next.routes[Player] as HAND (array of route objects {id,dir,dist})
    // - next.queue as QUEUE (array)
    // - next.deck as DECK (array)
    // If those names differ, we’ll adjust, but this is the correct mechanism.

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
        // items in a not in b (a - b)
        const out: string[] = []
        for (const [id, cnt] of a) {
          const left = cnt - (b.get(id) ?? 0)
          for (let i = 0; i < left; i++) out.push(id)
        }
        return out
      }

      // helper to lookup route by id from any pool
      const lookup = (id: string) => {
        const all = [...prevHandW, ...prevHandB, ...nextHandW, ...nextHandB, ...prevQueue, ...nextQueue, ...prevDeck, ...nextDeck]
        return all.find((r) => r.id === id) ?? null
      }

      const prevHW = multiset(prevHandW), nextHW = multiset(nextHandW)
      const prevHB = multiset(prevHandB), nextHB = multiset(nextHandB)
      const prevQ = multiset(prevQueue), nextQ = multiset(nextQueue)
      const prevD = multiset(prevDeck), nextD = multiset(nextDeck)

      // QUEUE -> HAND (player-scoped)
      // detect: removed from queue and added to a hand
      const qRemoved = diffOut(prevQ, nextQ)
      const wAdded = diffOut(nextHW, prevHW)
      const bAdded = diffOut(nextHB, prevHB)

      // naive pairing: assume 1:1 in normal operations
      for (const id of wAdded) {
        if (!qRemoved.includes(id)) continue
        const r = lookup(id)
        if (!r) continue
        this.lines.push(this.mkLine(t, `p=W|route=${fmtRoute(r.dir, r.dist)}|from=QUEUE|to=HAND`))
      }
      for (const id of bAdded) {
        if (!qRemoved.includes(id)) continue
        const r = lookup(id)
        if (!r) continue
        this.lines.push(this.mkLine(t, `p=B|route=${fmtRoute(r.dir, r.dist)}|from=QUEUE|to=HAND`))
      }

      // HAND -> DECK (player-scoped)
      const wRemoved = diffOut(prevHW, nextHW)
      const bRemoved = diffOut(prevHB, nextHB)
      const dAdded = diffOut(nextD, prevD)

      for (const id of wRemoved) {
        if (!dAdded.includes(id)) continue
        const r = lookup(id)
        if (!r) continue
        this.lines.push(this.mkLine(t, `p=W|route=${fmtRoute(r.dir, r.dist)}|from=HAND|to=DECK`))
      }
      for (const id of bRemoved) {
        if (!dAdded.includes(id)) continue
        const r = lookup(id)
        if (!r) continue
        this.lines.push(this.mkLine(t, `p=B|route=${fmtRoute(r.dir, r.dist)}|from=HAND|to=DECK`))
      }

      // DECK -> QUEUE refill (global, no p)
      const dRemoved = diffOut(prevD, nextD)
      const qAdded = diffOut(nextQ, prevQ)
      for (const id of qAdded) {
        if (!dRemoved.includes(id)) continue
        const r = lookup(id)
        if (!r) continue
        this.lines.push(this.mkLine(t, `route=${fmtRoute(r.dir, r.dist)}|from=DECK|to=QUEUE`))
      }
    }

    emitRouteTransfers()
  }

  end(perfNow: number, winner: Player, reason: string) {
    const t = this.nowT(perfNow)
    const loser: Player = winner === "W" ? "B" : "W"

    // Map engine reason -> VGN terminal type
    const type =
      reason === "resignation" ? "RESIGN" :
      reason === "timeout" ? "TIMEOUT" :
      reason === "siegemate" ? "SIEGEMATE" :
      "ELIMINATION"

    // Per your spec: TIMEOUT is recorded as LOSS, not WIN.
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
