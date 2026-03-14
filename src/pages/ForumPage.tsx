// src/pages/ForumPage.tsx
import { useNavigate } from "react-router-dom"

export function ForumPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0c",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          letterSpacing: "0.35em",
          textTransform: "uppercase",
          color: "#b8966a",
          marginBottom: 24,
        }}
      >
        Coming Soon
      </div>

      <h1
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: "clamp(28px, 5vw, 48px)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "#e8e4d8",
          margin: "0 0 20px",
          textTransform: "uppercase",
        }}
      >
        The Vekke Forum
      </h1>

      <p
        style={{
          fontFamily: "'EB Garamond', serif",
          fontSize: 20,
          color: "#b0aa9e",
          maxWidth: 480,
          lineHeight: 1.7,
          margin: "0 0 48px",
        }}
      >
        A gathering place for players, strategists, and those who seek mastery of the routes.
        The forum is being built — check back soon.
      </p>

      <button
        onClick={() => navigate("/")}
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          padding: "10px 24px",
          background: "rgba(184,150,106,0.10)",
          border: "1px solid rgba(184,150,106,0.35)",
          color: "#d4af7a",
          borderRadius: 4,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(184,150,106,0.20)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(184,150,106,0.10)")}
      >
        Return Home
      </button>
    </div>
  )
}
