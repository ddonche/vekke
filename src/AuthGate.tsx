import React, { useEffect, useState } from "react"
import { supabase } from "./services/supabase"
import { fetchIdentity, type Profile } from "./services/identity"

function isOnboarded(p: Profile) {
  const placeholder = p.username.startsWith("user_")
  return !placeholder && !!p.country_code
}

/**
 * This component decides what the app should show:
 * - Not logged in -> Login
 * - Logged in but not onboarded -> Onboarding
 * - Logged in and onboarded -> Lobby
 *
 * You will replace the placeholder <div> screens later.
 */
export function AuthGate(props: { lobby: React.ReactNode }) {
  const { lobby } = props
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    async function boot() {
      setErr(null)
      setLoading(true)

      try {
        const { data: sess, error: sessErr } = await supabase.auth.getSession()
        if (!alive) return
        if (sessErr) throw sessErr

        setSession(sess.session)

        // Not logged in -> done
        if (!sess.session) {
          setProfile(null)
          setLoading(false)
          return
        }

        // Logged in -> load identity via service (profile + optional stats)
        const uid = sess.session.user.id
        const ident = await fetchIdentity(uid)
        if (!alive) return

        setProfile(ident.profile)
        setLoading(false)
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message ?? String(e))
        setProfile(null)
        setLoading(false)
      }
    }

    // Initial load
    boot()

    // Keep in sync if user logs in/out in another tab
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      boot()
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Auth error</div>
        <div style={{ opacity: 0.8 }}>{err}</div>
      </div>
    )
  }

  // 1) Not logged in -> LOGIN screen placeholder
  if (!session) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>LOGIN SCREEN (placeholder)</div>
        <div style={{ opacity: 0.8 }}>
          Next step will replace this with real login/sign-up/forgot password UI.
        </div>
      </div>
    )
  }

  // 2) Logged in but profile not finished -> ONBOARDING placeholder
  if (!profile || !isOnboarded(profile)) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>ONBOARDING (placeholder)</div>
        <div style={{ opacity: 0.8 }}>
          Next step will replace this with username + country + avatar form.
        </div>
        <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 12, opacity: 0.8 }}>
          uid: {session.user.id}
        </div>
        {profile ? (
          <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 12, opacity: 0.8 }}>
            username: {profile.username} / country: {profile.country_code ?? "null"}
          </div>
        ) : null}
      </div>
    )
  }

  // 3) Logged in + onboarded -> show the real app
  return <>{lobby}</>
}
