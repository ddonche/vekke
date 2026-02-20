// src/components/SkinsModal.tsx
import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import { SkinSelector } from "./SkinSelector"

interface SkinsModalProps {
  isOpen: boolean
  onClose: () => void
  onLoadoutChange?: () => void
}

export function SkinsModal({ isOpen, onClose, onLoadoutChange }: SkinsModalProps) {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id)
    })
  }, [])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(720px, calc(100vw - 32px))",
        maxHeight: "85vh",
        background: "#0f0f0f",
        border: "1px solid #2d2d2d",
        borderRadius: 16,
        zIndex: 1001,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{
          padding: "18px 24px",
          borderBottom: "1px solid #1a1a1a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.05em" }}>
              COSMETICS
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Changes apply immediately
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid #2d2d2d",
              borderRadius: 8, width: 36, height: 36,
              color: "#9ca3af", cursor: "pointer",
              fontSize: 18, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#5de8f7")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d2d2d")}
          >
            ×
          </button>
        </div>

        {/* Modal body - scrollable */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
          {userId && <SkinSelector userId={userId} onLoadoutChange={onLoadoutChange} />}
        </div>
      </div>
    </>
  )
}
