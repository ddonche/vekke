import React from "react"

type HelpTopic = "currentPlayer" | "evasion"

type HelpModalProps = {
  topic: HelpTopic
  onClose: () => void
}

export function HelpModal({ topic, onClose }: HelpModalProps) {
  const content = {
    currentPlayer: {
      title: "Action Phase Options",
      sections: [
        {
          heading: "Early Reinforcement",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              <path d="M9 12h6" />
              <path d="M12 9v6" />
            </svg>
          ),
          cost: "Cost: 2 Reserve Tokens → Void",
          description: "If you want to have an extra reinforcement during that phase, you can yield 2 reserve tokens to the void. This lets you place 2 reinforcements at the end of your turn instead of 1. You cannot capture with reinforcements.",
          strategy: "Use when: Setting up sieges. The extra token gives you immediate board presence to create new attack angles or reinforce weak positions before your opponent's turn."
        },
        {
          heading: "Ransom",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
              <path d="M12 22V2"/>
            </svg>
          ),
          cost: "Cost: 2 Captives → Recover 1 from Void",
          description: "Trade 2 captured enemy tokens to recover 1 of your own tokens from the void back to your reserves. This gives you back material that was lost to forced yields, special action costs, or other void transfers.",
          strategy: "Use when: You have excess captives but are running low on reserves. Converting captives into usable reserves can turn the tide when you're at a material disadvantage."
        },
        {
          heading: "Early Route Swap",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="19" r="3" />
              <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
              <circle cx="18" cy="5" r="3" />
            </svg>
          ),
          cost: "Cost: 2 Captured Enemy Tokens → Void",
          description: "If you don't want to wait until the end of your turn to do a free route swap, you can yield 2 captured enemy tokens to get an immediate route swap, which you can use during your turn.",
          strategy: "Use when: You need a specific route to complete your attack mid-turn, or you want to deny a strong route from your opponent's upcoming swap."
        }
      ]
    },
    evasion: {
      title: "Evasion",
      sections: [
        {
          heading: "Escape During Opponent's Turn",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee484c" strokeWidth="2">
              <path d="M9 10h.01" />
              <path d="M15 10h.01" />
              <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
            </svg>
          ),
          cost: "Cost: 1 Captive + 1 Reserve → Void (Once Per Game)",
          description: "The only move you can do during your opponent's turn. You must yield 1 captured token and 1 reserve token to the void to use it. Move 1 token 1 space in any direction. You cannot move a sieged token. You cannot invade or capture with this move. You CAN undo a capture on that token with this.",
          strategy: "Use when: A critical token was just captured or is about to be fully sieged. This is your emergency escape—use it wisely since you only get one per game."
        }
      ]
    }
  }

  const data = content[topic]

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
          backgroundColor: "#374151",
          border: "1px solid #4b5563",
          borderRadius: "12px",
          padding: "20px",
          maxWidth: "90vw",
          width: "500px",
          maxHeight: "80vh",
          overflowY: "auto",
          color: "#e5e7eb",
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
              fontSize: "1.25rem",
              fontWeight: "bold",
              color: "#e5e7eb",
              margin: 0,
            }}
          >
            {data.title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: "1.5rem",
              cursor: "pointer",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {data.sections.map((section, idx) => (
            <div key={idx} style={{ borderBottom: idx < data.sections.length - 1 ? "1px solid #4b5563" : "none", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                {section.icon}
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: "bold",
                    color: "#ee484c",
                    margin: 0,
                  }}
                >
                  {section.heading}
                </h3>
              </div>
              
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "#fbbf24",
                  fontWeight: "bold",
                  marginBottom: "8px",
                }}
              >
                {section.cost}
              </div>

              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#d1d5db",
                  marginBottom: "12px",
                  lineHeight: "1.5",
                }}
              >
                {section.description}
              </p>

              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "#9ca3af",
                  fontStyle: "italic",
                  lineHeight: "1.4",
                  paddingLeft: "12px",
                  borderLeft: "2px solid #4b5563",
                }}
              >
                {section.strategy}
              </div>
            </div>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            marginTop: "20px",
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #4b5563",
            background: "#1f2937",
            color: "#e5e7eb",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
