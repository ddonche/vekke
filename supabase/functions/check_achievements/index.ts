import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = "W" | "B"

interface GameStats {
  sieges:     { W: number; B: number }
  drafts:     { W: number; B: number }
  captures:   { W: number; B: number }
  invades:    { W: number; B: number }
  defections: { W: number; B: number }
}

interface GameState {
  stats:    GameStats
  log:      string[]
  void:     { W: number; B: number }
  reserves: { W: number; B: number }
  gameOver: { winner: Player; reason: string } | null
}

interface ChainCounts {
  chain2: number
  chain3: number
  chain4: number
  chain5: number
}

interface PerGameStats {
  sieges:               number
  invades:              number
  drafts:               number
  defections:           number
  ransoms:              number
  recoils:              number
  earlySwaps:           number
  mulligans:            number
  extraReinforcements:  number
  collapseTax:          number
  chains:               ChainCounts
}

// ─── Constants ────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Must match finalize_game exactly
const AI_IDS = new Set<string>([
  "d90c1ec7-a586-4594-85ad-702beca6af45", // Glen       (novice)
  "9d6503a7-1b18-46d4-878d-09367d6ac833", // Priya      (adept)
  "69174323-2b15-4b83-b1d7-96a324bce0a4", // Vladimir   (expert)
  "bb5802a3-1f76-43f8-9bf3-2ac65d618cfe", // Yui        (master)
  "92c903e8-aa7d-4571-9905-0611b4a07a1d", // Haoran     (senior_master)
  "492a8702-9470-4f43-85e0-d6b44ec5c562", // Chioma     (grandmaster)
])

const AI_BOT_KEY: Record<string, string> = {
  "d90c1ec7-a586-4594-85ad-702beca6af45": "glen",
  "9d6503a7-1b18-46d4-878d-09367d6ac833": "priya",
  "69174323-2b15-4b83-b1d7-96a324bce0a4": "vladimir",
  "bb5802a3-1f76-43f8-9bf3-2ac65d618cfe": "yui",
  "92c903e8-aa7d-4571-9905-0611b4a07a1d": "haoran",
  "492a8702-9470-4f43-85e0-d6b44ec5c562": "chioma",
}

const SUM_FIELDS = [
  "games_played",
  "wins",
  "losses",
  "wins_timeout",
  "wins_resign",
  "wins_collapse",
  "wins_siegemate",
  "wins_elimination",
  "losses_timeout",
  "losses_resign",
  "losses_collapse",
  "losses_siegemate",
  "losses_elimination",
  "mulligans_used",
  "invades_for",
  "invades_against",
  "sieges_for",
  "sieges_against",
  "ransoms_used",
  "defections_used",
  "recoils_used",
  "early_swaps_used",
  "extra_reinforcements_bought",
  "collapse_tax_paid_routes",
  "collapse_forces_events",
  "chains_2",
  "chains_3",
  "chains_4",
  "chains_5",
  "pvp_wins",
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

function eloTier(elo: number): string {
  if (elo < 900)  return "novice"
  if (elo < 1200) return "adept"
  if (elo < 1500) return "expert"
  if (elo < 1750) return "master"
  if (elo < 2000) return "senior_master"
  return "grandmaster"
}

function sumLifetimeRows(rows: Record<string, any>[]): Record<string, number> {
  const out: Record<string, number> = {}

  for (const field of SUM_FIELDS) out[field] = 0
  out.longest_chain = 0
  out.peak_elo = 0

  for (const row of rows) {
    for (const field of SUM_FIELDS) {
      out[field] += Number(row?.[field] ?? 0)
    }
    out.longest_chain = Math.max(out.longest_chain, Number(row?.longest_chain ?? 0))
    out.peak_elo = Math.max(out.peak_elo, Number(row?.peak_elo ?? 0))
  }

  return out
}

// ─── Chain detection ──────────────────────────────────────────────────────────
// A chain is extra actions beyond the minimum 5 per turn (3 moves + 1 reinforce + 1 swap).
// Chain extras: Draft (+1), Extra Reinforce buy (+1), Extra placement (+1),
//               Ransom (+1), Defection (+1). Max chain = 5.
// Turns are delineated by `== ${side} reinforcements: N ==` markers.
// We split the chronological log on those markers and score each human turn segment.

function computeGameChains(log: string[], humanSide: Player): ChainCounts {
  const result: ChainCounts = { chain2: 0, chain3: 0, chain4: 0, chain5: 0 }

  // log is stored newest-first (unshift); reverse to chronological order
  const chronological = [...log].reverse().join("\n")

  const reinforceRe = new RegExp(`== ${humanSide} reinforcements: (\\d+) ==`, "g")

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = reinforceRe.exec(chronological)) !== null) {
    const reinforceCount = parseInt(match[1], 10)
    const segment = chronological.slice(lastIndex, match.index)

    let chain = 0

    // Extra reinforcement purchased (action)
    if (new RegExp(`${humanSide} burned .+ to buy \\+1 reinforcement`).test(segment)) chain++
    // Extra reinforcement placed (placing 2 instead of 1)
    if (reinforceCount >= 2) chain++
    // Ransom (only one allowed per turn, but pattern-safe)
    if (segment.includes(`${humanSide} RANSOM:`)) chain++
    // Defection
    if (segment.includes(`${humanSide} DEFECTION:`)) chain++
    // Draft (3 invades triggered the bonus)
    if (segment.includes(`${humanSide} Draft:`)) chain++

    if (chain >= 2) result.chain2++
    if (chain >= 3) result.chain3++
    if (chain >= 4) result.chain4++
    if (chain >= 5) result.chain5++

    lastIndex = match.index + match[0].length
  }

  return result
}

