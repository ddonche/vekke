// src/components/GamePage.tsx
import { useNavigate } from "react-router-dom"
import "../styles/skins.css"
import React, { useEffect, useState, useRef, useCallback } from "react"
import { SIZE, toSq, type Coord } from "../engine/coords"
import { newGame, type GameState, type Player, type Token } from "../engine/state"
import type { Direction } from "../engine/directions"
import { sounds } from "../sounds"
import { RouteIcon } from "../RouteIcon"
import { useVekkeController, AI_RATING, TIME_CONTROLS, type TimeControlId } from "../engine/ui_controller"
import { SkinsModal } from "./SkinsModal"
import { GridBoard } from "../GridBoard"
import { IntersectionBoard } from "../IntersectionBoard"
import { AuthModal } from "../AuthModal"
import { Header } from "./Header"
import { OnboardingModal } from "../OnboardingModal"
import { ProfileModal } from "../ProfileModal"
import { HelpModal } from "../HelpModal"
import { MulliganHelpModal } from "../MulliganHelpModal"
import { getCurrentUserId } from "../services/auth" //
import { supabase } from "../services/supabase"
import { getPlayerEloStats } from "../services/elo"
import {
  getResolvedLoadout,
  getPlayerLoadout,
  type PlayerLoadout,
  type ResolvedLoadout,
  DEFAULT_RESOLVED,
} from "../services/skinService"
import { NewGameModal } from "../NewGameModal"
import { GameOverModal } from "../GameOverModal"
import { AchievementsModal } from "./AchievementsModal"

class ErrBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any; stack: string }
> {
  state = { err: null, stack: "" }

  static getDerivedStateFromError(err: any) {
    return { err, stack: "" }
  }

  componentDidCatch(err: any, info: any) {
    console.error("RENDER CRASH:", err)
    console.error("COMPONENT STACK:", info?.componentStack)
    this.setState({ stack: String(info?.componentStack ?? "") })
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: "1rem", color: "white", background: "#0a0a0c" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Render crashed</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.err?.message ?? this.state.err)}
          </pre>
          {this.state.stack && (
            <>
              <div style={{ fontWeight: 900, marginTop: 12, marginBottom: 6 }}>
                Component stack
              </div>
              <pre style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>
                {this.state.stack}
              </pre>
            </>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

type GamePageProps = {
  opponentType?: "ai" | "pvp"
  mySide?: Player
  initialState?: GameState
  onMoveComplete?: (
    state: GameState,
    clocks: { W: number; B: number },
    vgn?: string
  ) => void
  myName?: string
  myElo?: number
  opponentName?: string
  opponentElo?: number
  opponentUserId?: string
  externalGameData?: any
  initialTimeControlId?: TimeControlId
  initialClocks?: { W: number; B: number }
  onPlayComputer?: () => void
  onRequestRematch?: () => void
  /** AI level from DB — passed straight to controller so first move uses correct logic */
  aiDifficulty?: string
  newlyUnlockedAchievements?: any[]
  /** Puzzle mode: suppress new-game modal, chat, and game-over modal */
  puzzleMode?: boolean
  /** Current moves remaining — displayed in place of the clock in puzzle mode */
  puzzleMovesLeft?: number
  /** Rendered as a banner strip directly below the Header in puzzle mode */
  puzzleBanner?: React.ReactNode
}

export function GamePage(props: GamePageProps = {}) {
  const lastProcessedMoveRef = useRef<string | number>(-1)
  const [skinsOpen, setSkinsOpen] = useState(false)
  // Screenshot/tutorial helper: allow hiding the selection highlight without affecting gameplay.
  const [hideSelection, setHideSelection] = useState(false)

  const {
    g,
    selectedTokenId,
    selected,
    human,
    started,
    audioReady,
    aiDifficulty,
    clocks,
    timeControl,
    timeControlId,
    TIME_CONTROLS,
    boardMap,
    remainingRoutes,
    forcedYieldAvailable,
    earlySwapArmed,
    canPickQueueForSwap,
    canEarlySwap,
    canBuyExtraReinforcement,
    canUseRansom,
    recoilArmed,
    canUseRecoil,
    pendingRecoil,
    recoilSourcePos,
    recoilPlayer,
    defectionArmed,
    mulliganArmed,
    canUseDefection,
    allRoutesUsed,
    clockPlayer,
    constants: { EARLY_SWAP_COST, EXTRA_REINFORCEMENT_COST, RANSOM_COST_CAPTIVES, RECOIL_COST_CAPTIVES, RECOIL_COST_RESERVES, DEFECTION_BOARD_COST, DEFECTION_VOID_GAIN },
    actions,
  } = useVekkeController({
    sounds,
    opponentType: props.opponentType,
    mySide: props.mySide,
    initialState: props.initialState,
    onMoveComplete: props.onMoveComplete,
    initialTimeControlId: props.initialTimeControlId,
    initialClocks: props.initialClocks,
    initialAiDifficulty: props.aiDifficulty as any,
    externalGameData: props.externalGameData,
  })

  const [ghost, setGhost] = useState<null | {
    by: Player
    from: Coord
    tokenId: string
    dir: Direction
    born: number
  }>(null)

  const GHOST_MS = 1000

  const [newGameOpen, setNewGameOpen] = useState(() => {
    if (props.opponentType === "pvp") return false
    // If we already have a DB-backed game loaded (wrapper), don't show "new game" modal.
    if (props.externalGameData) return false
    // Puzzle mode never shows the new game modal.
    if (props.puzzleMode) return false
    return true
  })
  const [newGameMsg, setNewGameMsg] = useState<string | null>(null)
  const [themeMuted, setThemeMuted] = useState(false)

  const [boardStyle, setBoardStyle] = useState<"grid" | "intersection">("grid")
  const [showLogExpanded, setShowLogExpanded] = useState(true)
  const [showChatExpanded, setShowChatExpanded] = useState(false)
  const [mobileBottomTab, setMobileBottomTab] = useState<"chat" | "log">("log")
  const [showMobileBottomModal, setShowMobileBottomModal] = useState(false)
  const [showGameOverModal, setShowGameOverModal] = useState(true)
  const [showAchievementsModal, setShowAchievementsModal] = useState(false)
  const mulliganTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mulliganHelpOpen, setMulliganHelpOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const authReturnToRef = useRef<string | null>(null)
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState<"currentPlayer" | "recoil" | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<{
    username: string
    country_code: string | null
    country_name: string | null
    avatar_url: string | null
    order_id: string | null 
  } | null>(null)
  const [opponentProfile, setOpponentProfile] = useState<{
    username: string
    country_code: string | null
    country_name: string | null
    avatar_url: string | null
    order_id: string | null
  } | null>(null)

  type PlayerStats = {
    user_id: string
    elo: number
    elo_blitz: number
    elo_rapid: number
    elo_standard: number
    elo_daily: number
  }

  const [loginWarn, setLoginWarn] = useState<string>("")
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)

  // Skin loadouts
  const [myLoadout, setMyLoadout] = useState<ResolvedLoadout | null>(null)
  const [opponentLoadout, setOpponentLoadout] = useState<ResolvedLoadout | null>(null)
  const [suppressOpponentSkin, setSuppressOpponentSkin] = useState(false)
  const [myLoadoutIds, setMyLoadoutIds] = useState<PlayerLoadout | null>(null)
  const [routeSkinStyles, setRouteSkinStyles] = useState<Record<string, any>>({})
  const [boardSkinStyle, setBoardSkinStyle] = useState<Record<string, string> | undefined>(undefined)
  const [opponentLoadoutIds, setOpponentLoadoutIds] = useState<PlayerLoadout | null>(null)
  const [skinImageById, setSkinImageById] = useState<Record<string, string | null>>({})
  const [mobilePlayerInfoExpanded, setMobilePlayerInfoExpanded] = useState<Record<"W" | "B", boolean>>({ W: false, B: false })
  const [mobileActionPickerSide, setMobileActionPickerSide] = useState<null | "W" | "B">(null)

  // Keyboard shortcuts:
  //  - H: toggle selection highlight visibility
  //  - Esc: hide selection highlight (useful for screenshots)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't steal keys from form fields.
      const el = e.target as HTMLElement | null
      const tag = (el?.tagName || "").toLowerCase()
      const isTyping = tag === "input" || tag === "textarea" || (el as any)?.isContentEditable
      if (isTyping) return

      if (e.key === "Escape") {
        setHideSelection(true)
        return
      }
      if (e.key === "h" || e.key === "H") {
        setHideSelection((v) => !v)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // ── Puzzle mode: detect B→W turn transitions and call onMoveComplete ──
  const puzzlePrevPlayerRef = React.useRef<string | null>("B")

  useEffect(() => {
    if (!props.puzzleMode) return
    const prev = puzzlePrevPlayerRef.current
    puzzlePrevPlayerRef.current = g.player
    if (prev === "B" && g.player === "W") {
      props.onMoveComplete?.(g, clocks)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.player, g.turn])

  const eloForFormat = (ps: PlayerStats | null, tc: typeof timeControlId): number => {
    if (!ps) return 1200
    if (tc === "blitz") return (ps.elo_blitz ?? 1200) as number
    if (tc === "rapid") return (ps.elo_rapid ?? 1200) as number
    if (tc === "daily") return (ps.elo_daily ?? 1200) as number
    return (ps.elo_standard ?? 1200) as number
  }

  const peakElo = (ps: PlayerStats | null): number => {
    if (!ps) return 1200
    return Math.max(ps.elo_standard ?? 1200, ps.elo_rapid ?? 1200, ps.elo_blitz ?? 1200, ps.elo_daily ?? 1200)
  }

  const myElo = currentUserId ? eloForFormat(playerStats, timeControlId) : 1200
  const myPeak = currentUserId ? peakElo(playerStats) : 1200
  const aiElo = (AI_RATING as any)[aiDifficulty] ?? 1200

  const formatLabel =
    timeControlId === "blitz" ? "Blitz" :
    timeControlId === "rapid" ? "Rapid" :
    timeControlId === "daily" ? "Daily" :
    "Standard"

  const navigate = useNavigate()

  async function createAiGameAndGo() {
    await actions.unlockAudio?.()

    if (!currentUserId) {
      setNewGameMsg("You must be logged in to start a new game.")
      return
    }

    setNewGameMsg(null)

    // Build the initial state snapshot for the DB row (authoritative starting position).
    const initialState = newGame()

    // Always send a non-expired JWT to edge functions.
    const decodeExpMs = (jwt: string) => {
      const payloadB64 = jwt.split(".")[1]
      const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")))
      return (payloadJson.exp ?? 0) * 1000
    }

    const { data: sess0, error: sessErr } = await supabase.auth.getSession()
    if (sessErr || !sess0.session?.access_token) {
      setShowAuthModal(true)
      return
    }

    let token = sess0.session.access_token
    let expMs = 0
    try {
      expMs = decodeExpMs(token)
    } catch {
      expMs = 0
    }

    // Refresh if missing/invalid exp, or within 2 minutes of expiry.
    if (!expMs || expMs <= Date.now() + 120_000) {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
      if (refreshErr || !refreshed.session?.access_token) {
        setShowAuthModal(true)
        return
      }
      token = refreshed.session.access_token
    }

    const { data, error } = await supabase.functions.invoke("create_ai_game", {
      body: {
        aiLevel: aiDifficulty,
        timeControl: timeControlId,
        initialState,
        vgnVersion: "1",
        humanSide: Math.random() < 0.5 ? "W" : "B",
      },
      headers: { Authorization: `Bearer ${token}` },
    })

    if (error) throw error
    if (!data?.gameId) throw new Error("create_ai_game did not return gameId")

    if (data.alreadyExists) {
      setNewGameMsg("You already have an active game with this opponent.")
      navigate(`/ai/${data.gameId}`)
      return
    }

    // KEEP AI NAVIGATION: go to the AI game route.
    navigate(`/ai/${data.gameId}`)
  }

  // Fetch player Elo for ratings display.
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!currentUserId) {
        setPlayerStats(null)
        return
      }
      const stats = await getPlayerEloStats(currentUserId)
      if (cancelled) return
      setPlayerStats(stats as any)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  // Show achievements modal after game over modal is closed, if achievements arrived
  useEffect(() => {
    if (!showGameOverModal && (props.newlyUnlockedAchievements?.length ?? 0) > 0) {
      setShowAchievementsModal(true)
    }
  }, [showGameOverModal, props.newlyUnlockedAchievements])

  // Theme music
  const playTheme = () => {
    if (themeMuted || sounds.theme.playing()) return
    sounds.theme.stop()
    const id = sounds.theme.play()
    sounds.theme.fade(0, 0.25, 1200, id)
  }
  const stopTheme = () => {
    sounds.theme.fade(0.25, 0, 600)
    setTimeout(() => sounds.theme.stop(), 650)
  }
  // Stop on unmount (navigation away)
  useEffect(() => {
    return () => { sounds.theme.stop() }
  }, [])

    // Show game over modal whenever a new game ends.
  useEffect(() => {
    if (g.gameOver) { setShowGameOverModal(true); playTheme() }
  }, [!!g.gameOver])

    async function fetchSkinImages(ids: (string | null | undefined)[]): Promise<Record<string, string | null>> {
    const uniq = Array.from(new Set(ids.filter(Boolean) as string[]))
    if (uniq.length === 0) return {}

    const { data, error } = await supabase
      .from("skins")
      .select("id, image_url")
      .in("id", uniq)

    if (error || !data) return {}

    const map: Record<string, string | null> = {}
    for (const row of data as any[]) map[row.id] = row.image_url ?? null
    return map
  }

  // Load skin loadouts for both players
  const reloadMyLoadout = useCallback(async () => {
    if (!currentUserId) return

    const [mineResolved, mineIds] = await Promise.all([
      getResolvedLoadout(currentUserId),
      getPlayerLoadout(currentUserId),
    ])

    setMyLoadout(mineResolved)
    setMyLoadoutIds(mineIds)

    // only need the token skins for board rendering
    const imgMap = await fetchSkinImages([mineIds.wake_token_skin_id, mineIds.brake_token_skin_id])
    setSkinImageById((prev) => ({ ...prev, ...imgMap }))
  }, [currentUserId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [mineResolved, theirsResolved, mineIds, theirsIds] = await Promise.all([
        currentUserId ? getResolvedLoadout(currentUserId) : Promise.resolve(null),
        props.opponentUserId ? getResolvedLoadout(props.opponentUserId) : Promise.resolve(null),
        currentUserId ? getPlayerLoadout(currentUserId) : Promise.resolve(null),
        props.opponentUserId ? getPlayerLoadout(props.opponentUserId) : Promise.resolve(null),
      ])

      if (cancelled) return

      setMyLoadout(mineResolved)
      setOpponentLoadout(theirsResolved)
      setMyLoadoutIds(mineIds)
      setOpponentLoadoutIds(theirsIds)

      const imgMap = await fetchSkinImages([
        mineIds?.wake_token_skin_id,
        mineIds?.brake_token_skin_id,
        theirsIds?.wake_token_skin_id,
        theirsIds?.brake_token_skin_id,
      ])

      if (cancelled) return
      setSkinImageById(imgMap)

      // Fetch style JSON for equipped route skins
      const routeSkinIds = [
        mineIds?.route_skin_id,
        theirsIds?.route_skin_id,
      ].filter(Boolean) as string[]

      if (routeSkinIds.length > 0) {
        const { data: routeSkinRows } = await supabase
          .from("skins")
          .select("id, style")
          .in("id", routeSkinIds)
        if (!cancelled && routeSkinRows) {
          const styleMap: Record<string, any> = {}
          for (const row of routeSkinRows as any[]) {
            if (row.style && typeof row.style === "object" && Object.keys(row.style).length > 0) {
              styleMap[row.id] = row.style
            }
          }
          setRouteSkinStyles(styleMap)
        }
      }

      // Fetch board skin style for current player
      const boardSkinId = mineIds?.board_skin_id
      if (boardSkinId) {
        const { data: boardSkinRow } = await supabase
          .from("skins")
          .select("id, style")
          .eq("id", boardSkinId)
          .maybeSingle()
        if (!cancelled && boardSkinRow?.style && typeof boardSkinRow.style === "object" && Object.keys(boardSkinRow.style).length > 0) {
          setBoardSkinStyle(boardSkinRow.style as Record<string, string>)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [currentUserId, props.opponentUserId])

  // Refresh rating after a finished game.
  useEffect(() => {
    if (!currentUserId) return
    if (!g.gameOver) return

    const t = window.setTimeout(async () => {
      const stats = await getPlayerEloStats(currentUserId)
      if (stats) setPlayerStats(stats as any)
    }, 600)

    return () => window.clearTimeout(t)
  }, [g.gameOver?.winner, g.gameOver?.reason, g.log.length, currentUserId])

  // Helper for padding numbers
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  // Format clock time from milliseconds
  const fmtClock = (ms: number) => {
    const totalSec = Math.max(0, Math.ceil(ms / 1000))
    const sec = totalSec % 60
    const totalMin = Math.floor(totalSec / 60)
    const min = totalMin % 60
    const hours = Math.floor(totalMin / 60)

    // Daily uses HH:MM:SS, others use M:SS
    if (timeControlId === "daily") {
      return `${hours}:${pad2(min)}:${pad2(sec)}`
    }
    return `${totalMin}:${pad2(sec)}`
  }

  // Ghost token animation (show the "from" square briefly after a move)
  useEffect(() => {
    if (!started) {
      setGhost(null)
      return
    }

    if (!g.lastMove) {
      setGhost(null)
      return
    }

    const lm = g.lastMove
    const elapsed = Date.now() - lm.moveNumber
    if (elapsed > GHOST_MS) {
      setGhost(null)
      return
    }

    // Anchor ghost data to the authoritative lastMove from the controller.
    setGhost({
      by: lm.by,
      from: lm.from,
      tokenId: lm.tokenId,
      dir: lm.dir,
      born: lm.moveNumber,
    })

    const interval = window.setInterval(() => {
      // Force re-render so alpha can decay over time.
      setGhost((prev) => (prev ? { ...prev } : prev))
    }, 50)

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setGhost(null)
    }, Math.max(0, GHOST_MS - elapsed))

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [started, g.lastMove?.moveNumber])

  // Stable ref so the sync effect below doesn't need `actions` as a dep.
  // (actions recreates on every g change, which would cause the effect to fire on every local move.)
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  // Mulligan: auto-pass after 30s
  useEffect(() => {
    if (g.phase !== "MULLIGAN") {
      if (mulliganTimerRef.current) clearTimeout(mulliganTimerRef.current)
      return
    }
    const myReady = (g as any).mulliganReady?.[human]
    if (myReady) return
    mulliganTimerRef.current = setTimeout(() => {
      ;(actionsRef.current as any).passMulligan?.(human)
    }, 30_000)
    return () => { if (mulliganTimerRef.current) clearTimeout(mulliganTimerRef.current) }
  }, [g.phase, (g as any).mulliganReady?.W, (g as any).mulliganReady?.B, human])

  // PvP: Watch for external game data changes and update state
  useEffect(() => {
    if (props.opponentType !== "pvp") return
    if (!props.externalGameData?.current_state) return

    const externalState = props.externalGameData.current_state as GameState

    // Sync key covers current player + phase + log length so mid-turn moves propagate
    // NOTE: GameState uses `.player`, not `.turn` — `.turn` does not exist on GameState
    const extPlayer = (externalState as any).player
    const syncKey =
      externalState.phase === "OPENING"
        ? `opening-${externalState.openingPlaced.B}-${externalState.openingPlaced.W}`
        : externalState.phase === "MULLIGAN"
        ? `mulligan-${(externalState as any).mulliganCount?.W ?? 0}-${(externalState as any).mulliganCount?.B ?? 0}-${(externalState as any).mulliganReady?.W}-${(externalState as any).mulliganReady?.B}`
        : `${extPlayer}-${externalState.phase}-${externalState.log.length}`

    if (syncKey === lastProcessedMoveRef.current) return

    lastProcessedMoveRef.current = syncKey
    actionsRef.current.loadState(externalState)

    if (!actionsRef.current.started) actionsRef.current.setStarted(true)
  }, [
    (props.externalGameData?.current_state as any)?.player,
    props.externalGameData?.current_state?.phase,
    props.externalGameData?.current_state?.log?.length,
    props.externalGameData?.current_state?.openingPlaced?.B,
    props.externalGameData?.current_state?.openingPlaced?.W,
    (props.externalGameData?.current_state as any)?.mulliganCount?.W,
    (props.externalGameData?.current_state as any)?.mulliganCount?.B,
    (props.externalGameData?.current_state as any)?.mulliganReady?.W,
    (props.externalGameData?.current_state as any)?.mulliganReady?.B,
    props.externalGameData?.current_state?.gameOver,
    props.opponentType,
    // NOTE: `actions` intentionally excluded — it changes on every g update and would
    // cause this effect to fire on every local state change, not just DB updates.
    // `started` intentionally excluded for the same reason; actionsRef stays current.
  ])

  // Auto-start the game when loaded via a wrapper (both PvP and AI)
  useEffect(() => {
    if (props.opponentType !== "pvp" && props.opponentType !== "ai") return
    if (started) return

    // Start if we were given an initial snapshot OR if we already have remote state.
    // (Remote state path matters for refresh/resume.)
    if (props.initialState || props.externalGameData?.current_state) {
      actionsRef.current.setStarted(true)
    }
  }, [
    props.opponentType,
    props.initialState,
    props.externalGameData?.current_state,
    started,
    // Note: actionsRef intentionally used instead of actions — actions recreates on every g
    // change and would cause this effect (and setStarted) to fire on every state update.
  ])

  // Safety net: if ai_level changes on externalGameData (shouldn't normally happen),
  // keep the controller in sync. Uses actionsRef to avoid firing on every g update.
  useEffect(() => {
    if (props.opponentType !== "ai") return
    const lvl = props.externalGameData?.ai_level
    if (lvl) actionsRef.current.setAiDifficulty(lvl as any)
  }, [props.opponentType, props.externalGameData?.ai_level])

  // ===== TWO MODES ONLY: WEB vs MOBILE =====
  // Wider breakpoint so shrinking the browser reliably flips to mobile.
  const MOBILE_BREAKPOINT = 1100
  const [isMobile, setIsMobile] = useState(false)
  const mobileBoardMeasureRef = useRef<HTMLDivElement | null>(null)
  const [mobileBoardHeight, setMobileBoardHeight] = useState<number | null>(null)

  // Mobile needs to fit everything on one screen, so cap domino + token sizing.
  const MOBILE_ROUTE_DOMINO_MAX = 56
  const MOBILE_ROUTE_SCALE = 1.0
  const MOBILE_TOKEN_SIZE = "0.75rem"
  const MOBILE_TOKEN_GAP = "0.1875rem"
  const MOBILE_TOKEN_WRAP_MAX = "5.5rem"

  // Route domino sizing: make the 3 hand routes fill the route panel width,
// then mirror that single-domino width in the Queue so all dominoes match.
//
// IMPORTANT: We measure *every* visible player route row (mobile top/bottom, desktop left/right)
// and choose the smallest computed per-domino width so nobody overflows and "hides" the 3rd card.
const routeMeasureEls = useRef<Array<HTMLDivElement | null>>([])
const setRouteMeasureEl =
  (idx: number) =>
  (el: HTMLDivElement | null) => {
    routeMeasureEls.current[idx] = el
  }

const [routeDominoW, setRouteDominoW] = useState<number | null>(null)
// Mobile-only compact size for the Queue panel.
// IMPORTANT: this must not affect the player route strips.
// Size the queue dominoes from the available mobile board height so the
// 3 stacked queue routes fit inside their own panel instead of clipping.
const queuePanelHeight = isMobile && mobileBoardHeight
  ? Math.max(Math.floor(mobileBoardHeight * 0.58), 150)
  : null

const queueRouteDominoW = isMobile
  ? Math.max(
      36,
      Math.min(
        64,
        Math.floor((((((queuePanelHeight ?? 168) - 24) / 3) * 7) / 13))
      )
    )
  : routeDominoW

const mobileUtilityColW = undefined

useEffect(() => {
  const els = routeMeasureEls.current.filter(Boolean) as HTMLDivElement[]
  if (els.length === 0) return

  const computeForEl = (el: HTMLDivElement) => {
    const cs = window.getComputedStyle(el)
    const gapStr =
      (cs.columnGap && cs.columnGap !== "normal") ? cs.columnGap : (cs.gap || "0px")
    const gapPx = parseFloat(gapStr) || 0
    // "Fill" width for 3 across, then (on mobile) intentionally shrink so the row doesn't occupy the entire panel.
    const perFill = (el.clientWidth - gapPx * 2) / 3
    const perMobile = Math.min(perFill * MOBILE_ROUTE_SCALE, MOBILE_ROUTE_DOMINO_MAX)
    const per = isMobile ? perMobile : perFill
    return per
  }

  const compute = () => {
    const pers = els.map(computeForEl).filter((n) => Number.isFinite(n) && n > 0)
    if (pers.length === 0) return
    const per = Math.floor(Math.min(...pers))
    if (per > 0) setRouteDominoW(per)
  }

  compute()

  const ro = new ResizeObserver(() => compute())
  els.forEach((el) => ro.observe(el))
  return () => ro.disconnect()
}, [isMobile])

  useEffect(() => {
    if (!isMobile) {
      setMobileBoardHeight(null)
      return
    }
    const el = mobileBoardMeasureRef.current
    if (!el) return

    const compute = () => {
      const h = Math.floor(el.getBoundingClientRect().height)
      if (h > 0) setMobileBoardHeight(h)
    }

    compute()
    const ro = new ResizeObserver(() => compute())
    ro.observe(el)
    return () => ro.disconnect()
  }, [isMobile, boardStyle, routeDominoW, queueRouteDominoW])

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  // Board style toggle with 'B' key
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') {
        setBoardStyle(prev => prev === "grid" ? "intersection" : "grid")
      }
    }
    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [])

  // Auth state listener - check if user needs onboarding
  useEffect(() => {
    const checkOnboarding = async (userId: string) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, country_code, country_name, avatar_url, order_id")
        .eq("id", userId)
        .single()

      if (!profile) return

      // Store profile
      setUserProfile(profile)

      // Check if user needs onboarding
      const needsOnboarding = 
        profile.username.startsWith("user_") || 
        !profile.country_code

      if (needsOnboarding) {
        setShowOnboardingModal(true)
      }
    }

    // Invite-auth redirect support (?openAuth=1&returnTo=/invite/<token>) (also supports ?auth=1)
    const sp = new URLSearchParams(window.location.search)
    const wantsAuth =
      sp.get("openAuth") === "1" || sp.get("openAuth") === "true" ||
      sp.get("auth") === "1" || sp.get("auth") === "true"
    const returnTo = sp.get("returnTo")

    if (returnTo) {
      authReturnToRef.current = returnTo
    }

    if (wantsAuth) {
      setShowAuthModal(true)

      // Clean URL so refresh doesn't reopen modal
      window.history.replaceState(null, "", window.location.pathname)
    }

// New-game modal deep-link support (?openNewGame=1)
const wantsNewGame =
  sp.get("openNewGame") === "1" || sp.get("openNewGame") === "true" ||
  sp.get("newGame") === "1" || sp.get("newGame") === "true"

if (wantsNewGame) {
  setNewGameOpen(true)
  setNewGameMsg(null)
  // Clean URL so refresh doesn't keep reopening the modal
  window.history.replaceState(null, "", window.location.pathname)
}

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        checkOnboarding(session.user.id)

        // If we already have a session and we're returning to an invite, go now.
        const rt = authReturnToRef.current
        if (rt) {
          authReturnToRef.current = null
          setShowAuthModal(false)
          window.location.assign(rt)
        }
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        checkOnboarding(session.user.id)

        const rt = authReturnToRef.current
        if (rt) {
          authReturnToRef.current = null
          setShowAuthModal(false)
          window.location.assign(rt)
        }
      } else {
        setCurrentUserId(null)
        setUserProfile(null)
        setShowOnboardingModal(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Fetch opponent profile from DB (works for AI characters and PvP opponents)
  // Fetch opponent profile from DB (AI and PvP)
  useEffect(() => {
    const resolvedOpponentUserId =
      props.opponentUserId ??
      (props.externalGameData && props.mySide
        ? (props.mySide === "W"
            ? props.externalGameData.brake_id
            : props.externalGameData.wake_id)
        : null)

    if (!resolvedOpponentUserId) return

    let cancelled = false
    supabase
      .from("profiles")
      .select("username, country_code, country_name, avatar_url, order_id")
      .eq("id", resolvedOpponentUserId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error("Failed to load opponent profile:", error)
          return
        }
        if (!data) return
        setOpponentProfile(data)
      })

    return () => { cancelled = true }
  }, [props.opponentUserId, props.externalGameData, props.mySide])

  // Flag image component using flagcdn.com (cross-platform, works on Windows)
  // Returns a colour matching the AI-level thresholds used in the new-game modal.
  const eloColor = (elo: number) => {
    if (elo >= 2000) return "#D4AF37" // gold  – Grandmaster
    if (elo >= 1750) return "#7c2d12" // brown – Senior Master
    if (elo >= 1500) return "#16a34a" // green – Master
    if (elo >= 1200) return "#dc2626" // red   – Expert
    if (elo >= 900)  return "#2563eb" // blue  – Adept
    return "#6b6558"                  // grey  – Novice
  }

  const GearIcon = () => (
    <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor">
      <path d="M259.1 73.5C262.1 58.7 275.2 48 290.4 48L350.2 48C365.4 48 378.5 58.7 381.5 73.5L396 143.5C410.1 149.5 423.3 157.2 435.3 166.3L503.1 143.8C517.5 139 533.3 145 540.9 158.2L570.8 210C578.4 223.2 575.7 239.8 564.3 249.9L511 297.3C511.9 304.7 512.3 312.3 512.3 320C512.3 327.7 511.8 335.3 511 342.7L564.4 390.2C575.8 400.3 578.4 417 570.9 430.1L541 481.9C533.4 495 517.6 501.1 503.2 496.3L435.4 473.8C423.3 482.9 410.1 490.5 396.1 496.6L381.7 566.5C378.6 581.4 365.5 592 350.4 592L290.6 592C275.4 592 262.3 581.3 259.3 566.5L244.9 496.6C230.8 490.6 217.7 482.9 205.6 473.8L137.5 496.3C123.1 501.1 107.3 495.1 99.7 481.9L69.8 430.1C62.2 416.9 64.9 400.3 76.3 390.2L129.7 342.7C128.8 335.3 128.4 327.7 128.4 320C128.4 312.3 128.9 304.7 129.7 297.3L76.3 249.8C64.9 239.7 62.3 223 69.8 209.9L99.7 158.1C107.3 144.9 123.1 138.9 137.5 143.7L205.3 166.2C217.4 157.1 230.6 149.5 244.6 143.4L259.1 73.5zM320.3 400C364.5 399.8 400.2 363.9 400 319.7C399.8 275.5 363.9 239.8 319.7 240C275.5 240.2 239.8 276.1 240 320.3C240.2 364.5 276.1 400.2 320.3 400z"/>
    </svg>
  )

  const FlagImg = ({ cc, size = 16 }: { cc: string | null | undefined; size?: number }) => {
      const s = (cc ?? "").trim().toLowerCase()
      if (!s || !/^[a-z]{2}$/.test(s)) return null
      return (
        <img
          src={`https://flagicons.lipis.dev/flags/4x3/${s}.svg`}
          width={size}
          height={Math.round(size * 0.75)}
          alt={s.toUpperCase()}
          style={{ display: "inline-block", verticalAlign: "middle", borderRadius: 2 }}
          onError={(e) => { e.currentTarget.style.display = "none" }}
        />
      )
    }

  const whitePlayer = {
    username:
      props.opponentType === "pvp"
        ? (props.mySide === "W"
            ? (props.myName || "You")
            : (props.opponentName || opponentProfile?.username || "Opponent"))
        : (human === "W"
            ? (userProfile?.username || "Wake Player")
            : (opponentProfile?.username || props.opponentName || "Computer")),
    elo:
      props.opponentType === "pvp"
        ? (props.mySide === "W" ? (props.myElo || 1200) : (props.opponentElo || 1200))
        : (human === "W" ? myElo : (props.opponentElo ?? aiElo)),
    avatar: "W",
    avatar_url:
      human === "W"
        ? (userProfile?.avatar_url ? `${userProfile.avatar_url}?t=${Date.now()}` : null)
        : (opponentProfile?.avatar_url ?? null),
    country:
      human === "W"
        ? (userProfile?.country_code ?? null)
        : (opponentProfile?.country_code ?? null),
  }

  const bluePlayer = {
    username:
      props.opponentType === "pvp"
        ? (props.mySide === "B"
            ? (props.myName || "You")
            : (props.opponentName || opponentProfile?.username || "Opponent"))
        : (human === "B"
            ? (userProfile?.username || "Brake Player")
            : (opponentProfile?.username || props.opponentName || "Computer")),
    elo:
      props.opponentType === "pvp"
        ? (props.mySide === "B" ? (props.myElo || 1200) : (props.opponentElo || 1200))
        : (human === "B" ? myElo : (props.opponentElo ?? aiElo)),
    avatar: "B",
    avatar_url:
      human === "B"
        ? (userProfile?.avatar_url ? `${userProfile.avatar_url}?t=${Date.now()}` : null)
        : (opponentProfile?.avatar_url ?? null),
    country:
      human === "B"
        ? (userProfile?.country_code ?? null)
        : (opponentProfile?.country_code ?? null),
  }

  // Display positioning: human always right/bottom, opponent always left/top
  const topPlayer = human === "W" ? bluePlayer : whitePlayer
  const bottomPlayer = human === "W" ? whitePlayer : bluePlayer
  const leftPlayer = human === "W" ? bluePlayer : whitePlayer
  const rightPlayer = human === "W" ? whitePlayer : bluePlayer

  // ------------------------------------------------------------
  // Chat
  // ------------------------------------------------------------
  type ChatMsg = { id: string; at: number; from: "W" | "B" | "SYS"; text: string }
  const [chatInput, setChatInput] = useState("")
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [myChatDisabled, setMyChatDisabled] = useState(false)
  const [opponentChatDisabled, setOpponentChatDisabled] = useState(false)
  const [showChatInfo, setShowChatInfo] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const gameId = props.externalGameData?.id ?? null
  const resolvedOpponentUserId =
    props.opponentUserId ??
    (props.externalGameData && props.mySide
      ? (props.mySide === "W" ? props.externalGameData.brake_id : props.externalGameData.wake_id)
      : null)

  // Fetch my chat_disabled on load
  useEffect(() => {
    if (!currentUserId) return
    supabase
      .from("profiles")
      .select("chat_disabled")
      .eq("id", currentUserId)
      .single()
      .then(({ data }) => { if (data) setMyChatDisabled(!!data.chat_disabled) })
  }, [currentUserId])

  // Fetch opponent chat_disabled and subscribe to live changes
  useEffect(() => {
    if (!resolvedOpponentUserId) return
    let cancelled = false

    supabase
      .from("profiles")
      .select("chat_disabled")
      .eq("id", resolvedOpponentUserId)
      .single()
      .then(({ data }) => { if (!cancelled && data) setOpponentChatDisabled(!!data.chat_disabled) })

    const sub = supabase
      .channel(`chat-status:${resolvedOpponentUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${resolvedOpponentUserId}` },
        (payload) => { if (!cancelled) setOpponentChatDisabled(!!(payload.new as any).chat_disabled) }
      )
      .subscribe()

    return () => { cancelled = true; sub.unsubscribe() }
  }, [resolvedOpponentUserId])

  // Realtime broadcast channel for chat messages (PvP only)
  useEffect(() => {
    if (props.opponentType !== "pvp") return
    if (!gameId) return

    const channel = supabase.channel(`game-chat:${gameId}`)
    chatChannelRef.current = channel

    channel
      .on("broadcast", { event: "chat_message" }, ({ payload }) => {
        const msg = payload as ChatMsg
        if (msg.from !== (human as "W" | "B")) {
          setChatMsgs((prev) => [...prev, msg])
        }
      })
      .subscribe()

    return () => { channel.unsubscribe(); chatChannelRef.current = null }
  }, [props.opponentType, gameId, human])

  function pushChat(from: "W" | "B" | "SYS", text: string) {
    const t = String(text ?? "").trim()
    if (!t) return
    setChatMsgs((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, at: Date.now(), from, text: t }])
  }

  function sendChat() {
    const t = chatInput.trim()
    if (!t || myChatDisabled) return
    const msg: ChatMsg = { id: `${Date.now()}-${Math.random()}`, at: Date.now(), from: human as "W" | "B", text: t }
    setChatMsgs((prev) => [...prev, msg])
    setChatInput("")
    if (props.opponentType === "pvp" && chatChannelRef.current) {
      chatChannelRef.current.send({ type: "broadcast", event: "chat_message", payload: msg })
    }
  }

  async function toggleMyChat() {
    if (!currentUserId) return
    const next = !myChatDisabled
    setMyChatDisabled(next)
    await supabase.from("profiles").update({ chat_disabled: next }).eq("id", currentUserId)
  }

  async function submitReport() {
    if (!currentUserId || !resolvedOpponentUserId || reportSent) return
    await supabase.from("chat_reports").insert({
      game_id: gameId,
      reporter_id: currentUserId,
      reported_user_id: resolvedOpponentUserId,
      chat_log: chatMsgs,
    })
    setReportSent(true)
  }

  // Shared info overlay rendered inside the chat container
  const ChatInfoOverlay = () => (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 10,
        backgroundColor: "rgba(10,10,14,0.97)",
        borderRadius: "inherit",
        padding: "1rem",
        display: "flex", flexDirection: "column", gap: "0.625rem",
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: "0.95rem", color: "#b0aa9e", lineHeight: 1.5,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#b8966a" }}>About Chat</div>
      <p style={{ margin: 0 }}>Chat is <strong style={{ color: "#e8e4d8" }}>local only</strong> — messages are not saved and will disappear when you leave this game.</p>
      <p style={{ margin: 0 }}>If you need to report someone, use the <strong style={{ color: "#e8e4d8" }}>Report</strong> button before leaving. This saves the conversation for admin review.</p>
      <p style={{ margin: 0 }}>You can <strong style={{ color: "#e8e4d8" }}>disable chat</strong> at any time. Your opponent won't know whether it's your choice or a moderation action.</p>
      <button
        onClick={() => setShowChatInfo(false)}
        style={{ marginTop: "auto", background: "none", border: "1px solid rgba(184,150,106,0.4)", borderRadius: 6, color: "#b8966a", fontFamily: "'Cinzel', serif", fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", padding: "6px 12px", cursor: "pointer", alignSelf: "flex-end", position: "sticky", bottom: 0 }}
      >
        Close
      </button>
    </div>
  )

  // ------------------------------------------------------------
  // Skin helpers
  // ------------------------------------------------------------

  // Default styles (mirror DB seeds, used until loadout resolves or when suppressed)
  // Skin styles live in skins.css

  // Who is on which side?
  const mySide: "W" | "B" = props.mySide ?? human ?? "W"

  // Returns the correct route card skin class for a given game side.
  // Your side uses your equipped skin; opponent's side uses theirs.
  const routeClassForSide = (side: "W" | "B") =>
    side === mySide ? myRouteClass : opponentRouteClass

  // Resolve the effective style for each game side (W and B)
  // W tokens use whoever-is-W's WAKE skin, B tokens use whoever-is-B's BRAKE skin
  const effectiveOpponentLoadout = suppressOpponentSkin ? null : opponentLoadout
  const effectiveOpponentIds = suppressOpponentSkin ? null : opponentLoadoutIds

  // Base classes (whatever resolver produced)
  const wTokenClassBase =
    mySide === "W"
      ? (myLoadout?.wakeTokenClass ?? DEFAULT_RESOLVED.wakeTokenClass)
      : (effectiveOpponentLoadout?.wakeTokenClass ?? DEFAULT_RESOLVED.wakeTokenClass)

  const bTokenClassBase =
    mySide === "B"
      ? (myLoadout?.brakeTokenClass ?? DEFAULT_RESOLVED.brakeTokenClass)
      : (effectiveOpponentLoadout?.brakeTokenClass ?? DEFAULT_RESOLVED.brakeTokenClass)

  // Equipped skin IDs for each side
  const wSkinId =
    mySide === "W"
      ? (myLoadoutIds?.wake_token_skin_id ?? null)
      : (effectiveOpponentIds?.wake_token_skin_id ?? null)

  const bSkinId =
    mySide === "B"
      ? (myLoadoutIds?.brake_token_skin_id ?? null)
      : (effectiveOpponentIds?.brake_token_skin_id ?? null)

  // Image URLs pulled from skins table
  const wTokenImg = (wSkinId ? skinImageById[wSkinId] : null) ?? null
  const bTokenImg = (bSkinId ? skinImageById[bSkinId] : null) ?? null

  // Force PNG class if URL exists
  const wTokenClass = wTokenImg ? "skin-token-png-w" : wTokenClassBase
  const bTokenClass = bTokenImg ? "skin-token-png-b" : bTokenClassBase

  const myRouteClass = myLoadout?.routeClass ?? DEFAULT_RESOLVED.routeClass
  const opponentRouteClass = effectiveOpponentLoadout?.routeClass ?? DEFAULT_RESOLVED.routeClass

  const ORDER_COLORS: Record<string, { primary: string; secondary: string }> = {
    dragon:  { primary: "#C1121F", secondary: "#D4AF37" },
    wolf:    { primary: "#0047AB", secondary: "#C0C0C0" },
    serpent: { primary: "#0B0B0B", secondary: "#8C6B3F" },
    spider:  { primary: "#0B0B0B", secondary: "#B11226" },
    raven:   { primary: "#4B2A7A", secondary: "#2B2B2B" },
    kraken:  { primary: "#0B1F3A", secondary: "#F28C28" },
    turtle:  { primary: "#556B2F", secondary: "#8C6B3F" },
    stag:    { primary: "#6B1E2D", secondary: "#1F4D2E" },
    fox:     { primary: "#D35400", secondary: "#F2E6D8" },
  }
  const myOrderColors = userProfile?.order_id ? ORDER_COLORS[userProfile.order_id] : undefined
  const opponentOrderColors = opponentProfile?.order_id ? ORDER_COLORS[opponentProfile.order_id] : undefined
  const activeOrderColors = g.player === human ? myOrderColors : opponentOrderColors

  // W (Wake) player gets inverted dominoes by default: white body, teal accents.
  // If the player has an Order, Order colors override this entirely.
  const W_DEFAULT_COLORS = { primary: "#ffffff", secondary: "#5de8f7" }
  const routeColorsForSide = (side: "W" | "B"): { primary: string; secondary: string } | undefined => {
    // Prefer the equipped skin's style colors — these reflect what the player
    // actually has selected in the skin selector, which may differ from their
    // current order (e.g. a previous order's skin, a purchased skin, etc.)
    const loadoutStyle = side === mySide ? myLoadout?.routeStyle : effectiveOpponentLoadout?.routeStyle
    if (loadoutStyle) return { primary: loadoutStyle.primaryColor, secondary: loadoutStyle.secondaryColor }

    // Only fall back to order colors if the equipped skin is actually an order
    // skin — if the player explicitly picked route-default or another non-order
    // skin, let the W_DEFAULT_COLORS or undefined (B default) apply instead.
    const ids = side === mySide ? myLoadoutIds : opponentLoadoutIds
    const routeSkinId = ids?.route_skin_id ?? ""
    const isOrderSkin = routeSkinId.startsWith("route-order-")
    if (isOrderSkin) {
      const orderColors = side === mySide ? myOrderColors : opponentOrderColors
      if (orderColors) return orderColors
    }

    return side === "W" ? W_DEFAULT_COLORS : undefined
  }
  const routeSkinStyleForSide = (side: "W" | "B"): Record<string, string> | undefined => {
    const ids = side === mySide ? myLoadoutIds : opponentLoadoutIds
    const skinId = ids?.route_skin_id
    if (!skinId) return undefined
    return routeSkinStyles[skinId] ?? undefined
  }
  const activeRouteColors = routeColorsForSide(g.player as "W" | "B")

  const tokenClass = (side: "W" | "B") => (side === "W" ? wTokenClass : bTokenClass)

  // Render-only selection; keeps gameplay selection intact, but lets tutorials/screenshots hide the highlight.
  const selectedTokenIdForRender = hideSelection ? null : selectedTokenId

  // OPTIONAL helper (only needed if your board token element expects per-token vars like --token-img)
  // If you're using page-root vars (--w-token-img/--b-token-img), you can delete tokenVars entirely.
  const tokenVars = (side: "W" | "B") => {
    const url = side === "W" ? wTokenImg : bTokenImg
    return url ? ({ ["--token-img" as any]: `url("${url}")` } as React.CSSProperties) : null
  }

  const mobilePlayerSeparator = "1px solid #b8966a"

  const renderCompactTokenRow = (count: number, side: "W" | "B", label: string) => {
    const visible = Math.min(count, 9)
    const hidden = Math.max(0, count - visible)
    return (
      <div style={{ minHeight: "1.1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.375rem", width: "100%" }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#b8966a", flexShrink: 0 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.125rem", minWidth: 0, flex: 1 }}>
          {Array.from({ length: visible }).map((_, i) => (
            <div
              key={`${label}-${side}-${i}`}
              className={tokenClass(side)}
              style={{ width: "0.52rem", height: "0.52rem", borderRadius: "50%", position: "relative", display: "inline-block", flex: "0 0 auto" }}
            />
          ))}
          {hidden > 0 && (
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.5rem", fontWeight: 700, lineHeight: 1, color: "#b8966a", marginLeft: "0.125rem", flex: "0 0 auto" }}>
              +{hidden}
            </div>
          )}
          {count === 0 && (
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.5rem", fontWeight: 700, lineHeight: 1, color: "#6b6558", flex: "0 0 auto" }}>
              0
            </div>
          )}
        </div>
      </div>
    )
  }

  const getMobileActionItems = (playerAvatar: "W" | "B") => {
    const isCurrentPlayer = g.player === playerAvatar
    return [
      {
        key: "extra",
        label: "Extra Reinforcement",
        enabled: isCurrentPlayer && canBuyExtraReinforcement,
        visible: isCurrentPlayer,
        onSelect: () => canBuyExtraReinforcement && actions.buyExtraReinforcement(),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 640" fill={isCurrentPlayer && canBuyExtraReinforcement ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64z"/></svg>
        ),
      },
      {
        key: "ransom",
        label: "Ransom",
        enabled: isCurrentPlayer && canUseRansom,
        visible: isCurrentPlayer,
        onSelect: () => canUseRansom && actions.useRansom(),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 640" fill={isCurrentPlayer && canUseRansom ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64zM320 130.8L320 508.9C458 442.1 495.1 294.1 496 205.5L320 130.9L320 130.9z"/></svg>
        ),
      },
      {
        key: "earlySwap",
        label: "Early Swap",
        enabled: isCurrentPlayer && canEarlySwap,
        visible: isCurrentPlayer,
        onSelect: () => canEarlySwap && actions.armEarlySwap(),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 640" fill={isCurrentPlayer && canEarlySwap ? "#ee484c" : "#6b6558"}><path d="M576 160C576 210.2 516.9 285.1 491.4 315C487.6 319.4 482 321.1 476.9 320L384 320C366.3 320 352 334.3 352 352C352 369.7 366.3 384 384 384L480 384C533 384 576 427 576 480C576 533 533 576 480 576L203.6 576C212.3 566.1 222.9 553.4 233.6 539.2C239.9 530.8 246.4 521.6 252.6 512L480 512C497.7 512 512 497.7 512 480C512 462.3 497.7 448 480 448L384 448C331 448 288 405 288 352C288 299 331 256 384 256L423.8 256C402.8 224.5 384 188.3 384 160C384 107 427 64 480 64C533 64 576 107 576 160zM181.1 553.1C177.3 557.4 173.9 561.2 171 564.4L169.2 566.4L169 566.2C163 570.8 154.4 570.2 149 564.4C123.8 537 64 466.5 64 416C64 363 107 320 160 320C213 320 256 363 256 416C256 446 234.9 483 212.5 513.9C201.8 528.6 190.8 541.9 181.7 552.4L181.1 553.1zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM480 192C497.7 192 512 177.7 512 160C512 142.3 497.7 128 480 128C462.3 128 448 142.3 448 160C448 177.7 462.3 192 480 192z"/></svg>
        ),
      },
      {
        key: "defection",
        label: "Defection",
        enabled: isCurrentPlayer && canUseDefection,
        visible: isCurrentPlayer,
        onSelect: () => canUseDefection && actions.armDefection(),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 640" fill={isCurrentPlayer && canUseDefection ? "#ee484c" : "#6b6558"}><path d="M512 320C512 214 426 128 320 128L320 512C426 512 512 426 512 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg>
        ),
      },
      {
        key: "recoil",
        label: "Recoil",
        enabled: !isCurrentPlayer && canUseRecoil,
        visible: !isCurrentPlayer,
        onSelect: () => canUseRecoil && actions.armRecoil(),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 640" fill={!isCurrentPlayer && canUseRecoil ? "#ee484c" : "#6b6558"}><path d="M168.1 531.1L156.9 540.1C153.7 542.6 149.8 544 145.8 544C136 544 128 536 128 526.2L128 256C128 150 214 64 320 64C426 64 512 150 512 256L512 526.2C512 536 504 544 494.2 544C490.2 544 486.3 542.6 483.1 540.1L471.9 531.1C458.5 520.4 439.1 522.1 427.8 535L397.3 570C394 573.8 389.1 576 384 576C378.9 576 374.1 573.8 370.7 570L344.1 539.5C331.4 524.9 308.7 524.9 295.9 539.5L269.3 570C266 573.8 261.1 576 256 576C250.9 576 246.1 573.8 242.7 570L212.2 535C200.9 522.1 181.5 520.4 168.1 531.1zM288 256C288 238.3 273.7 224 256 224C238.3 224 224 238.3 224 256C224 273.7 238.3 288 256 288C273.7 288 288 273.7 288 256zM384 288C401.7 288 416 273.7 416 256C416 238.3 401.7 224 384 224C366.3 224 352 238.3 352 256C352 273.7 366.3 288 384 288z"/></svg>
        ),
      },
    ].filter((item) => item.visible)
  }

  const renderMobileActionIcons = (playerAvatar: "W" | "B") => {
    const actionItems = getMobileActionItems(playerAvatar)

    return (
      <button
        type="button"
        onClick={() => setMobileActionPickerSide(playerAvatar)}
        title="Open action picker"
        style={{ minHeight: "1.1rem", display: "flex", alignItems: "center", justifyContent: g.player === playerAvatar ? "space-evenly" : "flex-end", gap: g.player === playerAvatar ? "0.2rem" : "0.3rem", width: "100%", flexWrap: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        {actionItems.map((item) => (
          <span key={item.key} className="vk-tooltip-wrap" style={{ display: "inline-flex", opacity: item.enabled ? 1 : 0.5 }}>
            <span className="vk-tooltip">{item.label}</span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{item.icon}</span>
          </span>
        ))}
        <span className="vk-tooltip-wrap" style={{ display: "inline-flex" }}>
          <span className="vk-tooltip">Help</span>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#b8966a" }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 640 640" fill="#b8966a"><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"/></svg></span>
        </span>
      </button>
    )
  }


  const renderMobilePlayerPanel = ({ player, measureIdx, captiveCount, captiveTokenSide, showGear = false, borderPosition = "bottom" }: { player: typeof topPlayer; measureIdx: number; captiveCount: number; captiveTokenSide: "W" | "B"; showGear?: boolean; borderPosition?: "top" | "bottom" }) => {
    const side = player.avatar as "W" | "B"
    const infoExpanded = !!mobilePlayerInfoExpanded[side]

    return (
      <div style={{ padding: "0.3rem 0.375rem 0.35rem", backgroundColor: "rgba(184,150,106,0.18)", [borderPosition === "top" ? "borderTop" : "borderBottom"]: "1px solid rgba(184,150,106,0.30)", flexShrink: 0 } as React.CSSProperties}>
        <div style={{ width: "100%", minWidth: 0, display: "grid", gridTemplateColumns: infoExpanded ? "minmax(0, 1fr) auto" : "auto minmax(0, 1fr) auto", alignItems: "stretch", columnGap: "0.375rem" }}>
          <div style={{ minWidth: 0, display: "grid", gridTemplateColumns: infoExpanded ? "auto minmax(0, 1fr)" : "auto", alignItems: "center", columnGap: "0.375rem", paddingLeft: "0.375rem", paddingRight: infoExpanded ? "0.375rem" : "0.75rem", borderRight: mobilePlayerSeparator, borderImage: "linear-gradient(180deg, transparent, #b8966a, transparent) 1" }}>
            <button
              onClick={() => setMobilePlayerInfoExpanded((prev) => ({ ...prev, [side]: !prev[side] }))}
              title={infoExpanded ? "Collapse player info" : "Expand player info"}
              aria-expanded={infoExpanded}
              style={{
                width: "2.25rem",
                height: "2.25rem",
                borderRadius: "50%",
                backgroundColor: "#b0aa9e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.125rem",
                fontWeight: "bold",
                color: "#0d0d10",
                overflow: "hidden",
                flexShrink: 0,
                border: infoExpanded ? "1px solid rgba(184,150,106,0.6)" : "1px solid rgba(184,150,106,0.35)",
                padding: 0,
                cursor: "pointer",
              }}
            >
              {player.avatar_url ? (<img src={player.avatar_url} alt={player.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />) : player.avatar}
            </button>
            {infoExpanded && (
              <div style={{ minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gridTemplateRows: "repeat(3, minmax(0, auto))", columnGap: "0.375rem", rowGap: "0.14rem", alignItems: "center" }}>
                <span onClick={() => { if (player.username && player.username !== "You") { window.location.assign(`/u/${encodeURIComponent(player.username)}`) } }} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: "0.8rem", color: "#e8e4d8", cursor: player.username && player.username !== "You" ? "pointer" : "default" }}>{player.username}</span>
                <div style={{ display: "flex", justifyContent: g.player === leftPlayer.avatar ? "space-between" : "flex-end", alignItems: "center", minWidth: 0 }}>
                  {showGear ? <button onClick={() => setSkinsOpen(true)} title="Customize appearance" style={{ background: "none", border: "none", cursor: "pointer", color: "#6b6558", padding: "1px 2px", display: "flex", alignItems: "center", opacity: 0.7, flex: "0 0 auto" }}><GearIcon /></button> : <span style={{ width: 16, display: "inline-block" }} />}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", minWidth: 0, overflow: "hidden" }}>
                  <FlagImg cc={player.country} size={14} />
                </div>
                <span style={{ fontWeight: 900, color: eloColor(player.elo), fontSize: "0.72rem", justifySelf: "end", whiteSpace: "nowrap" }}>{player.elo}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", minWidth: 0 }}>
                  <div className={tokenClass(side)} style={{ width: "0.65rem", height: "0.65rem", borderRadius: "50%", position: "relative", flex: "0 0 auto" }} />
                </div>
                <span style={{ color: "#b0aa9e", fontSize: "0.75rem", justifySelf: "end", whiteSpace: "nowrap" }}>{side === "W" ? "Wake" : "Brake"}</span>
              </div>
            )}
          </div>
          {!infoExpanded && (
            <div style={{ minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "stretch", gap: "0.25rem", paddingLeft: "0.375rem", paddingRight: "0.375rem", borderRight: mobilePlayerSeparator, borderImage: "linear-gradient(180deg, transparent, #b8966a, transparent) 1" }}>
              {/* R/C Panel */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center", gap: "0.45rem", paddingRight: "0.375rem", borderRight: mobilePlayerSeparator, borderImage: "linear-gradient(180deg, transparent, #b8966a, transparent) 1" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", textAlign: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 11, color: "#b8966a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    R <div className={tokenClass(side)} style={{ width: "0.6rem", height: "0.6rem", borderRadius: "50%", position: "relative", flexShrink: 0 }} />
                  </span>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: 11, color: "#b8966a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    C <div className={tokenClass(captiveTokenSide)} style={{ width: "0.6rem", height: "0.6rem", borderRadius: "50%", position: "relative", flexShrink: 0 }} />
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", textAlign: "center" }}>
                  <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: "2rem", color: "#e8e4d8", lineHeight: 1 }}>{g.reserves[side]}</span>
                  <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: "2rem", color: "#e8e4d8", lineHeight: 1 }}>{captiveCount}</span>
                </div>
              </div>
              {/* SA Icons Panel */}
              <button
                type="button"
                onClick={() => setMobileActionPickerSide(side)}
                title="Open action picker"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", padding: "0.2rem", cursor: "pointer", width: "100%", minHeight: 0 }}
              >
                {g.player === side ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 0, width: "100%", height: "100%", flex: 1, fontSize: "1.5rem" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: canBuyExtraReinforcement ? 1 : 0.38, padding: "0.25rem" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 640 640" fill={canBuyExtraReinforcement ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64z"/></svg>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: canEarlySwap ? 1 : 0.38, padding: "0.25rem" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 640 640" fill={canEarlySwap ? "#ee484c" : "#6b6558"}><path d="M576 160C576 210.2 516.9 285.1 491.4 315C487.6 319.4 482 321.1 476.9 320L384 320C366.3 320 352 334.3 352 352C352 369.7 366.3 384 384 384L480 384C533 384 576 427 576 480C576 533 533 576 480 576L203.6 576C212.3 566.1 222.9 553.4 233.6 539.2C239.9 530.8 246.4 521.6 252.6 512L480 512C497.7 512 512 497.7 512 480C512 462.3 497.7 448 480 448L384 448C331 448 288 405 288 352C288 299 331 256 384 256L423.8 256C402.8 224.5 384 188.3 384 160C384 107 427 64 480 64C533 64 576 107 576 160zM181.1 553.1C177.3 557.4 173.9 561.2 171 564.4L169.2 566.4L169 566.2C163 570.8 154.4 570.2 149 564.4C123.8 537 64 466.5 64 416C64 363 107 320 160 320C213 320 256 363 256 416C256 446 234.9 483 212.5 513.9C201.8 528.6 190.8 541.9 181.7 552.4L181.1 553.1zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM480 192C497.7 192 512 177.7 512 160C512 142.3 497.7 128 480 128C462.3 128 448 142.3 448 160C448 177.7 462.3 192 480 192z"/></svg>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: canUseRansom ? 1 : 0.38, padding: "0.25rem" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 640 640" fill={canUseRansom ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64zM320 130.8L320 508.9C458 442.1 495.1 294.1 496 205.5L320 130.9L320 130.9z"/></svg>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: canUseDefection ? 1 : 0.38, padding: "0.25rem" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 640 640" fill={canUseDefection ? "#ee484c" : "#6b6558"}><path d="M512 320C512 214 426 128 320 128L320 512C426 512 512 426 512 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg>
                    </span>
                  </div>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: canUseRecoil ? 1 : 0.38, width: "100%", height: "100%", flex: 1, fontSize: "2rem" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 640 640" fill={canUseRecoil ? "#ee484c" : "#6b6558"}><path d="M168.1 531.1L156.9 540.1C153.7 542.6 149.8 544 145.8 544C136 544 128 536 128 526.2L128 256C128 150 214 64 320 64C426 64 512 150 512 256L512 526.2C512 536 504 544 494.2 544C490.2 544 486.3 542.6 483.1 540.1L471.9 531.1C458.5 520.4 439.1 522.1 427.8 535L397.3 570C394 573.8 389.1 576 384 576C378.9 576 374.1 573.8 370.7 570L344.1 539.5C331.4 524.9 308.7 524.9 295.9 539.5L269.3 570C266 573.8 261.1 576 256 576C250.9 576 246.1 573.8 242.7 570L212.2 535C200.9 522.1 181.5 520.4 168.1 531.1zM288 256C288 238.3 273.7 224 256 224C238.3 224 224 238.3 224 256C224 273.7 238.3 288 256 288C273.7 288 288 273.7 288 256zM384 288C401.7 288 416 273.7 416 256C416 238.3 401.7 224 384 224C366.3 224 352 238.3 352 256C352 273.7 366.3 288 384 288z"/></svg>
                  </span>
                )}
              </button>
            </div>
          )}
          <div ref={setRouteMeasureEl(measureIdx)} style={{ minWidth: 0, display: "flex", gap: "0.25rem", justifyContent: g.player === rightPlayer.avatar ? "space-between" : "flex-end", alignItems: "center", paddingLeft: "0.125rem" }}>
            {g.routes[side].slice(0, 3).map((r) => {
              const isActive = g.player === player.avatar
              const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
              const isSelected = g.pendingSwap.handRouteId === r.id
              return (
                <RouteIcon
                  key={r.id}
                  route={r}
                  primaryColor={routeColorsForSide(side)?.primary}
                  secondaryColor={routeColorsForSide(side)?.secondary}
                  skinStyle={routeSkinStyleForSide(side)}
                  onClick={() => isActive && !used && actions.playRoute(side, r.id)}
                  selected={isSelected}
                  routeClass={routeClassForSide(side)}
                  style={{ width: routeDominoW ?? "3rem", alignSelf: "center", flex: "0 0 auto", minWidth: 0, aspectRatio: "7/13", cursor: isActive && !used ? "pointer" : "default", opacity: used ? 0.3 : 1 }}
                />
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ErrBoundary>
      <style>{`
        
  .vk-tooltip-wrap { position: relative; display: inline-flex; }
  .vk-tooltip-wrap .vk-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #0d0d10;
    border: 1px solid rgba(184,150,106,0.40);
    color: #e8e4d8;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 9999;
  }
  .vk-tooltip-wrap:hover .vk-tooltip { display: block; }

  @keyframes confirm-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(50,150,171,0);
            background: rgba(184,150,106,0.18);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(50,150,171,0.35);
            background: rgba(50,150,171,0.28);
          }
        }
      `}</style>
      <SkinsModal isOpen={skinsOpen} onClose={() => setSkinsOpen(false)} onLoadoutChange={reloadMyLoadout} />
      <div
        style={{
          // FORCE full viewport, regardless of any global centering/max-width rules.
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",

          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0c",
          fontFamily: "'EB Garamond', Georgia, serif",
          color: "#b8966a",
          overflow: "hidden",
          ...(wTokenImg ? ({ ["--w-token-img" as any]: `url("${wTokenImg}")` } as any) : {}),
          ...(bTokenImg ? ({ ["--b-token-img" as any]: `url("${bTokenImg}")` } as any) : {}),
        }}
      >
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; background: #0a0a0c; }
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');
          .token-ghost { opacity: 0.3; }
          .hide-scrollbar::-webkit-scrollbar { display: none; }
          .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        `}</style>

        <Header
          isLoggedIn={!!currentUserId}
          userId={currentUserId}
          username={userProfile?.username}
          avatarUrl={userProfile?.avatar_url ?? null}
          titleLabel={formatLabel}
          elo={myElo}
          activePage="play"
          myGamesTurnCount={0}
          onSignIn={() => setShowAuthModal(true)}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenSkins={() => setSkinsOpen(true)}
          onSignOut={async () => { await supabase.auth.signOut() }}
          onPlay={() => { setNewGameOpen(true); setNewGameMsg(null); playTheme() }}
          onMyGames={() => navigate("/my-games")}
          onLeaderboard={() => navigate("/leaderboard")}
          onChallenges={() => navigate("/challenges")}
          onRules={() => navigate("/rules")}
          onTutorial={() => navigate("/tutorial")}
        />

        {props.puzzleBanner}

        {newGameOpen && (
          <NewGameModal
            isOpen={newGameOpen}
            onClose={() => { setNewGameOpen(false); setNewGameMsg(null); stopTheme() }}
            timeControlId={timeControlId}
            aiDifficulty={aiDifficulty}
            boardStyle={boardStyle}
            loginWarn={loginWarn}
            newGameMsg={newGameMsg}
            onSetTimeControlId={(id) => actions.setTimeControlId(id)}
            onSetAiDifficulty={(d) => actions.setAiDifficulty(d as any)}
            onSetBoardStyle={setBoardStyle}
            onStartGame={async () => {
              try {
                await actions.unlockAudio?.()
                if (!currentUserId) { setNewGameMsg("You must be logged in to start a new game."); return }
                setNewGameMsg(null)
                await createAiGameAndGo()
              } catch (err) {
                const resp = err && typeof err === "object" && "context" in err
                  ? ((err as any).context as Response | undefined) : undefined
                if (resp) {
                  try { const bodyText = await resp.text(); if (bodyText) { setNewGameMsg(bodyText); return } } catch {}
                }
                setNewGameMsg(err instanceof Error ? err.message : "Failed to create AI game.")
              }
            }}
            onSignIn={() => setShowAuthModal(true)}
            onTutorial={() => navigate("/tutorial")}
            isMuted={themeMuted}
            onToggleMute={() => {
              const next = !themeMuted
              setThemeMuted(next)
              sounds.theme.mute(next)
            }}
          />
        )}

        {isMobile ? (
          /* ===== MOBILE LAYOUT ===== */
          <>
            {/* Scrollable Content Area */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                paddingBottom: !props.puzzleMode
                  ? "calc(12rem + env(safe-area-inset-bottom, 0px))"
                  : "6rem",
              }}
              className="hide-scrollbar"
            >
              {/* White Player */}
              {renderMobilePlayerPanel({
                player: topPlayer,
                measureIdx: 0,
                captiveCount: g.captives[topPlayer.avatar === "W" ? "W" : "B"],
                captiveTokenSide: topPlayer.avatar === "W" ? "B" : "W",
              })}

              {/* Mobile header: compact active clock + phase/action area */}
              <div style={{ paddingTop: 6 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(5.5rem, 22%) minmax(0, 1fr)",
                    gap: 6,
                    alignItems: "stretch",
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "rgba(184,150,106,0.18)",
                      border: "1px solid rgba(184,150,106,0.30)",
                      borderRadius: 6,
                      padding: "5px 6px",
                      display: "grid",
                      gridTemplateRows: "auto auto",
                      alignContent: "center",
                      minHeight: 56,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Cinzel', serif",
                        fontSize: "1.3rem",
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        lineHeight: 1,
                        color: g.player === "W" ? "#e8e4d8" : "#5de8f7",
                        whiteSpace: "nowrap",
                        textAlign: "center",
                      }}
                    >
                      {fmtClock(clocks[g.player as "W" | "B"])}
                    </div>
                    <div
                      style={{
                        marginTop: "0.2rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.2rem",
                        fontFamily: "'Cinzel', serif",
                        fontSize: "0.65rem",
                        letterSpacing: "0.1em",
                        color: "#b0aa9e",
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ color: g.player === "W" ? "#e8e4d8" : "#5de8f7" }}>{g.player}</span>
                      <span>{formatLabel}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>

                    {/* Confirmation buttons — replaces the instruction bar entirely when active */}
                    {defectionArmed && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => actions.cancelDefection()} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite" }}>Cancel Defection</button>
                      </div>
                    )}
                    {!defectionArmed && g.phase === "MULLIGAN" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {mulliganHelpOpen && (
                          <MulliganHelpModal onClose={() => setMulliganHelpOpen(false)} />
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          {(g as any).mulliganReady?.[human] ? (
                            <div style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.30)", background: "rgba(255,255,255,0.03)", textAlign: "center", fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.08em", color: "#b0aa9e", display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for opponent...</div>
                          ) : mulliganArmed ? (
                            <>
                              <div style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(93,232,247,0.4)", background: "rgba(93,232,247,0.07)", fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: "0.08em", color: "#b8966a", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>Select a token on the board</div>
                              <button onClick={() => (actions as any).cancelMulligan?.()} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 11, cursor: "pointer", color: "#b0aa9e", fontFamily: "'Cinzel', serif" }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => (actions as any).armMulligan?.(human)} disabled={(g as any).mulliganCount?.[human] >= 2} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.50)", background: "rgba(184,150,106,0.12)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: (g as any).mulliganCount?.[human] >= 2 ? "default" : "pointer", color: (g as any).mulliganCount?.[human] >= 2 ? "#6b6558" : "#e8e4d8", opacity: (g as any).mulliganCount?.[human] >= 2 ? 0.4 : 1, animation: (g as any).mulliganCount?.[human] >= 2 ? "none" : "confirm-pulse 1.4s ease-in-out infinite" }}>Mulligan{(g as any).mulliganCount?.[human] > 0 ? ` (${(g as any).mulliganCount?.[human]}/2)` : ""}</button>
                              <button onClick={() => (actions as any).passMulligan?.(human)} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite" }}>Continue →</button>
                              <button onClick={() => setMulliganHelpOpen(v => !v)} title="What is a Mulligan?" style={{ width: 36, minHeight: 56, borderRadius: 6, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", cursor: "pointer", color: mulliganHelpOpen ? "#e8e4d8" : "#6b6558", fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {!recoilArmed && !defectionArmed && allRoutesUsed && g.phase === "ACTION" && g.player === human && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => actions.advanceFromAction()} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite" }}>Finish actions and proceed to reinforcements</button>
                      </div>
                    )}
                    {!recoilArmed && g.player === human && g.phase === "SWAP" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => actions.confirmSwapAndEndTurn()} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite" }}>Make route swap and confirm</button>
                      </div>
                    )}
                    {!recoilArmed && g.player === human && g.phase === "ACTION" && earlySwapArmed && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => actions.confirmEarlySwap()} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite" }}>Confirm Early Swap</button>
                        <button onClick={() => actions.cancelEarlySwap()} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 11, cursor: "pointer", color: "#e8e4d8", fontFamily: "'Cinzel', serif" }}>Cancel</button>
                      </div>
                    )}
                    {recoilArmed && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => actions.confirmRecoil()} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite" }}>Select unit and grid space, confirm recoil</button>
                        <button onClick={() => actions.cancelRecoil()} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 11, cursor: "pointer", color: "#e8e4d8", fontFamily: "'Cinzel', serif" }}>Cancel</button>
                      </div>
                    )}
                    {forcedYieldAvailable && g.player === human && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => actions.yieldForced()} style={{ flex: 1, minWidth: 0, minHeight: 56, padding: "6px 10px", borderRadius: 6, border: "2px solid #6b7280", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite" }}>No usable routes — Yield {remainingRoutes.length} to Void</button>
                      </div>
                    )}

                    {/* Phase bar — only shown when no confirmation is pending */}
                    {!defectionArmed && g.phase !== "MULLIGAN" && !(allRoutesUsed && g.phase === "ACTION" && g.player === human && !recoilArmed && !defectionArmed) && !(g.phase === "SWAP" && g.player === human && !recoilArmed) && !(g.phase === "ACTION" && earlySwapArmed && g.player === human && !recoilArmed) && !recoilArmed && !(forcedYieldAvailable && g.player === human) && (
                    <div
                      style={{
                        background: g.player === human
                          ? (g.player === "W" ? "rgba(232,228,216,0.10)" : "rgba(93,232,247,0.10)")
                          : "rgba(255,255,255,0.03)",
                        border: g.player === human
                          ? (g.player === "W" ? "1px solid rgba(232,228,216,0.25)" : "1px solid rgba(93,232,247,0.25)")
                          : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        minHeight: 56,
                        display: "grid",
                        gridTemplateRows: "auto auto",
                        alignContent: "center",
                        gap: 3,
                      }}
                    >
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.5rem", letterSpacing: "0.18em", textTransform: "uppercase", color: g.player === human ? (g.player === "W" ? "rgba(232,228,216,0.55)" : "rgba(93,232,247,0.55)") : "#6b6558", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {g.player === human ? `${g.player} · ${g.phase}` : "Opponent's Turn"}
                      </div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.03em", color: g.player === human ? (g.player === "W" ? "#e8e4d8" : "#5de8f7") : "#6b6558", lineHeight: 1.2, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        {g.player !== human
                          ? "Waiting for opponent..."
                          : g.phase === "ACTION" ? "Make your moves"
                          : g.phase === "REINFORCE"
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
                                Place {g.reinforcementsToPlace} reinforcement{g.reinforcementsToPlace !== 1 ? "s" : ""}
                                {Array.from({ length: g.reinforcementsToPlace }).map((_, i) => (
                                  <div key={i} className={tokenClass(g.player as "W" | "B")} style={{ width: 7, height: 7, borderRadius: "50%", position: "relative" }} />
                                ))}
                              </span>
                          : "Place opening tokens"}
                        {g.warning && (
                          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 9, color: "#ef4444", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {g.warning}
                          </span>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              </div>

                  {/* Info Row - latest log and resign (won't move) */}
                  <div
                    style={{
                      fontSize: 11,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#b0aa9e",
                      paddingLeft: 6,
                      paddingRight: 6,
                    }}
                  >
                    {g.log.length === 0 ? (
                      <div style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}>
                        No moves yet
                      </div>
                    ) : (
                      <div
                        key={g.log[0]}
                        style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}
                      >
                        {g.log[0].replace(/==/g, '').trim()}
                      </div>
                    )}
                    <button
                      onClick={() => actions.resign()}
                      disabled={!started || !!g.gameOver}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ee484c",
                        fontSize: 11,
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 900,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        opacity: (!started || !!g.gameOver) ? 0.5 : 1,
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 640 640" fill="#ee484c">
                        <path d="M480 208C480 128.5 408.4 64 320 64C231.6 64 160 128.5 160 208C160 255.1 185.1 296.9 224 323.2L224 352C224 369.7 238.3 384 256 384L384 384C401.7 384 416 369.7 416 352L416 323.2C454.9 296.9 480 255.1 480 208zM256 192C273.7 192 288 206.3 288 224C288 241.7 273.7 256 256 256C238.3 256 224 241.7 224 224C224 206.3 238.3 192 256 192zM352 224C352 206.3 366.3 192 384 192C401.7 192 416 206.3 416 224C416 241.7 401.7 256 384 256C366.3 256 352 241.7 352 224zM541.5 403.7C534.7 387.4 516 379.7 499.7 386.5L320 461.3L140.3 386.5C124 379.7 105.3 387.4 98.5 403.7C91.7 420 99.4 438.7 115.7 445.5L236.8 496L115.7 546.5C99.4 553.3 91.7 572 98.5 588.3C105.3 604.6 124 612.3 140.3 605.5L320 530.7L499.7 605.5C516 612.3 534.7 604.6 541.5 588.3C548.3 572 540.6 553.3 524.3 546.5L403.2 496L524.3 445.5C540.6 438.7 548.3 420 541.5 403.7z"/>
                      </svg>
                      <span>Resign</span>
                    </button>
                  </div>

              {/* Board + Route Queue + Void */}
              <div
                style={{
                  display: "flex",
                  gap: "0.25rem",
                  padding: "0.5rem 0.1875rem",
                  backgroundColor: "rgba(184,150,106,0.18)",
                  flexShrink: 0,
                  alignItems: "stretch",
                  overflow: "hidden",
                }}
              >
                {/* Left utility column: Route Queue over Void */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: "minmax(0, 0.62fr) minmax(0, 0.38fr)",
                    gap: "0.375rem",
                    flexShrink: 0,
                    
                    minWidth: mobileUtilityColW,
                    maxWidth: mobileUtilityColW,
                    height: mobileBoardHeight != null ? `${mobileBoardHeight}px` : undefined,
                    alignSelf: "stretch",
                  }}
                >
                  {/* Top: Route Queue */}
                  <div
                    style={{
                      backgroundColor: "rgba(184,150,106,0.18)",
                      border: "1px solid rgba(184,150,106,0.30)",
                      color: "#e8e4d8",
                      padding: "0.375rem 0.25rem",
                      borderRadius: "0.5rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: 0,
                      alignItems: "center",
                      justifyContent: "space-evenly",
                      overflow: "hidden",
                      boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      minHeight: 0,
                    }}
                  >
                    <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#b8966a" }}>Q</div>
                    {g.queue.map((r, idx) => (
                      <RouteIcon
                        key={`${r.id}-${idx}`}
                        route={r}
                        primaryColor={activeRouteColors?.primary}
                        secondaryColor={activeRouteColors?.secondary}
                        skinStyle={routeSkinStyleForSide(g.player as "W" | "B")}
                        onClick={() => canPickQueueForSwap && actions.pickQueueIndex(idx)}
                        selected={canPickQueueForSwap && g.pendingSwap.queueIndex === idx}
                        routeClass={routeClassForSide(bottomPlayer.avatar as "W" | "B")}
                        style={{
                          ...(queueRouteDominoW != null ? { width: queueRouteDominoW } : { width: "100%" }),
                          alignSelf: "center",
                          flex: "0 0 auto",
                          aspectRatio: "7/13",
                          maxWidth: "100%",
                          cursor: canPickQueueForSwap ? "pointer" : "default",
                          verticalAlign: "top",
                          marginTop: 0,
                          marginBottom: 0,
                        }}
                      />
                    ))}
                  </div>

                  {/* Bottom: Void */}
                  <div
                    style={{
                      backgroundColor: "rgba(184,150,106,0.18)",
                      border: "1px solid rgba(184,150,106,0.30)",
                      color: "#e8e4d8",
                      padding: "0.375rem 0.25rem",
                      borderRadius: "0.5rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.2rem",
                      overflow: "hidden",
                      boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      minHeight: 0,
                    }}
                  >
                    <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: "0.6rem", color: "#b8966a", letterSpacing: "0.15em", textTransform: "uppercase", textAlign: "center" }}>V</span>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.1rem", padding: "0.25rem 0" }}>
                      <div className={tokenClass("B")} style={{ width: "0.6rem", height: "0.6rem", borderRadius: "50%", position: "relative" }} />
                      <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: "1.9rem", color: "#e8e4d8", lineHeight: 1, textAlign: "center" }}>{g.void.B}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.1rem", padding: "0.25rem 0" }}>
                      <div className={tokenClass("W")} style={{ width: "0.6rem", height: "0.6rem", borderRadius: "50%", position: "relative" }} />
                      <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, fontSize: "1.9rem", color: "#e8e4d8", lineHeight: 1, textAlign: "center" }}>{g.void.W}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Board */}
                <div
                  ref={mobileBoardMeasureRef}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    display: "flex",
                    alignItems: "stretch",
                    justifyContent: "center",
                    overflow: "hidden",
                    flex: 1, minWidth: 0, minWidth: 0,
                    margin: "0 auto",
                  }}
                >
                  {boardStyle === "grid" ? (
                    <GridBoard
                      boardMap={boardMap}
                      selectedTokenId={selectedTokenIdForRender}
                      ghost={ghost}
                      started={started}
                      phase={g.phase}
                      onSquareClick={actions.onSquareClick}
                      GHOST_MS={GHOST_MS}
                      mobile={true}
                      recoilSourcePos={recoilSourcePos}
                      recoilDestPos={pendingRecoil?.to ?? null}
                      recoilPlayer={recoilPlayer}
                      defectionArmed={defectionArmed}
                      defectionPlayer={defectionArmed ? g.player : null}
                      tokenClass={tokenClass}
                      boardSkinStyle={boardSkinStyle}
                    />
                  ) : (
                    <IntersectionBoard
                      boardMap={boardMap}
                      selectedTokenId={selectedTokenIdForRender}
                      ghost={ghost}
                      started={started}
                      phase={g.phase}
                      onSquareClick={actions.onSquareClick}
                      GHOST_MS={GHOST_MS}
                      mobile={true}
                      dotColor={myOrderColors?.primary ?? "#ee484c"}
                      recoilSourcePos={recoilSourcePos}
                      recoilDestPos={pendingRecoil?.to ?? null}
                      recoilPlayer={recoilPlayer}
                      defectionArmed={defectionArmed}
                      defectionPlayer={defectionArmed ? g.player : null}
                      tokenClass={tokenClass}
                    />
                  )}
                </div>
              </div>

              {/* Board style instruction + hide highlight */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", width: "100%" }}>
                <button
                    onClick={() => setBoardStyle(prev => prev === "grid" ? "intersection" : "grid")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#b8966a",
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: "'Cinzel', serif",
                      fontSize: 10,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                    }}
                  >
                    Switch Board Style
                  </button>
                <button
                  onClick={() => setHideSelection((v) => !v)}
                  disabled={!started}
                  title="Hide/show selected token highlight (H toggles, Esc hides)"
                  style={{ background: "none", border: "none", color: hideSelection ? "#b8966a" : "#6b6558", fontSize: 10, cursor: started ? "pointer" : "default", padding: 0, fontFamily: "'Cinzel', serif", letterSpacing: "0.15em", display: "flex", alignItems: "center", gap: 4, opacity: started ? 1 : 0.5 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 640 640" fill={hideSelection ? "#b8966a" : "#6b6558"}>
                    <path d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"/>
                  </svg>
                  <span>{hideSelection ? "Show Grid Highlight" : "Hide Grid Highlight"}</span>
                </button>
              </div>

              {/* Blue Player */}
              {renderMobilePlayerPanel({
                player: bottomPlayer,
                measureIdx: 1,
                captiveCount: g.captives[bottomPlayer.avatar as "W" | "B"],
                captiveTokenSide: bottomPlayer.avatar === "W" ? "B" : "W",
                showGear: true,
                borderPosition: "top",
              })}

              {/* Mobile Bottom Panel Launcher */}
              {!props.puzzleMode && (
                <>
                  <div
                    style={{
                      position: "fixed",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 25,
                      backgroundColor: "#0d0d10",
                      borderTop: "1px solid rgba(184,150,106,0.30)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      padding: "0.375rem 0.5rem",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                      <button
                        onClick={() => { setMobileBottomTab("chat"); setShowMobileBottomModal(true) }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#b8966a",
                          cursor: "pointer",
                          padding: 0,
                          fontFamily: "'Cinzel', serif",
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: "0.2em",
                          textTransform: "uppercase",
                          lineHeight: "1",
                        }}
                      >
                        Chat
                      </button>
                      <span style={{ color: "rgba(184,150,106,0.35)" }}>|</span>
                      <button
                        onClick={() => { setMobileBottomTab("log"); setShowMobileBottomModal(true) }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#b8966a",
                          cursor: "pointer",
                          padding: 0,
                          fontFamily: "'Cinzel', serif",
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: "0.2em",
                          textTransform: "uppercase",
                          lineHeight: "1",
                        }}
                      >
                        Log
                      </button>
                    </div>

                    <button
                      onClick={() => { setMobileBottomTab("chat"); setShowMobileBottomModal(true); setShowChatInfo(true) }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#b8966a",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                      aria-label="Chat info"
                      title="Chat info"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="#b8966a">
                        <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"/>
                      </svg>
                    </button>
                  </div>

                  {showMobileBottomModal && (
                    <div
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 1200,
                        backgroundColor: "rgba(0,0,0,0.72)",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "stretch",
                      }}
                      onClick={() => { setShowMobileBottomModal(false); setShowChatInfo(false) }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "min(72vh, 34rem)",
                          backgroundColor: "#0d0d10",
                          borderTopLeftRadius: 14,
                          borderTopRightRadius: 14,
                          borderTop: "1px solid rgba(184,150,106,0.30)",
                          boxShadow: "0 -10px 30px rgba(0,0,0,0.45)",
                          display: "flex",
                          flexDirection: "column",
                          overflow: "hidden",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          onClick={() => { setShowMobileBottomModal(false); setShowChatInfo(false) }}
                          style={{
                            padding: "0.5rem 0.75rem",
                            fontFamily: "'Cinzel', serif",
                            fontWeight: 600,
                            fontSize: 11,
                            letterSpacing: "0.2em",
                            textTransform: "uppercase",
                            color: "#b8966a",
                            backgroundColor: "#0d0d10",
                            borderBottom: "1px solid rgba(184,150,106,0.30)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexShrink: 0,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setMobileBottomTab("chat") }}
                              style={{
                                background: "none",
                                border: "none",
                                color: mobileBottomTab === "chat" ? "#b8966a" : "#b0aa9e",
                                cursor: "pointer",
                                padding: 0,
                                fontFamily: "'Cinzel', serif",
                                fontWeight: 600,
                                fontSize: 11,
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                                lineHeight: "1",
                              }}
                            >
                              Chat
                            </button>
                            <span style={{ color: "rgba(184,150,106,0.35)" }}>|</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setMobileBottomTab("log") }}
                              style={{
                                background: "none",
                                border: "none",
                                color: mobileBottomTab === "log" ? "#b8966a" : "#b0aa9e",
                                cursor: "pointer",
                                padding: 0,
                                fontFamily: "'Cinzel', serif",
                                fontWeight: 600,
                                fontSize: 11,
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                                lineHeight: "1",
                              }}
                            >
                              Log
                            </button>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setMobileBottomTab("chat"); setShowChatInfo(true) }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#b8966a",
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              aria-label="Chat info"
                              title="Chat info"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="#b8966a">
                                <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"/>
                              </svg>
                            </button>

                          </div>
                        </div>

                        <div
                          style={{
                            position: "relative",
                            flex: 1,
                            minHeight: 0,
                            overflow: "hidden",
                            minWidth: 0,
                          }}
                        >
                          {showChatInfo && <ChatInfoOverlay />}

                          {mobileBottomTab === "chat" ? (
                            <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
                              {myChatDisabled ? (
                                <div
                                  style={{
                                    padding: "0.375rem 0.5rem",
                                    borderBottom: "1px solid rgba(184,150,106,0.30)",
                                    fontFamily: "'EB Garamond', Georgia, serif",
                                    fontSize: "0.9rem",
                                    color: "#6b6558",
                                    fontStyle: "italic",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                  }}
                                >
                                  <span>Your chat is disabled.</span>
                                  <button
                                    onClick={toggleMyChat}
                                    style={{
                                      background: "none",
                                      border: "1px solid rgba(184,150,106,0.4)",
                                      borderRadius: 6,
                                      color: "#b8966a",
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: "0.5rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      padding: "4px 8px",
                                      cursor: "pointer",
                                      flexShrink: 0,
                                    }}
                                  >
                                    Enable Chat
                                  </button>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    padding: "0.375rem 0.5rem",
                                    borderBottom: "1px solid rgba(184,150,106,0.30)",
                                    flexShrink: 0,
                                  }}
                                >
                                  <input
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") sendChat() }}
                                    placeholder="Message…"
                                    style={{
                                      flexGrow: 1,
                                      background: "#0d0d10",
                                      border: "1px solid rgba(184,150,106,0.30)",
                                      borderRadius: 6,
                                      padding: "8px 10px",
                                      color: "#e8e4d8",
                                      outline: "none",
                                      fontFamily: "'EB Garamond', Georgia, serif",
                                      fontSize: "1rem",
                                      minWidth: 0,
                                    }}
                                  />
                                  <button
                                    onClick={sendChat}
                                    style={{
                                      background: "#5de8f7",
                                      border: "none",
                                      borderRadius: 6,
                                      padding: "8px 12px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      color: "#0b1220",
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: "0.55rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      flexShrink: 0,
                                    }}
                                  >
                                    Send
                                  </button>
                                </div>
                              )}

                              <div
                                style={{
                                  padding: "0.5rem",
                                  fontFamily: "'EB Garamond', Georgia, serif",
                                  fontSize: "1.1rem",
                                  color: "#b0aa9e",
                                  overflowY: "auto",
                                  WebkitOverflowScrolling: "touch",
                                  touchAction: "pan-y",
                                  flex: 1,
                                  minHeight: 0,
                                }}
                                className="hide-scrollbar"
                              >
                                {opponentChatDisabled && (
                                  <div style={{ marginBottom: "0.25rem", fontStyle: "italic", color: "#6b6558" }}>
                                    {(human === "W" ? bluePlayer : whitePlayer).username}'s chat is disabled.
                                  </div>
                                )}
                                {[...chatMsgs].reverse().map((m) => {
                                  const name = m.from === "SYS" ? "System" : m.from === "B" ? bluePlayer.username : whitePlayer.username
                                  const color = m.from === "SYS" ? "#b0aa9e" : m.from === "B" ? "#5de8f7" : "#e8e4d8"
                                  return (
                                    <div key={m.id} style={{ marginBottom: "0.25rem" }}>
                                      <span style={{ fontWeight: "bold", color }}>{name}:</span>{" "}{m.text}
                                    </div>
                                  )
                                })}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "0.35rem 0.5rem",
                                  borderTop: "1px solid rgba(184,150,106,0.15)",
                                  flexShrink: 0,
                                }}
                              >
                                {!myChatDisabled ? (
                                  <button
                                    onClick={toggleMyChat}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: "#b0aa9e",
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: "0.65rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      cursor: "pointer",
                                      padding: 0,
                                    }}
                                  >
                                    Disable Chat
                                  </button>
                                ) : <span />}

                                {resolvedOpponentUserId && (
                                  <button
                                    onClick={submitReport}
                                    disabled={reportSent}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: reportSent ? "#6b6558" : "#dc2626",
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: "0.65rem",
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      cursor: reportSent ? "default" : "pointer",
                                      padding: 0,
                                      opacity: reportSent ? 0.6 : 1,
                                    }}
                                  >
                                    {reportSent ? "Reported" : "Report"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                padding: "0.5rem",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                fontSize: "0.85rem",
                                color: "#b0aa9e",
                                overflowY: "auto",
                                WebkitOverflowScrolling: "touch",
                                touchAction: "pan-y",
                                height: "100%",
                                minHeight: 0,
                                lineHeight: "1.5",
                              }}
                              className="hide-scrollbar"
                            >
                              {g.log.length === 0 ? (
                                <div style={{ opacity: 0.7 }}>No log entries yet.</div>
                              ) : (
                                g.log.map((l, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      padding: "2px 0",
                                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                      fontSize: 13,
                                      lineHeight: 1.5,
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {l}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          /* ===== WEB LAYOUT ===== */
          <>
            {/* Main Content Area */}
            <div
              style={{
                display: "flex",
                flexGrow: 1,
                padding: 20,
                overflow: "hidden",
                alignItems: "flex-start",
                gap: 12,
                justifyContent: "center",
              }}
            >
              {/* Left Column */}
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, alignSelf: "stretch" }}>
                {/* White Player Section */}
                <div
                  style={{
                    padding: 12,
                    backgroundColor: "rgba(184,150,106,0.18)",
                    borderRadius: 8,
                    border: g.player === leftPlayer.avatar ? (leftPlayer.avatar === "W" ? "2px solid #e8e4d8" : "2px solid #5de8f7") : "1px solid rgba(184,150,106,0.30)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        backgroundColor: "#b0aa9e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                        fontWeight: 900,
                        color: "#0d0d10",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {leftPlayer.avatar_url ? (
                        <img src={leftPlayer.avatar_url} alt={leftPlayer.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : leftPlayer.avatar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                      {/* Row 1: flag · username · elo */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FlagImg cc={leftPlayer.country} size={16} />
                        <span
                          onClick={() => {
                            if (leftPlayer.username && leftPlayer.username !== "You") {
                              window.location.assign(`/u/${encodeURIComponent(leftPlayer.username)}`)
                            }
                          }}
                          style={{
                            fontFamily: "'Cinzel', serif",
                            fontWeight: 700,
                            fontSize: 15,
                            color: "#e8e4d8",
                            cursor: leftPlayer.username && leftPlayer.username !== "You" ? "pointer" : "default",
                          }}
                        >
                          {leftPlayer.username}
                        </span>
                        <span style={{ fontWeight: 900, color: eloColor(leftPlayer.elo), fontSize: 13 }}>{leftPlayer.elo}</span>
                      </div>
                      {/* Row 2: token · side */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <div className={tokenClass(leftPlayer.avatar as "W" | "B")} style={{ width: 14, height: 14, borderRadius: "50%", position: "relative" }} />
                        <span style={{ color: "#b0aa9e" }}>{leftPlayer.avatar === "W" ? "Wake" : "Brake"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Reserves and Captives */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>Reserves</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
                        {Array.from({ length: g.reserves[leftPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={tokenClass(leftPlayer.avatar as "W" | "B")} style={{ width: 22, height: 22, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ width: 1, background: "linear-gradient(180deg, transparent, #b8966a, transparent)", alignSelf: "stretch", margin: "0 10px" }} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>Captives</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
                        {Array.from({ length: g.captives[leftPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={tokenClass(leftPlayer.avatar === "W" ? "B" : "W")} style={{ width: 22, height: 22, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Route Hand */}
                  <div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a", marginBottom: 6 }}>Route Hand</div>
                    <div ref={setRouteMeasureEl(2)} style={{ display: "flex", gap: 6, width: "100%" }}>
                      {g.routes[leftPlayer.avatar as "W" | "B"].slice(0, 3).map((r) => {
                        const isActive = g.player === leftPlayer.avatar
                        const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                          const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                        const isSelected = g.pendingSwap.handRouteId === r.id
                        return (
                          <RouteIcon
                            key={r.id}
                            route={r}
                            primaryColor={routeColorsForSide(leftPlayer.avatar as "W" | "B")?.primary}
                          secondaryColor={routeColorsForSide(leftPlayer.avatar as "W" | "B")?.secondary}
                          skinStyle={routeSkinStyleForSide(leftPlayer.avatar as "W" | "B")}
                            onClick={() => isActive && !used && actions.playRoute(leftPlayer.avatar as "W" | "B", r.id)}
                            selected={isSelected}
                            routeClass={routeClassForSide(leftPlayer.avatar as "W" | "B")}
                            style={{
                            ...(routeDominoW != null ? { width: routeDominoW } : { width: "100%" }),
                            alignSelf: "center",
                            flex: "0 0 auto",
                            minWidth: 0,
                            aspectRatio: "7/13",
                              cursor: isActive && !used ? "pointer" : "default",
                              opacity: used ? 0.3 : 1,
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Special Actions */}
                  <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #b8966a, transparent)", margin: "10px 0 2px" }} />
                  <div style={{ display: "flex", justifyContent: "space-evenly", alignItems: "center", paddingTop: 6, paddingBottom: 2 }}>
                    {g.player === leftPlayer.avatar ? (
                      <>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Extra Reinforcement</span><button onClick={() => canBuyExtraReinforcement && actions.buyExtraReinforcement()} disabled={!canBuyExtraReinforcement} style={{ background: "none", border: "none", cursor: canBuyExtraReinforcement ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canBuyExtraReinforcement ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64z"/></svg>
                        </button></span>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Ransom</span><button onClick={() => canUseRansom && actions.useRansom()} disabled={!canUseRansom} style={{ background: "none", border: "none", cursor: canUseRansom ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canUseRansom ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64zM320 130.8L320 508.9C458 442.1 495.1 294.1 496 205.5L320 130.9L320 130.9z"/></svg>
                        </button></span>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Early Swap</span><button onClick={() => canEarlySwap && actions.armEarlySwap()} disabled={!canEarlySwap} style={{ background: "none", border: "none", cursor: canEarlySwap ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canEarlySwap ? "#ee484c" : "#6b6558"}><path d="M576 160C576 210.2 516.9 285.1 491.4 315C487.6 319.4 482 321.1 476.9 320L384 320C366.3 320 352 334.3 352 352C352 369.7 366.3 384 384 384L480 384C533 384 576 427 576 480C576 533 533 576 480 576L203.6 576C212.3 566.1 222.9 553.4 233.6 539.2C239.9 530.8 246.4 521.6 252.6 512L480 512C497.7 512 512 497.7 512 480C512 462.3 497.7 448 480 448L384 448C331 448 288 405 288 352C288 299 331 256 384 256L423.8 256C402.8 224.5 384 188.3 384 160C384 107 427 64 480 64C533 64 576 107 576 160zM181.1 553.1C177.3 557.4 173.9 561.2 171 564.4L169.2 566.4L169 566.2C163 570.8 154.4 570.2 149 564.4C123.8 537 64 466.5 64 416C64 363 107 320 160 320C213 320 256 363 256 416C256 446 234.9 483 212.5 513.9C201.8 528.6 190.8 541.9 181.7 552.4L181.1 553.1zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM480 192C497.7 192 512 177.7 512 160C512 142.3 497.7 128 480 128C462.3 128 448 142.3 448 160C448 177.7 462.3 192 480 192z"/></svg>
                        </button></span>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Defection</span><button onClick={() => canUseDefection && actions.armDefection()} disabled={!canUseDefection} style={{ background: "none", border: "none", cursor: canUseDefection ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canUseDefection ? "#ee484c" : "#6b6558"}><path d="M512 320C512 214 426 128 320 128L320 512C426 512 512 426 512 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg>
                        </button></span>
                      </>
                    ) : (
                      <span className="vk-tooltip-wrap"><span className="vk-tooltip">Recoil</span><button onClick={() => canUseRecoil && actions.armRecoil()} disabled={!canUseRecoil} style={{ background: "none", border: "none", cursor: canUseRecoil ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canUseRecoil ? "#ee484c" : "#6b6558"}><path d="M168.1 531.1L156.9 540.1C153.7 542.6 149.8 544 145.8 544C136 544 128 536 128 526.2L128 256C128 150 214 64 320 64C426 64 512 150 512 256L512 526.2C512 536 504 544 494.2 544C490.2 544 486.3 542.6 483.1 540.1L471.9 531.1C458.5 520.4 439.1 522.1 427.8 535L397.3 570C394 573.8 389.1 576 384 576C378.9 576 374.1 573.8 370.7 570L344.1 539.5C331.4 524.9 308.7 524.9 295.9 539.5L269.3 570C266 573.8 261.1 576 256 576C250.9 576 246.1 573.8 242.7 570L212.2 535C200.9 522.1 181.5 520.4 168.1 531.1zM288 256C288 238.3 273.7 224 256 224C238.3 224 224 238.3 224 256C224 273.7 238.3 288 256 288C273.7 288 288 273.7 288 256zM384 288C401.7 288 416 273.7 416 256C416 238.3 401.7 224 384 224C366.3 224 352 238.3 352 256C352 273.7 366.3 288 384 288z"/></svg>
                      </button></span>
                    )}
                    <button onClick={() => setShowHelpModal(g.player === leftPlayer.avatar ? "currentPlayer" : "recoil")} style={{ background: "none", border: "none", color: "#b8966a", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill="#b8966a"><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"/></svg>
                    </button>
                  </div>
                </div>

                {/* Chat Section */}
                {!props.puzzleMode && (
                <div
                  style={{
                    backgroundColor: "rgba(184,150,106,0.18)",
                    borderRadius: 8,
                    border: "1px solid rgba(184,150,106,0.30)",
                    flexGrow: showChatExpanded ? 1 : 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    minHeight: 0,
                    position: "relative",
                  }}
                >
                  {showChatInfo && <ChatInfoOverlay />}

                  {/* Header row */}
                  <div
                    style={{ padding: "10px 12px", backgroundColor: "#0d0d10", borderBottom: "1px solid rgba(184,150,106,0.30)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
                    onClick={() => setShowChatExpanded(!showChatExpanded)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="#b8966a">
                        <path d="M320 544C461.4 544 576 436.5 576 304C576 171.5 461.4 64 320 64C178.6 64 64 171.5 64 304C64 358.3 83.2 408.3 115.6 448.5L66.8 540.8C62 549.8 63.5 560.8 70.4 568.3C77.3 575.8 88.2 578.1 97.5 574.1L215.9 523.4C247.7 536.6 282.9 544 320 544zM192 272C209.7 272 224 286.3 224 304C224 321.7 209.7 336 192 336C174.3 336 160 321.7 160 304C160 286.3 174.3 272 192 272zM320 272C337.7 272 352 286.3 352 304C352 321.7 337.7 336 320 336C302.3 336 288 321.7 288 304C288 286.3 302.3 272 320 272zM416 304C416 286.3 430.3 272 448 272C465.7 272 480 286.3 480 304C480 321.7 465.7 336 448 336C430.3 336 416 321.7 416 304z"/>
                      </svg>
                      <span>Chat</span>
                      {/* Info icon */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowChatExpanded(true); setShowChatInfo(true) }}
                        style={{ background: "none", border: "none", color: "#b8966a", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="#b8966a">
                          <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"/>
                        </svg>
                      </button>
                    </div>
                    <span style={{ fontSize: 14, opacity: 0.7 }}>{showChatExpanded ? "▲" : "▼"}</span>
                  </div>

                  {/* Collapsed: show latest message */}
                  {!showChatExpanded && chatMsgs.length > 0 && (() => {
                    const m = chatMsgs[chatMsgs.length - 1]
                    const name = m.from === "SYS" ? "System" : m.from === "B" ? bluePlayer.username : whitePlayer.username
                    const color = m.from === "SYS" ? "#b0aa9e" : m.from === "B" ? "#5de8f7" : "#e8e4d8"
                    return (
                      <div style={{ padding: "10px 12px", fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, color: "#b0aa9e", borderTop: "1px solid rgba(184,150,106,0.30)" }}>
                        <span style={{ fontWeight: 900, color }}>{name}:</span>{" "}{m.text}
                      </div>
                    )
                  })()}

                  {/* Expanded: input */}
                  {showChatExpanded && (
                    myChatDisabled ? (
                      <div style={{ borderBottom: "1px solid rgba(184,150,106,0.30)", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 14, color: "#6b6558", fontStyle: "italic" }}>Your chat is disabled.</span>
                        <button onClick={toggleMyChat} style={{ background: "none", border: "1px solid rgba(184,150,106,0.4)", borderRadius: 6, color: "#b8966a", fontFamily: "'Cinzel', serif", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 10px", cursor: "pointer", flexShrink: 0 }}>
                          Enable Chat
                        </button>
                      </div>
                    ) : (
                      <div style={{ borderBottom: "1px solid rgba(184,150,106,0.30)", padding: "10px 12px", display: "flex", gap: 8, flexShrink: 0 }}>
                        <input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") sendChat() }}
                          placeholder="Type a message…"
                          style={{ flexGrow: 1, background: "#0d0d10", border: "1px solid rgba(184,150,106,0.30)", borderRadius: 8, padding: "8px 10px", color: "#e8e4d8", outline: "none", fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16 }}
                        />
                        <button onClick={sendChat} style={{ background: "#5de8f7", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer", color: "#0b1220", fontFamily: "'Cinzel', serif", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>
                          Send
                        </button>
                      </div>
                    )
                  )}

                  {/* Expanded: message list */}
                  {showChatExpanded && (
                    <div style={{ padding: 12, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, color: "#b0aa9e", overflowY: "auto", flexGrow: 1, minHeight: 0, lineHeight: 1.6 }}>
                      {opponentChatDisabled && (
                        <div style={{ marginBottom: 8, fontStyle: "italic", color: "#6b6558" }}>
                          {(human === "W" ? bluePlayer : whitePlayer).username}'s chat is disabled.
                        </div>
                      )}
                      {[...chatMsgs].reverse().map((m) => {
                        const name = m.from === "SYS" ? "System" : m.from === "B" ? bluePlayer.username : whitePlayer.username
                        const color = m.from === "SYS" ? "#b0aa9e" : m.from === "B" ? "#5de8f7" : "#e8e4d8"
                        return (
                          <div key={m.id} style={{ marginBottom: 8 }}>
                            <span style={{ fontWeight: 900, color }}>{name}:</span>{" "}{m.text}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Expanded: actions row */}
                  {showChatExpanded && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderTop: "1px solid rgba(184,150,106,0.15)", flexShrink: 0 }}>
                      {!myChatDisabled ? (
                        <button onClick={toggleMyChat} style={{ background: "none", border: "none", color: "#b0aa9e", fontFamily: "'Cinzel', serif", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}>
                          Disable Chat
                        </button>
                      ) : <span />}
                      {resolvedOpponentUserId && (
                        <button
                          onClick={submitReport}
                          disabled={reportSent}
                          style={{ background: "none", border: "none", color: reportSent ? "#6b6558" : "#dc2626", fontFamily: "'Cinzel', serif", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: reportSent ? "default" : "pointer", padding: 0, opacity: reportSent ? 0.6 : 1 }}
                        >
                          {reportSent ? "Reported" : "Report"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                )}

              </div>

              {/* Queue */}
              <div
                style={{
                  backgroundColor: "rgba(184,150,106,0.18)",
                  border: "1px solid rgba(184,150,106,0.30)",
                  color: "#e8e4d8",
                  padding: 12,
                  borderRadius: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  alignItems: "center",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  flexShrink: 0,
                  width: (routeDominoW != null ? routeDominoW + 24 : 120),
                }}
              >
                <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a", marginBottom: 6 }}>Queue</div>
                {g.queue.map((r, idx) => (
                  <RouteIcon
                    key={`${r.id}-${idx}`}
                    route={r}
                    primaryColor={activeRouteColors?.primary}
                    secondaryColor={activeRouteColors?.secondary}
                    skinStyle={routeSkinStyleForSide(g.player as "W" | "B")}
                    onClick={() => canPickQueueForSwap && actions.pickQueueIndex(idx)}
                    selected={canPickQueueForSwap && g.pendingSwap.queueIndex === idx}
                    routeClass={routeClassForSide(g.player as "W" | "B")}
                    style={{
                      ...(routeDominoW
                        ? { flex: "0 0 auto", width: routeDominoW }
                        : { width: "100%" }),
                      minWidth: 0,
                      aspectRatio: "7/13",
                      cursor: canPickQueueForSwap ? "pointer" : "default",
                    }}
                  />
                ))}
              </div>

              {/* Center: Timers + Board */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flexShrink: 0 }}>
                {props.puzzleMode && props.puzzleMovesLeft !== undefined && (
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "center",
                      padding: "12px 28px",
                      backgroundColor: "rgba(184,150,106,0.18)",
                      border: `1px solid ${props.puzzleMovesLeft <= 1 ? "rgba(238,72,76,0.35)" : "rgba(184,150,106,0.30)"}`,
                      borderRadius: 12,
                      boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    }}
                  >
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#5a5550" }}>
                      Moves Left
                    </span>
                    <span style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: 32, fontWeight: 900,
                      color: props.puzzleMovesLeft <= 1 ? "#ee484c" : "#e8e4d8",
                      minWidth: 40, textAlign: "center",
                      transition: "color 0.2s",
                    }}>
                      {props.puzzleMovesLeft}
                    </span>
                  </div>
                )}

                {/* Clock + Phase Banner — side-by-side row */}
                <div style={{
                  width: "100%",
                  maxWidth: 597,
                  display: "grid",
                  gridTemplateColumns: (props.puzzleMode && props.puzzleMovesLeft !== undefined) ? "1fr" : "auto minmax(0, 1fr)",
                  gap: 10,
                  alignItems: "stretch",
                  marginBottom: 2,
                }}>

                  {/* 3-row clock (omitted in puzzle mode) */}
                  {!(props.puzzleMode && props.puzzleMovesLeft !== undefined) && (
                    <div style={{
                      backgroundColor: "rgba(184,150,106,0.18)",
                      border: "1px solid rgba(184,150,106,0.30)",
                      borderRadius: 12,
                      padding: "10px 18px",
                      display: "grid",
                      gridTemplateRows: "1fr 1fr auto",
                      alignContent: "center",
                      justifyItems: "center",
                      gap: 4,
                      boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      flexShrink: 0,
                    }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.35rem", fontWeight: 900, color: "#e8e4d8", opacity: g.player === "W" ? 1 : 0.4, lineHeight: 1, whiteSpace: "nowrap" }}>
                        W {fmtClock(clocks.W)}
                      </div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.35rem", fontWeight: 900, color: "#5de8f7", opacity: g.player === "B" ? 1 : 0.4, lineHeight: 1, whiteSpace: "nowrap" }}>
                        B {fmtClock(clocks.B)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 4, opacity: 0.75 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 640 640" fill="#b0aa9e">
                          <path d="M160 64C142.3 64 128 78.3 128 96C128 113.7 142.3 128 160 128L160 139C160 181.4 176.9 222.1 206.9 252.1L274.8 320L206.9 387.9C176.9 417.9 160 458.6 160 501L160 512C142.3 512 128 526.3 128 544C128 561.7 142.3 576 160 576L480 576C497.7 576 512 561.7 512 544C512 526.3 497.7 512 480 512L480 501C480 458.6 463.1 417.9 433.1 387.9L365.2 320L433.1 252.1C463.1 222.1 480 181.4 480 139L480 128C497.7 128 512 113.7 512 96C512 78.3 497.7 64 480 64L160 64zM224 139L224 128L416 128L416 139C416 158 410.4 176.4 400 192L240 192C229.7 176.4 224 158 224 139zM240 448C243.5 442.7 247.6 437.7 252.1 433.1L320 365.2L387.9 433.1C392.5 437.7 396.5 442.7 400.1 448L240 448z"/>
                        </svg>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.6rem", letterSpacing: "0.12em", color: "#b0aa9e", lineHeight: 1, whiteSpace: "nowrap" }}>{timeControl.label}</span>
                      </div>
                    </div>
                  )}

                  {/* Phase Banner OR Confirmation Buttons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

                    {/* Confirmation buttons — replace the bar entirely when active */}
                    {defectionArmed && (
                      <div style={{ display: "flex", gap: 8, flex: 1 }}>
                        <button onClick={() => actions.cancelDefection()} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Cancel Defection</button>
                      </div>
                    )}
                    {!defectionArmed && g.phase === "MULLIGAN" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                        {mulliganHelpOpen && (
                          <MulliganHelpModal onClose={() => setMulliganHelpOpen(false)} />
                        )}
                        <div style={{ display: "flex", gap: 8, flex: 1 }}>
                          {(g as any).mulliganReady?.[human] ? (
                            <div style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "1px solid rgba(184,150,106,0.30)", background: "rgba(255,255,255,0.03)", textAlign: "center", fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.1em", color: "#b0aa9e", display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for opponent...</div>
                          ) : mulliganArmed ? (
                            <>
                              <div style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "1px solid rgba(93,232,247,0.4)", background: "rgba(93,232,247,0.07)", fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: "0.08em", color: "#5de8f7", display: "flex", alignItems: "center", justifyContent: "center" }}>Select a token on the board</div>
                              <button onClick={() => (actions as any).cancelMulligan?.()} style={{ padding: "0 16px", borderRadius: 8, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 12, cursor: "pointer", color: "#b0aa9e", fontFamily: "'Cinzel', serif", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => (actions as any).armMulligan?.(human)} disabled={(g as any).mulliganCount?.[human] >= 2} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "1px solid rgba(184,150,106,0.50)", background: "rgba(184,150,106,0.12)", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: (g as any).mulliganCount?.[human] >= 2 ? "default" : "pointer", color: (g as any).mulliganCount?.[human] >= 2 ? "#6b6558" : "#e8e4d8", opacity: (g as any).mulliganCount?.[human] >= 2 ? 0.4 : 1, animation: (g as any).mulliganCount?.[human] >= 2 ? "none" : "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Mulligan{(g as any).mulliganCount?.[human] > 0 ? ` (${(g as any).mulliganCount?.[human]}/2)` : ""}</button>
                              <button onClick={() => (actions as any).passMulligan?.(human)} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Continue →</button>
                              <button onClick={() => setMulliganHelpOpen(v => !v)} title="What is a Mulligan?" style={{ width: 38, borderRadius: 8, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", cursor: "pointer", color: mulliganHelpOpen ? "#e8e4d8" : "#6b6558", fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "stretch" }}>?</button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {!recoilArmed && !defectionArmed && allRoutesUsed && g.phase === "ACTION" && g.player === human && (
                      <div style={{ display: "flex", gap: 8, flex: 1 }}>
                        <button onClick={() => actions.advanceFromAction()} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Finish actions and proceed to reinforcements</button>
                      </div>
                    )}
                    {!recoilArmed && g.player === human && g.phase === "SWAP" && (
                      <div style={{ display: "flex", gap: 8, flex: 1 }}>
                        <button onClick={() => actions.confirmSwapAndEndTurn()} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Make route swap and confirm</button>
                      </div>
                    )}
                    {!recoilArmed && g.player === human && g.phase === "ACTION" && earlySwapArmed && (
                      <div style={{ display: "flex", gap: 8, flex: 1 }}>
                        <button onClick={() => actions.confirmEarlySwap()} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Confirm Early Swap</button>
                        <button onClick={() => actions.cancelEarlySwap()} style={{ padding: "0 16px", borderRadius: 8, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 12, cursor: "pointer", color: "#e8e4d8", fontFamily: "'Cinzel', serif", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Cancel</button>
                      </div>
                    )}
                    {recoilArmed && (
                      <div style={{ display: "flex", gap: 8, flex: 1 }}>
                        <button onClick={() => actions.confirmRecoil()} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "2px solid #3296ab", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Select unit and grid space, confirm recoil</button>
                        <button onClick={() => actions.cancelRecoil()} style={{ padding: "0 16px", borderRadius: 8, border: "1px solid rgba(184,150,106,0.30)", background: "transparent", fontWeight: 700, fontSize: 12, cursor: "pointer", color: "#e8e4d8", fontFamily: "'Cinzel', serif", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>Cancel</button>
                      </div>
                    )}
                    {forcedYieldAvailable && g.player === human && (
                      <div style={{ display: "flex", gap: 8, flex: 1 }}>
                        <button onClick={() => actions.yieldForced()} style={{ flex: 1, minWidth: 0, padding: "0 16px", borderRadius: 8, border: "2px solid #6b7280", background: "rgba(184,150,106,0.18)", fontWeight: 700, fontSize: 11, letterSpacing: "0.10em", fontFamily: "'Cinzel', serif", textTransform: "uppercase", cursor: "pointer", color: "#e8e4d8", animation: "confirm-pulse 1.4s ease-in-out infinite", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>No usable routes — Yield {remainingRoutes.length} to Void</button>
                      </div>
                    )}

                    {/* Phase bar — only shown when no confirmation is pending */}
                    {!defectionArmed && g.phase !== "MULLIGAN" && !(allRoutesUsed && g.phase === "ACTION" && g.player === human && !recoilArmed && !defectionArmed) && !(g.phase === "SWAP" && g.player === human && !recoilArmed) && !(g.phase === "ACTION" && earlySwapArmed && g.player === human && !recoilArmed) && !recoilArmed && !(forcedYieldAvailable && g.player === human) && (
                    <div
                      style={{
                        background: g.player === human
                          ? (g.player === "W" ? "rgba(232,228,216,0.10)" : "rgba(93,232,247,0.10)")
                          : "rgba(255,255,255,0.03)",
                        border: g.player === human
                          ? (g.player === "W" ? "1px solid rgba(232,228,216,0.25)" : "1px solid rgba(93,232,247,0.25)")
                          : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 8,
                        padding: "6px 12px",
                        display: "grid",
                        gridTemplateRows: "auto auto",
                        alignContent: "center",
                        gap: 3,
                        flex: 1,
                      }}
                    >
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.5rem", letterSpacing: "0.25em", textTransform: "uppercase", color: g.player === human ? (g.player === "W" ? "rgba(232,228,216,0.55)" : "rgba(93,232,247,0.55)") : "#3a3830", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {g.player === human ? `${g.player} · ${g.phase}` : "Opponent's Turn"}
                      </div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 13, letterSpacing: "0.04em", color: g.player === human ? (g.player === "W" ? "#e8e4d8" : "#5de8f7") : "#6b6558", lineHeight: 1.2, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        {g.player !== human
                          ? "Waiting for opponent..."
                          : g.phase === "ACTION" ? "Make your moves"
                          : g.phase === "REINFORCE"
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                Place {g.reinforcementsToPlace} reinforcement{g.reinforcementsToPlace !== 1 ? "s" : ""}
                                {Array.from({ length: g.reinforcementsToPlace }).map((_, i) => (
                                  <div key={i} className={tokenClass(g.player as "W" | "B")} style={{ width: 9, height: 9, borderRadius: "50%", position: "relative" }} />
                                ))}
                              </span>
                          : "Place opening tokens"}
                        {g.warning && (
                          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: "#ef4444", letterSpacing: "0.15em", textTransform: "uppercase", marginLeft: 4 }}>
                            {g.warning}
                          </span>
                        )}
                      </div>
                    </div>
                    )}

                  </div>
                </div>

                {/* Info Row - latest log and resign */}
                <div
                  style={{
                    fontSize: 13,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    color: "#b0aa9e",
                    paddingLeft: 8,
                    paddingRight: 8,
                    width: "100%",
                    maxWidth: 597,
                  }}
                >
                  {g.log.length === 0 ? (
                    <div style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}>
                      No moves yet
                    </div>
                  ) : (
                    <div
                      key={g.log[0]}
                      style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}
                    >
                      {g.log[0].replace(/==/g, '').trim()}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {/* Resign */}
                    <button
                      onClick={() => actions.resign()}
                      disabled={!started || !!g.gameOver}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ee484c",
                        fontSize: 13,
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 900,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        opacity: (!started || !!g.gameOver) ? 0.5 : 1,
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="#ee484c">
                        <path d="M480 208C480 128.5 408.4 64 320 64C231.6 64 160 128.5 160 208C160 255.1 185.1 296.9 224 323.2L224 352C224 369.7 238.3 384 256 384L384 384C401.7 384 416 369.7 416 352L416 323.2C454.9 296.9 480 255.1 480 208zM256 192C273.7 192 288 206.3 288 224C288 241.7 273.7 256 256 256C238.3 256 224 241.7 224 224C224 206.3 238.3 192 256 192zM352 224C352 206.3 366.3 192 384 192C401.7 192 416 206.3 416 224C416 241.7 401.7 256 384 256C366.3 256 352 241.7 352 224zM541.5 403.7C534.7 387.4 516 379.7 499.7 386.5L320 461.3L140.3 386.5C124 379.7 105.3 387.4 98.5 403.7C91.7 420 99.4 438.7 115.7 445.5L236.8 496L115.7 546.5C99.4 553.3 91.7 572 98.5 588.3C105.3 604.6 124 612.3 140.3 605.5L320 530.7L499.7 605.5C516 612.3 534.7 604.6 541.5 588.3C548.3 572 540.6 553.3 524.3 546.5L403.2 496L524.3 445.5C540.6 438.7 548.3 420 541.5 403.7z"/>
                      </svg>
                      <span>Resign</span>
                    </button>
                  </div>
                </div>

                {boardStyle === "grid" ? (
                  <GridBoard
                    boardMap={boardMap}
                    selectedTokenId={selectedTokenIdForRender}
                    ghost={ghost}
                    started={started}
                    phase={g.phase}
                    onSquareClick={actions.onSquareClick}
                    GHOST_MS={GHOST_MS}
                    mobile={false}
                    recoilSourcePos={recoilSourcePos}
                    recoilDestPos={pendingRecoil?.to ?? null}
                    recoilPlayer={recoilPlayer}
                    defectionArmed={defectionArmed}
                    defectionPlayer={defectionArmed ? g.player : null}
                    tokenClass={tokenClass}
                    boardSkinStyle={boardSkinStyle}
                  />
                ) : (
                  <IntersectionBoard
                    boardMap={boardMap}
                    selectedTokenId={selectedTokenIdForRender}
                    ghost={ghost}
                    started={started}
                    phase={g.phase}
                    onSquareClick={actions.onSquareClick}
                    GHOST_MS={GHOST_MS}
                    mobile={false}
                    dotColor={myOrderColors?.primary ?? "#ee484c"}
                    recoilSourcePos={recoilSourcePos}
                    recoilDestPos={pendingRecoil?.to ?? null}
                    recoilPlayer={recoilPlayer}
                    defectionArmed={defectionArmed}
                    defectionPlayer={defectionArmed ? g.player : null}
                    tokenClass={tokenClass}
                  />
                )}

                {/* Board style instruction + hide highlight */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <button
                    onClick={() => setBoardStyle(prev => prev === "grid" ? "intersection" : "grid")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#b8966a",
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: "'Cinzel', serif",
                      fontSize: 10,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                    }}
                  >
                    Switch Board Style
                  </button>
                  <button
                    onClick={() => setHideSelection((v) => !v)}
                    disabled={!started}
                    title="Hide/show selected token highlight (H toggles, Esc hides)"
                    style={{ background: "none", border: "none", color: hideSelection ? "#b8966a" : "#6b6558", fontSize: 11, cursor: started ? "pointer" : "default", padding: 0, fontFamily: "'Cinzel', serif", letterSpacing: "0.15em", display: "flex", alignItems: "center", gap: 5, opacity: started ? 1 : 0.5 }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 640 640" fill={hideSelection ? "#b8966a" : "#6b6558"}>
                      <path d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"/>
                    </svg>
                    <span>{hideSelection ? "Show Grid Highlight" : "Hide Grid Highlight"}</span>
                  </button>
                </div>

              </div>

              {/* Void */}
              <div
                style={{
                  backgroundColor: "rgba(184,150,106,0.18)",
                  color: "#e8e4d8",
                  padding: 12,
                  border: "1px solid rgba(184,150,106,0.30)",
                  borderRadius: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  alignItems: "center",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  flexShrink: 0,
                  width: 74, // match Queue
                }}
              >
                <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a", marginBottom: 6 }}>Void</div>
                <div style={{ display: "flex", gap: 6, width: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {Array.from({ length: Math.min(g.void.W, 8) }).map((_, i) => (
                      <div key={`vw${i}`} className={tokenClass("W")} style={{ width: 18, height: 18, borderRadius: "50%", position: "relative" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {Array.from({ length: Math.min(g.void.B, 8) }).map((_, i) => (
                      <div key={`vb${i}`} className={tokenClass("B")} style={{ width: 18, height: 18, borderRadius: "50%", position: "relative" }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, alignSelf: "stretch" }}>
                {/* Blue Player Section */}
                <div
                  style={{
                    padding: 12,
                    backgroundColor: "rgba(184,150,106,0.18)",
                    borderRadius: 8,
                    border: g.player === rightPlayer.avatar ? (rightPlayer.avatar === "W" ? "2px solid #e8e4d8" : "2px solid #5de8f7") : "1px solid rgba(184,150,106,0.30)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        backgroundColor: "#b0aa9e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                        fontWeight: 900,
                        color: "#0d0d10",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {rightPlayer.avatar_url ? (
                        <img src={rightPlayer.avatar_url} alt={rightPlayer.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : rightPlayer.avatar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                      {/* Row 1: flag · username · elo · gear */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                        <FlagImg cc={rightPlayer.country} size={16} />
                        <span
                          onClick={() => {
                            if (rightPlayer.username && rightPlayer.username !== "You") {
                              window.location.assign(`/u/${encodeURIComponent(rightPlayer.username)}`)
                            }
                          }}
                          style={{
                            fontFamily: "'Cinzel', serif",
                            fontWeight: 700,
                            fontSize: 15,
                            color: "#e8e4d8",
                            cursor: rightPlayer.username && rightPlayer.username !== "You" ? "pointer" : "default",
                          }}
                        >
                          {rightPlayer.username}
                        </span>
                        <span style={{ fontWeight: 900, color: eloColor(rightPlayer.elo), fontSize: 13 }}>{rightPlayer.elo}</span>
                        <button
                          onClick={() => setSkinsOpen(true)}
                          title="Customize appearance"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#6b6558", padding: "2px 4px", display: "flex", alignItems: "center", opacity: 0.7, transition: "opacity 0.15s", marginLeft: "auto" }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                          onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                        >
                          <GearIcon />
                        </button>
                      </div>
                      {/* Row 2: token · side */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <div className={tokenClass(rightPlayer.avatar as "W" | "B")} style={{ width: 14, height: 14, borderRadius: "50%", position: "relative" }} />
                        <span style={{ color: "#b0aa9e" }}>{rightPlayer.avatar === "W" ? "Wake" : "Brake"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Reserves and Captives */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>Reserves</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
                        {Array.from({ length: g.reserves[rightPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={tokenClass(rightPlayer.avatar as "W" | "B")} style={{ width: 22, height: 22, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ width: 1, background: "linear-gradient(180deg, transparent, #b8966a, transparent)", alignSelf: "stretch", margin: "0 10px" }} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a" }}>Captives</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
                        {Array.from({ length: g.captives[rightPlayer.avatar as "W" | "B"] }).map((_, i) => (
                          <div key={i} className={tokenClass(rightPlayer.avatar === "W" ? "B" : "W")} style={{ width: 22, height: 22, borderRadius: "50%", position: "relative" }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Route Hand */}
                  <div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a", marginBottom: 6 }}>Route Hand</div>
                    <div ref={setRouteMeasureEl(3)} style={{ display: "flex", gap: 6, width: "100%" }}>
                      {g.routes[rightPlayer.avatar as "W" | "B"].slice(0, 3).map((r) => {
                        const isActive = g.player === rightPlayer.avatar
                        const used = isActive && g.usedRoutes.includes(r.id) && g.phase !== "SWAP"
                          const canClick = isActive && ((g.phase === "SWAP") || (g.phase === "ACTION" && !g.usedRoutes.includes(r.id)))
                        const isSelected = g.pendingSwap.handRouteId === r.id
                        return (
                          <RouteIcon
                            key={r.id}
                            route={r}
                            primaryColor={routeColorsForSide(rightPlayer.avatar as "W" | "B")?.primary}
                          secondaryColor={routeColorsForSide(rightPlayer.avatar as "W" | "B")?.secondary}
                          skinStyle={routeSkinStyleForSide(rightPlayer.avatar as "W" | "B")}
                            onClick={() => isActive && !used && actions.playRoute(rightPlayer.avatar as "W" | "B", r.id)}
                            selected={isSelected}
                            routeClass={routeClassForSide(rightPlayer.avatar as "W" | "B")}
                            style={{
                            ...(routeDominoW != null ? { width: routeDominoW } : { width: "100%" }),
                            alignSelf: "center",
                            flex: "0 0 auto",
                            minWidth: 0,
                            aspectRatio: "7/13",
                              cursor: isActive && !used ? "pointer" : "default",
                              opacity: used ? 0.3 : 1,
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Special Actions */}
                  <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #b8966a, transparent)", margin: "10px 0 2px" }} />
                  <div style={{ display: "flex", justifyContent: "space-evenly", alignItems: "center", paddingTop: 6, paddingBottom: 2 }}>
                    {g.player === rightPlayer.avatar ? (
                      <>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Extra Reinforcement</span><button onClick={() => canBuyExtraReinforcement && actions.buyExtraReinforcement()} disabled={!canBuyExtraReinforcement} style={{ background: "none", border: "none", cursor: canBuyExtraReinforcement ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canBuyExtraReinforcement ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64z"/></svg>
                        </button></span>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Ransom</span><button onClick={() => canUseRansom && actions.useRansom()} disabled={!canUseRansom} style={{ background: "none", border: "none", cursor: canUseRansom ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canUseRansom ? "#ee484c" : "#6b6558"}><path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64zM320 130.8L320 508.9C458 442.1 495.1 294.1 496 205.5L320 130.9L320 130.9z"/></svg>
                        </button></span>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Early Swap</span><button onClick={() => canEarlySwap && actions.armEarlySwap()} disabled={!canEarlySwap} style={{ background: "none", border: "none", cursor: canEarlySwap ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canEarlySwap ? "#ee484c" : "#6b6558"}><path d="M576 160C576 210.2 516.9 285.1 491.4 315C487.6 319.4 482 321.1 476.9 320L384 320C366.3 320 352 334.3 352 352C352 369.7 366.3 384 384 384L480 384C533 384 576 427 576 480C576 533 533 576 480 576L203.6 576C212.3 566.1 222.9 553.4 233.6 539.2C239.9 530.8 246.4 521.6 252.6 512L480 512C497.7 512 512 497.7 512 480C512 462.3 497.7 448 480 448L384 448C331 448 288 405 288 352C288 299 331 256 384 256L423.8 256C402.8 224.5 384 188.3 384 160C384 107 427 64 480 64C533 64 576 107 576 160zM181.1 553.1C177.3 557.4 173.9 561.2 171 564.4L169.2 566.4L169 566.2C163 570.8 154.4 570.2 149 564.4C123.8 537 64 466.5 64 416C64 363 107 320 160 320C213 320 256 363 256 416C256 446 234.9 483 212.5 513.9C201.8 528.6 190.8 541.9 181.7 552.4L181.1 553.1zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM480 192C497.7 192 512 177.7 512 160C512 142.3 497.7 128 480 128C462.3 128 448 142.3 448 160C448 177.7 462.3 192 480 192z"/></svg>
                        </button></span>
                        <span className="vk-tooltip-wrap"><span className="vk-tooltip">Defection</span><button onClick={() => canUseDefection && actions.armDefection()} disabled={!canUseDefection} style={{ background: "none", border: "none", cursor: canUseDefection ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canUseDefection ? "#ee484c" : "#6b6558"}><path d="M512 320C512 214 426 128 320 128L320 512C426 512 512 426 512 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg>
                        </button></span>
                      </>
                    ) : (
                      <span className="vk-tooltip-wrap"><span className="vk-tooltip">Recoil</span><button onClick={() => canUseRecoil && actions.armRecoil()} disabled={!canUseRecoil} style={{ background: "none", border: "none", cursor: canUseRecoil ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill={canUseRecoil ? "#ee484c" : "#6b6558"}><path d="M168.1 531.1L156.9 540.1C153.7 542.6 149.8 544 145.8 544C136 544 128 536 128 526.2L128 256C128 150 214 64 320 64C426 64 512 150 512 256L512 526.2C512 536 504 544 494.2 544C490.2 544 486.3 542.6 483.1 540.1L471.9 531.1C458.5 520.4 439.1 522.1 427.8 535L397.3 570C394 573.8 389.1 576 384 576C378.9 576 374.1 573.8 370.7 570L344.1 539.5C331.4 524.9 308.7 524.9 295.9 539.5L269.3 570C266 573.8 261.1 576 256 576C250.9 576 246.1 573.8 242.7 570L212.2 535C200.9 522.1 181.5 520.4 168.1 531.1zM288 256C288 238.3 273.7 224 256 224C238.3 224 224 238.3 224 256C224 273.7 238.3 288 256 288C273.7 288 288 273.7 288 256zM384 288C401.7 288 416 273.7 416 256C416 238.3 401.7 224 384 224C366.3 224 352 238.3 352 256C352 273.7 366.3 288 384 288z"/></svg>
                      </button></span>
                    )}
                    <button onClick={() => setShowHelpModal(g.player === rightPlayer.avatar ? "currentPlayer" : "recoil")} style={{ background: "none", border: "none", color: "#b8966a", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" fill="#b8966a"><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"/></svg>
                    </button>
                  </div>
                </div>

                {/* Game Log */}
                <div
                  style={{
                    backgroundColor: "rgba(184,150,106,0.18)",
                    borderRadius: 8,
                    border: "1px solid rgba(184,150,106,0.30)",
                    flexGrow: showLogExpanded ? 1 : 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      backgroundColor: "#0d0d10",
                      borderBottom: "1px solid rgba(184,150,106,0.30)",
                      fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b8966a",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    onClick={() => setShowLogExpanded(!showLogExpanded)}
                  >
                    <span>Log</span>
                    <span style={{ fontSize: 14, opacity: 0.7 }}>{showLogExpanded ? "▲" : "▼"}</span>
                  </div>
                  {showLogExpanded && (
                  <div
                    style={{
                      padding: 12,
                      fontSize: 11,
                      color: "#b0aa9e",
                      fontFamily: "monospace",
                      overflowY: "auto",
                      flexGrow: 1,
                      minHeight: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {g.log.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>No log entries yet.</div>
                    ) : (
                      g.log.map((l, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          {l}
                        </div>
                      ))
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>
          </>

        )}

        {g.gameOver && !props.puzzleMode && (
          <GameOverModal
            isOpen={showGameOverModal}
            onClose={() => { setShowGameOverModal(false); stopTheme() }}
            g={g}
            whitePlayer={whitePlayer}
            bluePlayer={bluePlayer}
            opponentType={props.opponentType ?? "ai"}
            onPlayComputer={() => {
              if (props.opponentType === "pvp") {
                if (props.onPlayComputer) { props.onPlayComputer(); return }
              }
              setShowGameOverModal(false)
              setNewGameOpen(true)
              playTheme()
            }}
            newlyUnlockedAchievements={props.newlyUnlockedAchievements}
            onRematch={() => {
              if (props.opponentType === "pvp") {
                setShowGameOverModal(false)
                props.onRequestRematch?.()
              } else {
                setShowGameOverModal(false)
                createAiGameAndGo()
              }
            }}
          />
        )}

        {/* Achievements Modal */}
        <AchievementsModal
          isOpen={showAchievementsModal}
          onClose={() => setShowAchievementsModal(false)}
          achievements={props.newlyUnlockedAchievements ?? []}
        />

        {/* Auth Modal */}
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

        {/* Onboarding Modal */}
        {showOnboardingModal && currentUserId && (
          <OnboardingModal
            userId={currentUserId}
            onComplete={async () => {
              setShowOnboardingModal(false)
              // Refetch profile to update UI
              const { data: profile } = await supabase
                .from("profiles")
                .select("username, country_code, country_name, avatar_url")
                .eq("id", currentUserId)
                .single()
              if (profile) {
                setUserProfile(profile)
              }
            }}
          />
        )}

        {/* Profile Modal */}
        {showProfileModal && currentUserId && (
          <ProfileModal
            userId={currentUserId}
            onClose={() => setShowProfileModal(false)}
            onUpdate={async () => {
              // Refetch profile to update UI
              const { data: profile } = await supabase
                .from("profiles")
                .select("username, country_code, country_name, avatar_url")
                .eq("id", currentUserId)
                .single()
              if (profile) {
                setUserProfile(profile)
              }
            }}
          />
        )}

        {isMobile && mobileActionPickerSide && (
          <div
            onClick={() => setMobileActionPickerSide(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.72)",
              zIndex: 1200,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              padding: "0.75rem",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 420,
                background: "#111216",
                border: "1px solid rgba(184,150,106,0.35)",
                borderRadius: 16,
                boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
                padding: "0.9rem",
                display: "grid",
                gap: "0.65rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.82rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "#b8966a" }}>Actions</div>
                  <div style={{ fontSize: "0.82rem", color: "#b0aa9e", marginTop: "0.2rem" }}>Choose an action for {mobileActionPickerSide === "W" ? "Wake" : "Brake"}.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileActionPickerSide(null)}
                  style={{ background: "none", border: "1px solid rgba(184,150,106,0.35)", color: "#b8966a", borderRadius: 999, padding: "0.3rem 0.65rem", fontFamily: "'Cinzel', serif", fontSize: "0.64rem", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
              <div style={{ display: "grid", gap: "0.55rem" }}>
                {getMobileActionItems(mobileActionPickerSide).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={!item.enabled}
                    onClick={() => {
                      if (!item.enabled) return
                      item.onSelect()
                      setMobileActionPickerSide(null)
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2.5rem minmax(0, 1fr)",
                      alignItems: "center",
                      gap: "0.75rem",
                      width: "100%",
                      padding: "0.8rem 0.9rem",
                      borderRadius: 12,
                      border: item.enabled ? "1px solid rgba(184,150,106,0.35)" : "1px solid rgba(107,101,88,0.35)",
                      background: item.enabled ? "rgba(184,150,106,0.12)" : "rgba(107,101,88,0.14)",
                      color: item.enabled ? "#e8e4d8" : "#6b6558",
                      cursor: item.enabled ? "pointer" : "default",
                      opacity: item.enabled ? 1 : 0.75,
                    }}
                  >
                    <span style={{ width: "2.5rem", height: "2.5rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(13,13,16,0.45)" }}>
                      {React.cloneElement(item.icon as React.ReactElement, { width: 24, height: 24 })}
                    </span>
                    <span style={{ textAlign: "left" }}>
                      <span style={{ display: "block", fontFamily: "'Cinzel', serif", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>{item.label}</span>
                      <span style={{ display: "block", fontSize: "0.76rem", color: item.enabled ? "#b0aa9e" : "#6b6558", marginTop: "0.15rem" }}>{item.enabled ? "Tap to use this action." : "Unavailable right now."}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMobileActionPickerSide(null)
                    setShowHelpModal(g.player === mobileActionPickerSide ? "currentPlayer" : "recoil")
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.5rem minmax(0, 1fr)",
                    alignItems: "center",
                    gap: "0.75rem",
                    width: "100%",
                    padding: "0.8rem 0.9rem",
                    borderRadius: 12,
                    border: "1px solid rgba(184,150,106,0.35)",
                    background: "rgba(184,150,106,0.08)",
                    color: "#e8e4d8",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: "2.5rem", height: "2.5rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(13,13,16,0.45)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640" fill="#b8966a"><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM320 240C302.3 240 288 254.3 288 272C288 285.3 277.3 296 264 296C250.7 296 240 285.3 240 272C240 227.8 275.8 192 320 192C364.2 192 400 227.8 400 272C400 319.2 364 339.2 344 346.5L344 350.3C344 363.6 333.3 374.3 320 374.3C306.7 374.3 296 363.6 296 350.3L296 342.2C296 321.7 310.8 307 326.1 302C332.5 299.9 339.3 296.5 344.3 291.7C348.6 287.5 352 281.7 352 272.1C352 254.4 337.7 240.1 320 240.1zM288 432C288 414.3 302.3 400 320 400C337.7 400 352 414.3 352 432C352 449.7 337.7 464 320 464C302.3 464 288 449.7 288 432z"/></svg>
                  </span>
                  <span style={{ textAlign: "left" }}>
                    <span style={{ display: "block", fontFamily: "'Cinzel', serif", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Help</span>
                    <span style={{ display: "block", fontSize: "0.76rem", color: "#b0aa9e", marginTop: "0.15rem" }}>Open the action help panel.</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Help Modal */}
        {showHelpModal && (
          <HelpModal
            topic={showHelpModal}
            onClose={() => setShowHelpModal(null)}
          />
        )}
      </div>
    </ErrBoundary>
  )
}