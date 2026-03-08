import React from "react"

type HelpTopic = "currentPlayer" | "recoil"

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
          heading: "Extra Reinforcement",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640" fill="#ee484c">
              <path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64z"/>
            </svg>
          ),
          cost: "Cost: 2 Reserve Tokens → Void",
          description: "If you want to have an extra reinforcement during that phase, you can yield 2 reserve tokens to the void. This lets you place 2 reinforcements at the end of your turn instead of 1. You cannot capture with reinforcements.",
          strategy: "Use when: Setting up sieges. The extra token gives you immediate board presence to create new attack angles or reinforce weak positions before your opponent's turn."
        },
        {
          heading: "Ransom",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640" fill="#ee484c">
              <path d="M320 64C324.6 64 329.2 65 333.4 66.9L521.8 146.8C543.8 156.1 560.2 177.8 560.1 204C559.6 303.2 518.8 484.7 346.5 567.2C329.8 575.2 310.4 575.2 293.7 567.2C121.3 484.7 80.6 303.2 80.1 204C80 177.8 96.4 156.1 118.4 146.8L306.7 66.9C310.9 65 315.4 64 320 64zM320 130.8L320 508.9C458 442.1 495.1 294.1 496 205.5L320 130.9L320 130.9z"/>
            </svg>
          ),
          cost: "Cost: 2 Captives → Recover 1 from Void",
          description: "Trade 2 captured enemy tokens to recover 1 of your own tokens from the void back to your reserves. This gives you back material that was lost to forced yields, special action costs, or other void transfers.",
          strategy: "Use when: You have excess captives but are running low on reserves. Converting captives into usable reserves can turn the tide when you're at a material disadvantage."
        },
        {
          heading: "Early Swap",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640" fill="#ee484c">
              <path d="M576 160C576 210.2 516.9 285.1 491.4 315C487.6 319.4 482 321.1 476.9 320L384 320C366.3 320 352 334.3 352 352C352 369.7 366.3 384 384 384L480 384C533 384 576 427 576 480C576 533 533 576 480 576L203.6 576C212.3 566.1 222.9 553.4 233.6 539.2C239.9 530.8 246.4 521.6 252.6 512L480 512C497.7 512 512 497.7 512 480C512 462.3 497.7 448 480 448L384 448C331 448 288 405 288 352C288 299 331 256 384 256L423.8 256C402.8 224.5 384 188.3 384 160C384 107 427 64 480 64C533 64 576 107 576 160zM181.1 553.1C177.3 557.4 173.9 561.2 171 564.4L169.2 566.4L169 566.2C163 570.8 154.4 570.2 149 564.4C123.8 537 64 466.5 64 416C64 363 107 320 160 320C213 320 256 363 256 416C256 446 234.9 483 212.5 513.9C201.8 528.6 190.8 541.9 181.7 552.4L181.1 553.1zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM480 192C497.7 192 512 177.7 512 160C512 142.3 497.7 128 480 128C462.3 128 448 142.3 448 160C448 177.7 462.3 192 480 192z"/>
            </svg>
          ),
          cost: "Cost: 2 Captured Enemy Tokens → Void",
          description: "If you don't want to wait until the end of your turn to do a free route swap, you can yield 2 captured enemy tokens to get an immediate route swap, which you can use during your turn.",
          strategy: "Use when: You need a specific route to complete your attack mid-turn, or you want to deny a strong route from your opponent's upcoming swap."
        },
        {
          heading: "Defection",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640" fill="#ee484c">
              <path d="M512 320C512 214 426 128 320 128L320 512C426 512 512 426 512 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/>
            </svg>
          ),
          cost: "Cost: 1 of Your Own Tokens → Void",
          description: "Sacrifice one of your own tokens in play to the void to pull one enemy token from the void into your captives. Select the token you want to sacrifice after arming Defection.",
          strategy: "Use when: Your opponent is close to triggering Draft and you want to deny them the material, or you need more enemy captives to pay for Ransom or Early Route Swap."
        }
      ]
    },
    recoil: {
      title: "Recoil",
      sections: [
        {
          heading: "Act During Opponent's Turn",
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640" fill="#ee484c">
              <path d="M168.1 531.1L156.9 540.1C153.7 542.6 149.8 544 145.8 544C136 544 128 536 128 526.2L128 256C128 150 214 64 320 64C426 64 512 150 512 256L512 526.2C512 536 504 544 494.2 544C490.2 544 486.3 542.6 483.1 540.1L471.9 531.1C458.5 520.4 439.1 522.1 427.8 535L397.3 570C394 573.8 389.1 576 384 576C378.9 576 374.1 573.8 370.7 570L344.1 539.5C331.4 524.9 308.7 524.9 295.9 539.5L269.3 570C266 573.8 261.1 576 256 576C250.9 576 246.1 573.8 242.7 570L212.2 535C200.9 522.1 181.5 520.4 168.1 531.1zM288 256C288 238.3 273.7 224 256 224C238.3 224 224 238.3 224 256C224 273.7 238.3 288 256 288C273.7 288 288 273.7 288 256zM384 288C401.7 288 416 273.7 416 256C416 238.3 401.7 224 384 224C366.3 224 352 238.3 352 256C352 273.7 366.3 288 384 288z"/>
            </svg>
          ),
          cost: "Cost: 1 Captive + 1 Reserve → Void",
          description: "The only move you can do during your opponent's turn. You must yield 1 captured token and 1 reserve token to the void to use it. Move 1 token 1 space in any direction. You cannot move a sieged token. You cannot invade or capture with this move. This is not an undo; you cannot undo a capture on your token with this.",
          strategy: "Use when: A critical token is about to be captured or is about to be fully sieged. Bait an opponent into moving and set a trap or siege."
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
            {data.title}
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
          {data.sections.map((section, idx) => (
            <div key={idx} style={{ borderBottom: idx < data.sections.length - 1 ? "1px solid rgba(184,150,106,0.20)" : "none", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                {section.icon}
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
                  {section.heading}
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
                {section.cost}
              </div>

              <p
                style={{
                  fontSize: "1.05rem",
                  fontFamily: "'EB Garamond', serif",
                  color: "#e8e4d8",
                  marginBottom: "12px",
                  lineHeight: "1.5",
                  margin: "0 0 12px 0",
                }}
              >
                {section.description}
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
