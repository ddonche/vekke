import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { acceptInvite, createChallenge, type TimeControlId } from "../services/pvp"
import { newGame } from "../engine/state"

type ChallengeState =
  | { type: "challenge" }
  | { type: "pending"; inviteToken: string | null }
  | { type: "accept"; inviteToken: string }
  | { type: "game"; gameId: string }

type Props = {
  viewerId: string | null
  opponentId: string
  opponentIsAi?: boolean
  timeControlId?: TimeControlId
  isRanked?: boolean
  className?: string
  fullLabelClassName?: string
  shortLabelClassName?: string
  onRequireAuth?: () => void
  onError?: (message: string | null) => void
}

function injectChallengeButtonStyles() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-challenge-button-styles")) return

  const style = document.createElement("style")
  style.id = "vekke-challenge-button-styles"
  style.textContent = `
    .vk-challenge-btn {
      font-family: 'Cinzel', serif;
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 0.55rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;

      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;

      width: 140px;
      min-width: 140px;
      max-width: 140px;
      height: 32px;

      justify-self: start;
      align-self: center;

      border: 1px solid rgba(184,150,106,0.35);
      background: rgba(184,150,106,0.10);
      color: #d4af7a;

      transition: filter 0.12s ease, opacity 0.12s ease, background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }

    .vk-challenge-btn:hover:not(:disabled) {
      filter: brightness(1.06);
    }

    .vk-challenge-btn:disabled {
      cursor: default;
    }

    .vk-challenge-btn--default {
      background: rgba(184,150,106,0.10);
      border-color: rgba(184,150,106,0.35);
      color: #d4af7a;
    }

    .vk-challenge-btn--accept {
      background: rgba(93,232,247,0.10);
      border-color: rgba(93,232,247,0.35);
      color: #5de8f7;
    }

    .vk-challenge-btn--game {
      background: rgba(34,197,94,0.12);
      border-color: rgba(34,197,94,0.35);
      color: #86efac;
    }

    .vk-challenge-btn--pending {
      width: 100%;
      min-width: 0;
      max-width: none;

      background: rgba(249,115,22,0.12);
      border-color: rgba(249,115,22,0.45);
      color: #fb923c;
    }

    .vk-challenge-btn--loading {
      opacity: 0.6;
    }

    .vk-challenge-btn--disabled {
      opacity: 0.35;
    }

    @media (max-width: 640px) {
      .vk-challenge-btn {
        width: 72px;
        min-width: 72px;
        max-width: 72px;
        padding: 6px 8px;
        font-size: 0.5rem;
        letter-spacing: 0.08em;
      }

      .vk-challenge-btn--pending {
        width: 100%;
        min-width: 0;
        max-width: none;
      }
    }
  `
  document.head.appendChild(style)
}

function toMessage(e: unknown) {
  if (!e) return "Unknown error"
  if (typeof e === "string") return e
  if (e instanceof Error) return e.message
  // @ts-expect-error supabase errors vary
  return e.message || e.error_description || e.error || JSON.stringify(e)
}

function pickInviteToken(row: any): string | null {
  const candidates = [row?.invite_token, row?.inviteToken, row?.token]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim()
  }
  return null
}

function renderLabel(
  full: string,
  short: string | null,
  fullClassName?: string,
  shortClassName?: string,
) {
  if (fullClassName || shortClassName) {
    return (
      <>
        <span className={fullClassName}>{full}</span>
        {short ? <span className={shortClassName}>{short}</span> : null}
      </>
    )
  }
  return full
}

