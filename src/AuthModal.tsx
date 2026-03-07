import React, { useState } from "react"
import { supabase } from "./services/supabase"

// ── Shared Vekke modal styles ─────────────────────────────────────────────────
const S = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    padding: "20px",
  },
  card: {
    background: "#0f0f14",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
    padding: "28px 24px",
    maxWidth: "90vw",
    width: "22rem",
    color: "#e8e4d8",
    fontFamily: "'EB Garamond', Georgia, serif",
  },
  title: {
    fontFamily: "'Cinzel', serif",
    fontSize: "0.85rem",
    fontWeight: 600,
    letterSpacing: "0.3em",
    textTransform: "uppercase" as const,
    color: "#b8966a",
    marginBottom: 20,
    textAlign: "center" as const,
  },
  label: {
    display: "block",
    fontFamily: "'Cinzel', serif",
    fontSize: "0.68rem",
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: "#b0aa9e",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid rgba(184,150,106,0.2)",
    background: "#13131a",
    color: "#e8e4d8",
    fontSize: "0.95rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  hint: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: "0.8rem",
    marginTop: 4,
    color: "#6b6558",
  },
  btnPrimary: {
    width: "100%",
    padding: "11px",
    borderRadius: 4,
    border: "1px solid rgba(184,150,106,0.45)",
    background: "rgba(184,150,106,0.12)",
    color: "#d4af7a",
    fontFamily: "'Cinzel', serif",
    fontWeight: 600,
    fontSize: "0.72rem",
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
  },
  btnCancel: {
    width: "100%",
    padding: "10px",
    borderRadius: 4,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "#6b6558",
    fontFamily: "'Cinzel', serif",
    fontWeight: 600,
    fontSize: "0.68rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    marginTop: 10,
  },
  error: {
    padding: "10px 12px",
    marginBottom: 16,
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    fontSize: "0.9rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    color: "#fca5a5",
  },
  success: {
    padding: "10px 12px",
    marginBottom: 16,
    background: "rgba(52,211,153,0.08)",
    border: "1px solid rgba(52,211,153,0.3)",
    borderRadius: 6,
    fontSize: "0.9rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    color: "#6ee7b7",
  },
  field: { marginBottom: 16 },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.07)",
    margin: "0 0 20px",
  },
}

type AuthModalProps = {
  onClose: () => void
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setMessage(null); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    onClose()
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setMessage(null); setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMessage("Check your email for the confirmation link!")
  }

  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email first"); return }
    setError(null); setMessage(null); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMessage("Password reset email sent!")
  }


  const handleOAuth = async (provider: "google" | "discord") => {
    setError(null)
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href },
    })
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={(e) => e.stopPropagation()}>

        <div style={S.title}>Sign In to Vekke</div>

        {/* OAuth */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => handleOAuth("google")}
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "#e8e4d8",
              fontFamily: "'Cinzel', serif",
              fontWeight: 600,
              fontSize: "0.68rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase" as const,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.5 30.2 0 24 0 14.7 0 6.7 5.4 2.8 13.3l7.9 6.1C12.6 13 17.9 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.6 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17z"/>
              <path fill="#FBBC05" d="M10.7 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l8.2-6.1z"/>
              <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.1 0-11.3-4.1-13.2-9.7l-8.2 6.1C6.7 42.6 14.7 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.58rem", letterSpacing: "0.2em", color: "#4a4540", textTransform: "uppercase" as const }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setMessage(null) }}
              style={{
                flex: 1,
                padding: "8px",
                background: tab === t ? "rgba(184,150,106,0.10)" : "transparent",
                border: tab === t ? "1px solid rgba(184,150,106,0.35)" : "1px solid transparent",
                borderRadius: 4,
                color: tab === t ? "#d4af7a" : "#6b6558",
                fontFamily: "'Cinzel', serif",
                fontWeight: 600,
                fontSize: "0.68rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase" as const,
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {t === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        <div style={S.divider} />

        {error && <div style={S.error}>{error}</div>}
        {message && <div style={S.success}>{message}</div>}

        <form onSubmit={tab === "login" ? handleLogin : handleSignup}>
          <div style={S.field}>
            <label style={S.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={S.input}
            />
          </div>

          <div style={S.field}>
            <label style={S.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={S.input}
            />
          </div>

          {tab === "login" && (
            <div style={{ textAlign: "right", marginBottom: 16, marginTop: -8 }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6b6558",
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Loading…" : tab === "login" ? "Log In" : "Create Account"}
          </button>
        </form>

        <button onClick={onClose} style={S.btnCancel}>Cancel</button>
      </div>
    </div>
  )
}
