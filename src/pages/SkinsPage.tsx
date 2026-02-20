// src/pages/SkinsPage.tsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { SkinSelector } from "../components/SkinSelector"

export function SkinsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/")
        return
      }
      setUserId(data.session.user.id)
      setLoading(false)
    })
  }, [navigate])

  if (loading) {
    return (
      <div style={{
        background: "#0a0a0a", minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ color: "#6b7280" }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "white" }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a1a1a",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none", border: "1px solid #2d2d2d",
            borderRadius: 8, padding: "8px 14px",
            color: "#9ca3af", cursor: "pointer", fontSize: 13,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "#5de8f7")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d2d2d")}
        >
          ← Back
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.05em" }}>
            COSMETICS
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            Customize your tokens, routes, and board
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        {userId && <SkinSelector userId={userId} />}
      </div>
    </div>
  )
}