// ─── Per-game stat extraction ─────────────────────────────────────────────────

function extractPerGameStats(state: GameState, humanSide: Player): PerGameStats {
  const log = state.log ?? []

  const countLog = (re: RegExp): number => log.filter(l => re.test(l)).length

  return {
    sieges:              state.stats?.sieges?.[humanSide]     ?? 0,
    invades:             state.stats?.invades?.[humanSide]    ?? 0,
    drafts:              state.stats?.drafts?.[humanSide]     ?? 0,
    defections:          state.stats?.defections?.[humanSide] ?? 0,
    ransoms:             countLog(new RegExp(`^${humanSide} RANSOM:`)),
    recoils:             countLog(new RegExp(`^${humanSide} RECOIL:`)),
    earlySwaps:          countLog(new RegExp(`^${humanSide} early swap `)),
    mulligans:           countLog(new RegExp(`^${humanSide} mulligan —`)),
    extraReinforcements: countLog(new RegExp(`^${humanSide} burned .+ to buy \\+1 reinforcement`)),
    collapseTax:         countLog(new RegExp(`^${humanSide} has no usable routes; yielded`)),
    chains:              computeGameChains(log, humanSide),
  }
}

// ─── Achievement value resolver ───────────────────────────────────────────────
// Returns the player's current progress value for a given achievement key.

