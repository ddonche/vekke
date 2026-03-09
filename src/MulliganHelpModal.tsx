import React from "react"

type MulliganHelpModalProps = {
  onClose: () => void
}

export function MulliganHelpModal({ onClose }: MulliganHelpModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#0d0d10",
          border: "1px solid rgba(184,150,106,0.30)",
          borderRadius: "12px",
          padding: "20px",
          maxWidth: "90vw",
          width: "500px",
          maxHeight: "80vh",
          overflowY: "auto",
          color: "#e8e4d8",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              fontSize: "1.1rem",
              fontWeight: "700",
              fontFamily: "'Cinzel', serif",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#b8966a",
              margin: 0,
            }}
          >
            Mulligan
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#6b6558",
              fontSize: "1.5rem",
              cursor: "pointer",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Section 1 — Mulligan */}
          <div style={{ borderBottom: "1px solid rgba(184,150,106,0.20)", paddingBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              {/* Refresh/redraw icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: "700",
                  fontFamily: "'Cinzel', serif",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#ee484c",
                  margin: 0,
                }}
              >
                Mulligan
              </h3>
            </div>

            <div
              style={{
                fontSize: "0.9rem",
                fontFamily: "'Cinzel', serif",
                letterSpacing: "0.06em",
                color: "#b8966a",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              Cost: 1 Token Off the Board
            </div>

            <p
              style={{
                fontSize: "1.05rem",
                fontFamily: "'EB Garamond', serif",
                color: "#e8e4d8",
                lineHeight: "1.5",
                margin: "0 0 12px 0",
              }}
            >
              If you don't like your route hand, you can discard any or all of your routes and redraw — but you have to take one of your tokens off the board and return it to your reserves. You can Mulligan up to twice before the game begins.
            </p>

            <div
              style={{
                fontSize: "0.95rem",
                fontFamily: "'EB Garamond', serif",
                color: "#b0aa9e",
                fontStyle: "italic",
                lineHeight: "1.4",
                paddingLeft: "12px",
                borderLeft: "2px solid rgba(184,150,106,0.30)",
              }}
            >
              Use when: Your starting routes are weak or don't work together. A token in reserve is still useful — the trade is worth it for a better hand.
            </div>
          </div>

          {/* Section 2 — Continue */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              {/* Arrow-right icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: "700",
                  fontFamily: "'Cinzel', serif",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#ee484c",
                  margin: 0,
                }}
              >
                Continue
              </h3>
            </div>

            <div
              style={{
                fontSize: "0.9rem",
                fontFamily: "'Cinzel', serif",
                letterSpacing: "0.06em",
                color: "#b8966a",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              No Cost — Keep Your Current Hand
            </div>

            <p
              style={{
                fontSize: "1.05rem",
                fontFamily: "'EB Garamond', serif",
                color: "#e8e4d8",
                lineHeight: "1.5",
                margin: "0 0 12px 0",
              }}
            >
              Skip the Mulligan and start the game with your tokens and routes as dealt. Both players must confirm before the first turn begins.
            </p>

            <div
              style={{
                fontSize: "0.95rem",
                fontFamily: "'EB Garamond', serif",
                color: "#b0aa9e",
                fontStyle: "italic",
                lineHeight: "1.4",
                paddingLeft: "12px",
                borderLeft: "2px solid rgba(184,150,106,0.30)",
              }}
            >
              Use when: Your routes look solid and keeping all three tokens on the board is the stronger opening.
            </div>
          </div>

        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            marginTop: "20px",
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid rgba(184,150,106,0.30)",
            background: "transparent",
            color: "#b8966a",
            fontWeight: "700",
            fontFamily: "'Cinzel', serif",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
