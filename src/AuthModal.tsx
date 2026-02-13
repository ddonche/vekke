import React, { useState } from "react"
import { supabase } from "./services/supabase"

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
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Success - close modal
    onClose()
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Success - show confirmation message
    setMessage("Check your email for the confirmation link!")
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email first")
      return
    }

    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setMessage("Password reset email sent! Check your inbox.")
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#374151",
          border: "1px solid #4b5563",
          borderRadius: "12px",
          padding: "20px",
          maxWidth: "90vw",
          width: "25rem",
          color: "#e5e7eb",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "20px",
            borderBottom: "1px solid #4b5563",
          }}
        >
          <button
            onClick={() => {
              setTab("login")
              setError(null)
              setMessage(null)
            }}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "none",
              borderBottom: tab === "login" ? "2px solid #ee484c" : "2px solid transparent",
              color: tab === "login" ? "#ee484c" : "#9ca3af",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Login
          </button>
          <button
            onClick={() => {
              setTab("signup")
              setError(null)
              setMessage(null)
            }}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "none",
              borderBottom: tab === "signup" ? "2px solid #ee484c" : "2px solid transparent",
              color: tab === "signup" ? "#ee484c" : "#9ca3af",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Error/Message display */}
        {error && (
          <div
            style={{
              padding: "10px",
              marginBottom: "16px",
              backgroundColor: "#991b1b",
              border: "1px solid #dc2626",
              borderRadius: "6px",
              fontSize: "0.875rem",
              color: "#fecaca",
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            style={{
              padding: "10px",
              marginBottom: "16px",
              backgroundColor: "#065f46",
              border: "1px solid #059669",
              borderRadius: "6px",
              fontSize: "0.875rem",
              color: "#d1fae5",
            }}
          >
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={tab === "login" ? handleLogin : handleSignup}>
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                background: "#1f2937",
                color: "#e5e7eb",
                fontSize: "0.875rem",
              }}
            />
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                background: "#1f2937",
                color: "#e5e7eb",
                fontSize: "0.875rem",
              }}
            />
          </div>

          {/* Forgot password link (login only) */}
          {tab === "login" && (
            <div style={{ marginBottom: "16px", textAlign: "right" }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "0.625rem",
              border: "2px solid #111",
              backgroundColor: "#ee484c",
              color: "white",
              fontWeight: "bold",
              cursor: loading ? "default" : "pointer",
              fontSize: "0.875rem",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Loading..." : tab === "login" ? "Log In" : "Sign Up"}
          </button>
        </form>

        {/* Cancel button */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: "12px",
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #4b5563",
            background: "transparent",
            color: "#9ca3af",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