function getValueForKey(
  key: string,
  L: Record<string, number>,       // lifetime totals summed from season rows
  streaks: Record<string, number>, // from player_streaks
  bots: Record<string, number>,    // wins per bot name
  fmtWins: Record<string, number>, // wins per format
  quirky: Record<string, boolean>, // per-game one-off triggers
): number {
  switch (true) {
    // ── Mechanics ──
    case key.startsWith("sieges_"):           return L.sieges_for ?? 0
    case key.startsWith("invades_"):          return L.invades_for ?? 0
    case key.startsWith("ransoms_"):          return L.ransoms_used ?? 0
    case key.startsWith("recoils_"):          return L.recoils_used ?? 0
    case key.startsWith("early_swaps_"):      return L.early_swaps_used ?? 0
    case key.startsWith("mulligans_"):        return L.mulligans_used ?? 0
    case key.startsWith("reinforce_"):        return L.extra_reinforcements_bought ?? 0
    case key.startsWith("collapse_tax_"):     return L.collapse_tax_paid_routes ?? 0
    case key.startsWith("defections_"):       return L.defections_used ?? 0
    // ── Chains ──
    case key.startsWith("chain_2_"):          return L.chains_2 ?? 0
    case key.startsWith("chain_3_"):          return L.chains_3 ?? 0
    case key.startsWith("chain_4_"):          return L.chains_4 ?? 0
    case key.startsWith("chain_5_"):          return L.chains_5 ?? 0
    // ── Outcomes ──
    case key.startsWith("wins_"):             return L.wins ?? 0
    case key.startsWith("siegemate_"):        return L.wins_siegemate ?? 0
    case key.startsWith("elimination_"):      return L.wins_elimination ?? 0
    case key.startsWith("collapse_win_"):     return L.wins_collapse ?? 0
    case key.startsWith("pvp_wins_"):         return L.pvp_wins ?? 0
    case key.startsWith("games_"):            return L.games_played ?? 0
    // ── Elo milestones ──
    case key === "elo_novice":                return (L.peak_elo ?? 0) >= 600  ? 1 : 0
    case key === "elo_adept":                 return (L.peak_elo ?? 0) >= 900  ? 1 : 0
    case key === "elo_expert":                return (L.peak_elo ?? 0) >= 1200 ? 1 : 0
    case key === "elo_master":                return (L.peak_elo ?? 0) >= 1500 ? 1 : 0
    case key === "elo_senior_master":         return (L.peak_elo ?? 0) >= 1750 ? 1 : 0
    case key === "elo_grandmaster":           return (L.peak_elo ?? 0) >= 2000 ? 1 : 0
    // ── Streaks ──
    case key.startsWith("streak_win_"):       return streaks.best_win_streak ?? 0
    case key.startsWith("streak_daily_"):     return streaks.best_daily_streak ?? 0
    // ── AI bots ──
    case key.startsWith("beat_glen_"):        return bots.glen ?? 0
    case key.startsWith("beat_priya_"):       return bots.priya ?? 0
    case key.startsWith("beat_vladimir_"):    return bots.vladimir ?? 0
    case key.startsWith("beat_yui_"):         return bots.yui ?? 0
    case key.startsWith("beat_haoran_"):      return bots.haoran ?? 0
    case key.startsWith("beat_chioma_"):      return bots.chioma ?? 0
    // ── Format ──
    case key.startsWith("blitz_wins_"):       return fmtWins.blitz ?? 0
    case key.startsWith("rapid_wins_"):       return fmtWins.rapid ?? 0
    case key.startsWith("standard_wins_"):    return fmtWins.standard ?? 0
    case key.startsWith("daily_wins_"):       return fmtWins.daily ?? 0
    // ── Quirky ──
    case key.startsWith("quirky_"):           return quirky[key] ? 1 : 0
    default:                                   return 0
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST")    return json(405, { error: "Method not allowed" })

  try {
    const authHeader = req.headers.get("authorization") ?? ""
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(401, { error: "Missing bearer token" })

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
    const ANON        = Deno.env.get("SUPABASE_ANON_KEY")!
    const SRV         = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })
    const callerId = u.user.id

    const body = await req.json()
    if (!body?.gameId) return json(400, { error: "gameId is required" })

    const admin = createClient(SUPABASE_URL, SRV)

    // ── Load game ─────────────────────────────────────────────────────────────

    const { data: game, error: gerr } = await admin
      .from("games")
      .select("id, wake_id, brake_id, winner_id, end_reason, format, is_vs_ai, ai_level, current_state, season_id")
      .eq("id", body.gameId)
      .single()

    if (gerr || !game) return json(404, { error: "Game not found" })

    const wakeId  = String(game.wake_id)
    const brakeId = String(game.brake_id)

    if (callerId !== wakeId && callerId !== brakeId) {
      return json(403, { error: "Not a participant" })
    }

    // ── Identify human player (never run for bots) ────────────────────────────

    const wakeIsAi  = AI_IDS.has(wakeId)
    const brakeIsAi = AI_IDS.has(brakeId)

    let humanId:    string
    let humanSide:  Player
    let opponentId: string

    if (wakeIsAi && !brakeIsAi) {
      humanId    = brakeId
      humanSide  = "B"
      opponentId = wakeId
    } else if (brakeIsAi && !wakeIsAi) {
      humanId    = wakeId
      humanSide  = "W"
      opponentId = brakeId
    } else if (!wakeIsAi && !brakeIsAi) {
      // PvP: each player calls for themselves
      humanId    = callerId
      humanSide  = callerId === wakeId ? "W" : "B"
      opponentId = callerId === wakeId ? brakeId : wakeId
    } else {
      // Both are bots — should never happen
      return json(400, { error: "No human player in this game" })
    }

    // Safety: caller must be the human we are checking
    if (callerId !== humanId) {
      return json(403, { error: "Cannot check achievements for another player" })
    }

    const seasonId  = String(game.season_id ?? "")
    if (!seasonId) return json(500, { error: "games.season_id is missing" })

    const isWinner  = String(game.winner_id) === humanId
    const gameState = game.current_state as GameState
    const now       = new Date().toISOString()

    // ── Extract per-game stats from engine state ──────────────────────────────

    const perGame = extractPerGameStats(gameState, humanSide)

    // ── Update mechanic columns in player_stats_agg (season / all) ───────────
    // finalize_game owns wins/losses/elo; we own the mechanic counters.

    const { data: aggRow } = await admin
      .from("player_stats_agg")
      .select("*")
      .eq("user_id", humanId)
      .eq("scope",   "season")
      .eq("format",  "all")
      .eq("season_id", seasonId)
      .maybeSingle()

    const maxChainThisGame =
      perGame.chains.chain5 > 0 ? 5 :
      perGame.chains.chain4 > 0 ? 4 :
      perGame.chains.chain3 > 0 ? 3 :
      perGame.chains.chain2 > 0 ? 2 : 0

    const { error: aggErr } = await admin.from("player_stats_agg").upsert({
      user_id:                      humanId,
      scope:                        "season",
      season_id:                    seasonId,
      format:                       "all",
      updated_at:                   now,
      // Preserve finalize_game fields (these were already set; upsert merges)
      games_played:                 (aggRow?.games_played ?? 0),
      wins:                         (aggRow?.wins ?? 0),
      losses:                       (aggRow?.losses ?? 0),
      elo:                          aggRow?.elo ?? 1200,
      peak_elo:                     aggRow?.peak_elo ?? 1200,
      // Mechanics (we increment these)
      sieges_for:                   (aggRow?.sieges_for              ?? 0) + perGame.sieges,
      invades_for:                  (aggRow?.invades_for             ?? 0) + perGame.invades,
      ransoms_used:                 (aggRow?.ransoms_used            ?? 0) + perGame.ransoms,
      recoils_used:                 (aggRow?.recoils_used            ?? 0) + perGame.recoils,
      early_swaps_used:             (aggRow?.early_swaps_used        ?? 0) + perGame.earlySwaps,
      mulligans_used:               (aggRow?.mulligans_used          ?? 0) + perGame.mulligans,
      extra_reinforcements_bought:  (aggRow?.extra_reinforcements_bought ?? 0) + perGame.extraReinforcements,
      collapse_tax_paid_routes:     (aggRow?.collapse_tax_paid_routes ?? 0) + perGame.collapseTax,
      defections_used:              (aggRow?.defections_used         ?? 0) + perGame.defections,
      // Chains
      chains_2:                     (aggRow?.chains_2 ?? 0) + perGame.chains.chain2,
      chains_3:                     (aggRow?.chains_3 ?? 0) + perGame.chains.chain3,
      chains_4:                     (aggRow?.chains_4 ?? 0) + perGame.chains.chain4,
      chains_5:                     (aggRow?.chains_5 ?? 0) + perGame.chains.chain5,
      longest_chain:                Math.max(aggRow?.longest_chain ?? 0, maxChainThisGame),
    }, {
      onConflict: "user_id,scope,season_id,format",
    })

    if (aggErr) return json(500, { error: aggErr.message })

    // Also track pvp_wins in the current season/all row if game is PvP
    if (!game.is_vs_ai && !wakeIsAi && !brakeIsAi && isWinner) {
      const { data: freshAgg } = await admin
        .from("player_stats_agg")
        .select("pvp_wins")
        .eq("user_id", humanId)
        .eq("scope",   "season")
        .eq("format",  "all")
        .eq("season_id", seasonId)
        .maybeSingle()

      const { error: pvpErr } = await admin.from("player_stats_agg")
        .update({ pvp_wins: ((freshAgg as any)?.pvp_wins ?? 0) + 1 })
        .eq("user_id",  humanId)
        .eq("scope",    "season")
        .eq("format",   "all")
        .eq("season_id", seasonId)

      if (pvpErr) return json(500, { error: pvpErr.message })
    }

    // ── Win streak (within same elo bracket) ──────────────────────────────────

    const { data: streakRow } = await admin
      .from("player_streaks")
      .select("*")
      .eq("user_id", humanId)
      .maybeSingle()

    let currentWinStreak  = streakRow?.current_win_streak  ?? 0
    let bestWinStreak     = streakRow?.best_win_streak     ?? 0

    if (isWinner) {
      // Only count streak if opponent is in same elo tier
      const [{ data: humanEloRow }, { data: oppEloRow }] = await Promise.all([
        admin.from("player_stats_agg").select("elo").eq("user_id", humanId).eq("scope", "season").eq("format", "all").eq("season_id", seasonId).maybeSingle(),
        admin.from("player_stats_agg").select("elo").eq("user_id", opponentId).eq("scope", "season").eq("format", "all").eq("season_id", seasonId).maybeSingle(),
      ])
      const humanElo = (humanEloRow as any)?.elo ?? 1200
      const oppElo   = (oppEloRow   as any)?.elo ?? 1200

      if (eloTier(humanElo) === eloTier(oppElo)) {
        currentWinStreak++
        bestWinStreak = Math.max(bestWinStreak, currentWinStreak)
      }
      // Different tier: streak neither increments nor resets
    } else {
      currentWinStreak = 0 // any loss breaks the streak
    }

    // ── Daily streak (make a move = play a game counts) ───────────────────────

    const today        = new Date().toISOString().slice(0, 10)
    const lastActivity = streakRow?.last_activity_date ?? null

    let currentDailyStreak = streakRow?.current_daily_streak ?? 0
    let bestDailyStreak    = streakRow?.best_daily_streak    ?? 0

    if (lastActivity === null) {
      currentDailyStreak = 1
    } else if (lastActivity === today) {
      // Already active today — no change
    } else {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().slice(0, 10)
      currentDailyStreak = lastActivity === yesterdayStr ? currentDailyStreak + 1 : 1
    }
    bestDailyStreak = Math.max(bestDailyStreak, currentDailyStreak)

    await admin.from("player_streaks").upsert({
      user_id:               humanId,
      current_win_streak:    currentWinStreak,
      best_win_streak:       bestWinStreak,
      current_daily_streak:  currentDailyStreak,
      best_daily_streak:     bestDailyStreak,
      last_activity_date:    today,
      updated_at:            now,
    })

    // ── Load lifetime totals by summing season/all rows ───────────────────────

    const { data: lifetimeRows, error: lifetimeErr } = await admin
      .from("player_stats_agg")
      .select("*")
      .eq("user_id", humanId)
      .eq("scope",   "season")
      .eq("format",  "all")

    if (lifetimeErr) return json(500, { error: lifetimeErr.message })

    const L: Record<string, number> = sumLifetimeRows((lifetimeRows as Record<string, any>[] | null) ?? [])

    // Format-specific win counts summed across all seasons
    const { data: fmtRows, error: fmtErr } = await admin
      .from("player_stats_agg")
      .select("format, wins")
      .eq("user_id", humanId)
      .eq("scope",   "season")
      .in("format", ["blitz", "rapid", "standard", "daily"])

    if (fmtErr) return json(500, { error: fmtErr.message })

    const fmtWins: Record<string, number> = {}
    for (const row of fmtRows ?? []) {
      fmtWins[row.format] = (fmtWins[row.format] ?? 0) + (row.wins ?? 0)
    }

    // Bot win counts (batch: wins where opponent is each bot)
    const botWins: Record<string, number> = {}
    await Promise.all(
      Object.entries(AI_BOT_KEY).map(async ([botId, botName]) => {
        const { count, error } = await admin
          .from("games")
          .select("id", { count: "exact", head: true })
          .eq("winner_id", humanId)
          .or(`wake_id.eq.${botId},brake_id.eq.${botId}`)

        if (error) throw new Error(error.message)
        botWins[botName] = count ?? 0
      })
    )

    // ── Per-game quirky checks ────────────────────────────────────────────────

    const log      = gameState?.log ?? []
    const logChron = [...log].reverse()

    // Recoil on turn 1: used before the first reinforcement phase of the game
    const firstReinforceIdx = logChron.findIndex(l => /== [WB] reinforcements:/.test(l))
    const preFirstReinforce = firstReinforceIdx >= 0 ? logChron.slice(0, firstReinforceIdx) : logChron
    const recoilOnTurn1     = preFirstReinforce.some(l => l.includes(`${humanSide} RECOIL:`))

    // Flawless: won without any of human's tokens being captured or sent to void
    const tokensLostByHuman =
      (gameState?.stats?.captures?.[humanSide] ?? 0) +
      (gameState?.void?.[humanSide] ?? 0)
    const flawless = isWinner && tokensLostByHuman === 0

    // Never paid collapse tax this game
    const paidCollapseTax = log.some(l => l.includes(`${humanSide} has no usable routes; yielded`))
    const noCollapseTax   = isWinner && !paidCollapseTax

    // Ransom 3+ times in one game
    const ransomSpree = perGame.ransoms >= 3

    // Giant slayer: beat someone 400+ elo above you, based on current season/all Elo
    const { data: humanEloNow } = await admin
      .from("player_stats_agg")
      .select("elo")
      .eq("user_id", humanId)
      .eq("scope", "season")
      .eq("format", "all")
      .eq("season_id", seasonId)
      .maybeSingle()

    const { data: oppEloNow } = await admin
      .from("player_stats_agg")
      .select("elo")
      .eq("user_id", opponentId)
      .eq("scope", "season")
      .eq("format", "all")
      .eq("season_id", seasonId)
      .maybeSingle()

    const giantSlayer = isWinner && (((oppEloNow as any)?.elo ?? 1200) - ((humanEloNow as any)?.elo ?? 1200)) >= 400

    // quirky_last_stand requires engine-level tracking (not yet available) — always false
    const quirky: Record<string, boolean> = {
      quirky_recoil_turn1:    recoilOnTurn1,
      quirky_flawless:        flawless,
      quirky_no_collapse_tax: noCollapseTax,
      quirky_ransom_spree:    ransomSpree,
      quirky_last_stand:      false, // TODO: requires engine tracking
      quirky_giant_slayer:    giantSlayer,
    }

    const streaks: Record<string, number> = {
      best_win_streak:   bestWinStreak,
      best_daily_streak: bestDailyStreak,
    }

    // ── Load achievement definitions + current player state ───────────────────

    const [{ data: allAchievements, error: achErr }, { data: playerAchs, error: paErr }] = await Promise.all([
      admin.from("achievements").select("*").order("sort_order"),
      admin.from("player_achievements").select("id, achievement_id, progress, unlocked_at").eq("user_id", humanId),
    ])

    if (achErr || paErr || !allAchievements || !playerAchs) {
      return json(500, { error: achErr?.message ?? paErr?.message ?? "Failed to load achievements" })
    }

    const playerAchMap = new Map(playerAchs.map(pa => [pa.achievement_id, pa]))

    // ── Evaluate all achievements ─────────────────────────────────────────────

    const newlyUnlocked: any[] = []
    const progressUpdates: Promise<any>[] = []
    const eventInserts: any[] = []

    for (const achievement of allAchievements) {
      let pa = playerAchMap.get(achievement.id)

      if (!pa) {
        const { data: insertedPa, error: insertPaErr } = await admin
          .from("player_achievements")
          .insert({
            user_id: humanId,
            achievement_id: achievement.id,
            progress: 0,
            unlocked_at: null,
          })
          .select("id, achievement_id, progress, unlocked_at")
          .single()

        if (insertPaErr) {
          throw new Error(`Failed creating player_achievement row for ${achievement.key}: ${insertPaErr.message}`)
        }

        pa = insertedPa
        playerAchMap.set(achievement.id, pa)
      }

      if (pa.unlocked_at) continue

      const value     = getValueForKey(achievement.key, L, streaks, botWins, fmtWins, quirky)
      const threshold = achievement.threshold ?? 1
      const newProg   = Math.min(value, threshold)

      let unlocked = value >= threshold

      if (unlocked && achievement.max_unlocks != null) {
        const { count: unlockedCount, error: countErr } = await admin
          .from("player_achievements")
          .select("id", { count: "exact", head: true })
          .eq("achievement_id", achievement.id)
          .not("unlocked_at", "is", null)

        if (countErr) {
          throw new Error(`Failed counting capped unlocks for ${achievement.key}: ${countErr.message}`)
        }

        if ((unlockedCount ?? 0) >= achievement.max_unlocks) {
          unlocked = false
        }
      }

      if (newProg !== pa.progress || unlocked) {
        progressUpdates.push(
          admin.from("player_achievements")
            .update({
              progress: newProg,
              unlocked_at: unlocked ? now : null,
            })
            .eq("id", pa.id)
        )

        if (unlocked) {
          newlyUnlocked.push(achievement)
          eventInserts.push({
            user_id: humanId,
            achievement_id: achievement.id,
            game_id: body.gameId,
            created_at: now,
          })
        }
      }
    }

    await Promise.all(progressUpdates)

    if (eventInserts.length > 0) {
      const { error: eventErr } = await admin.from("achievement_events").insert(eventInserts)
      if (eventErr) return json(500, { error: eventErr.message })
    }

    // ── Auto-grant cosmetic rewards for newly unlocked achievements ───────────
    // reward_id points to a skin_set id — insert all skins in that set

    const achievementsWithRewards = newlyUnlocked.filter(a => a.reward_id)

    if (achievementsWithRewards.length > 0) {
      const setIds = [...new Set(achievementsWithRewards.map((a: any) => a.reward_id))]

      const { data: skinsInSets, error: skinsErr } = await admin
        .from("skins")
        .select("id, set_id")
        .in("set_id", setIds)

      if (skinsErr) return json(500, { error: skinsErr.message })

      const rewardInserts: any[] = []
      for (const achievement of achievementsWithRewards) {
        const skins = (skinsInSets ?? []).filter((s: any) => s.set_id === achievement.reward_id)
        for (const skin of skins) {
          rewardInserts.push({
            user_id:     humanId,
            skin_id:     skin.id,
            granted_at:  now,
            granted_by:  "achievement",
          })
        }
      }

      if (rewardInserts.length > 0) {
        const { error: invErr } = await admin.from("player_inventory").insert(rewardInserts)
        if (invErr) return json(500, { error: invErr.message })
      }
    }

    return json(200, {
      ok: true,
      newlyUnlocked,
      progressUpdated: progressUpdates.length,
    })

  } catch (e) {
    return json(500, { error: String(e) })
  }
})