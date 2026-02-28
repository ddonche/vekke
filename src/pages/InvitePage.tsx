// src/pages/InvitePage.tsx
import { useEffect, useMemo } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { newGame } from "../engine/state"

export function InvitePage() {
  const { inviterId } = useParams<{ inviterId?: string }>()
  const inviterUuid = useMemo(() => (inviterId ?? "").trim(), [inviterId])

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        if (!inviterUuid) throw new Error("Missing inviter id in URL")

        const { data } = await supabase.auth.getSession()
        if (!data.session?.user) {
          const returnTo = encodeURIComponent(`/invite/${inviterUuid}`)
          window.location.assign(`/?openAuth=1&returnTo=${returnTo}`)
          return
        }

        const token = data.session.access_token
        const initialState = newGame()

        await supabase.functions.invoke("create_challenge_from_invite", {
          body: { inviterId: inviterUuid, initialState, vgnVersion: "1", expiresInDays: 30 },
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!alive) return
        window.location.assign("/challenges")
      } catch (e: any) {
        if (!alive) return
        // Still redirect on error — Challenges page will show current state
        window.location.assign("/challenges")
      }
    })()

    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviterUuid])

  return null
}
