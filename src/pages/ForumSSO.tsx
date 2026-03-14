// src/pages/ForumSSO.tsx
// This page is the DiscourseConnect URL — Discourse redirects here with ?sso=&sig=
// We grab the Supabase session and forward to the Edge Function with the token.

import { useEffect } from "react"
import { supabase } from "../services/supabase"

const SSO_FUNCTION_URL = "https://mkpyxxhbamdfzpmudqnq.supabase.co/functions/v1/sso"

export function ForumSSO() {
  useEffect(() => {
    async function handleSSO() {
      const params = new URLSearchParams(window.location.search)
      const sso    = params.get("sso")
      const sig    = params.get("sig")

      // If no SSO params, just go to the forum homepage
      if (!sso || !sig) {
        window.location.href = "https://forum.vekke.net"
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // Not logged in — send to login, then back here
        const returnUrl = encodeURIComponent(window.location.href)
        window.location.href = `/login?redirect=${returnUrl}`
        return
      }

      // Forward to Edge Function with token + original sso/sig params
      const forwardUrl = new URL(SSO_FUNCTION_URL)
      forwardUrl.searchParams.set("sso", sso)
      forwardUrl.searchParams.set("sig", sig)
      forwardUrl.searchParams.set("token", session.access_token)

      window.location.href = forwardUrl.toString()
    }

    handleSSO()
  }, [])

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "#0a0a0c",
      color: "#b0aa9e",
      fontFamily: "'Cinzel', serif",
      fontSize: 13,
      letterSpacing: "0.15em",
    }}>
      Redirecting to forum...
    </div>
  )
}