export function ChallengeButton({
  viewerId,
  opponentId,
  opponentIsAi = false,
  timeControlId = "standard",
  isRanked = true,
  className = "",
  fullLabelClassName,
  shortLabelClassName,
  onRequireAuth,
  onError,
}: Props) {
  injectChallengeButtonStyles()

  const navigate = useNavigate()
  const [state, setState] = useState<ChallengeState>({ type: "challenge" })
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const isSelf = !!viewerId && viewerId === opponentId
  const disabledByIdentity = opponentIsAi || isSelf

  const loadState = useCallback(async () => {
    if (!viewerId || !opponentId || disabledByIdentity) {
      setState({ type: "challenge" })
      setLoaded(true)
      return
    }

    setLoaded(false)

    try {
      const { data: games, error: gameErr } = await supabase
        .from("games")
        .select("id, wake_id, brake_id, status, created_at")
        .or(
          `and(wake_id.eq.${viewerId},brake_id.eq.${opponentId}),and(wake_id.eq.${opponentId},brake_id.eq.${viewerId})`
        )
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false })

      if (gameErr) throw gameErr

      if (games && games.length > 0) {
        setState({ type: "game", gameId: games[0].id })
        setLoaded(true)
        return
      }

      const { data: invites, error: inviteErr } = await supabase
        .from("game_invites")
        .select("*")
        .or(
          `and(created_by.eq.${viewerId},invited_user_id.eq.${opponentId}),and(created_by.eq.${opponentId},invited_user_id.eq.${viewerId})`
        )
        .eq("status", "pending")
        .is("game_id", null)
        .order("created_at", { ascending: false })

      if (inviteErr) throw inviteErr

      if (invites && invites.length > 0) {
        const latest = invites[0] as any
        const inviteToken = pickInviteToken(latest)

        if (latest.created_by === opponentId) {
          if (inviteToken) {
            setState({ type: "accept", inviteToken })
          } else {
            setState({ type: "challenge" })
          }
        } else {
          setState({ type: "pending", inviteToken })
        }

        setLoaded(true)
        return
      }

      setState({ type: "challenge" })
      setLoaded(true)
    } catch (e) {
      onError?.(toMessage(e))
      setState({ type: "challenge" })
      setLoaded(true)
    }
  }, [viewerId, opponentId, disabledByIdentity, onError])

  useEffect(() => {
    loadState()
  }, [loadState])

  const title = useMemo(() => {
    if (!viewerId) return "Sign in to challenge"
    if (opponentIsAi) return "AI cannot be challenged"
    if (isSelf) return "You cannot challenge yourself"
    if (!loaded) return "Loading..."
    if (busy) return "Working..."
    if (state.type === "game") return "Go to game"
    if (state.type === "accept") return `Accept challenge (${timeControlId})`
    if (state.type === "pending") return "Challenge pending"
    return `Challenge (${timeControlId})`
  }, [viewerId, opponentIsAi, isSelf, loaded, busy, state, timeControlId])

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!viewerId) {
      onRequireAuth?.()
      return
    }
    if (opponentIsAi || isSelf || busy) return

    try {
      onError?.(null)

      if (state.type === "game") {
        navigate(`/pvp/${state.gameId}`)
        return
      }

      if (state.type === "pending") {
        return
      }

      setBusy(true)

      if (state.type === "accept") {
        const { gameId } = await acceptInvite(state.inviteToken)
        navigate(`/pvp/${gameId}`)
        return
      }

      await createChallenge({
        invitedUserId: opponentId,
        timeControlId,
        isRanked,
        initialState: newGame(),
      })

      await loadState()
    } catch (e) {
      onError?.(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  let full = "Challenge"
  let short = "vs"
  let disabled = false
  let stateClass = "vk-challenge-btn--default"

  if (!viewerId) {
    full = "Challenge"
    short = "vs"
  } else if (opponentIsAi || isSelf) {
    disabled = true
    stateClass = "vk-challenge-btn--disabled"
  } else if (!loaded || busy) {
    full = "Loading..."
    short = "..."
    disabled = true
    stateClass = "vk-challenge-btn--loading"
  } else if (state.type === "game") {
    full = "Go to Game"
    short = "Go"
    stateClass = "vk-challenge-btn--game"
  } else if (state.type === "accept") {
    full = "Accept Challenge"
    short = "Accept"
    stateClass = "vk-challenge-btn--accept"
  } else if (state.type === "pending") {
    full = "Pending"
    short = "..."
    disabled = true
    stateClass = "vk-challenge-btn--pending"
  }

  return (
    <button
      className={`vk-challenge-btn ${stateClass}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      onClick={handleClick}
      title={title}
    >
      {renderLabel(full, short, fullLabelClassName, shortLabelClassName)}
    </button>
  )
}