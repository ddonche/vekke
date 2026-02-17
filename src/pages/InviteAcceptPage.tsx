import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "../services/supabase"
import { acceptInvite } from "../services/pvp"

export function InviteAcceptPage() {
  const { token } = useParams<{ token?: string }>()
  const inviteToken = useMemo(() => (token ?? "").trim(), [token])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        if (!inviteToken) throw new Error("Missing invite token in URL")

        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          const returnTo = encodeURIComponent(`/invite/${inviteToken}`)
          window.location.assign(`/?openAuth=1&returnTo=${returnTo}`)
          return
        }

        const r = await acceptInvite(inviteToken)
        if (!alive) return
        window.location.assign(`/pvp/${r.gameId}`)
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message ?? String(e))
      }
    })()

    return () => {
      alive = false
    }
  }, [inviteToken])

  if (err) return <div style={{ padding: 16 }}>Invite failed: {err}</div>
  return <div style={{ padding: 16 }}>Accepting invite...</div>
}
