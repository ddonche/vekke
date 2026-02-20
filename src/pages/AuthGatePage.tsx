// src/pages/AuthGatePage.tsx
import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/**
 * Auth gate:
 * - Reads ?returnTo=...
 * - Redirects to /auth-host?openAuth=1&returnTo=...
 *
 * Why?
 * Because we do NOT want auth to ever land on AI pages.
 */
export function AuthGatePage() {
  const nav = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const returnTo = params.get("returnTo") || "/"
    const openAuth = params.get("openAuth") || "1"

    nav(`/auth-host?openAuth=${encodeURIComponent(openAuth)}&returnTo=${encodeURIComponent(returnTo)}`, {
      replace: true,
    })
  }, [location.search, nav])

  return null
}