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
  const [orderId, setOrderId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      if (data.session) setUserId(data.session.user.id)
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!userId) return
    let mounted = true
    ;(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("order_id")
        .eq("id", userId)
        .maybeSingle()
      if (!mounted) return
      if (error) { console.error("Failed to load profile order_id:", error); setOrderId(null); return }
      setOrderId((data as any)?.order_id ?? null)
    })()
    return () => { mounted = false }
  }, [userId])

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
        background: "#0f0f14",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        zIndex: 1001,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'EB Garamond', Georgia, serif",
        color: "#e8e4d8",
      }}>
        {/* Modal header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
          background: "#0d0d10",
        }}>
          <div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "1.3rem", fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#e8e4d8",
            }}>
              Gear
            </div>
            <div style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: "1rem", fontStyle: "italic",
              color: "#6b6558", marginTop: 2,
            }}>
              Changes apply immediately
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontFamily: "'Cinzel', serif",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4, width: 36, height: 36,
              color: "#6b6558", cursor: "pointer",
              fontSize: "1.1rem", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,150,106,0.5)"; e.currentTarget.style.color = "#d4af7a" }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#6b6558" }}
          >
            ×
          </button>
        </div>

        {/* Modal body - scrollable */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
          {userId && (
            <SkinSelector
              userId={userId}
              orderId={orderId}
              onLoadoutChange={onLoadoutChange}
            />
          )}
        </div>
      </div>
    </>
  )
}
