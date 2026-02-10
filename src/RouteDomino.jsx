import { useState } from "react"

// ─── Inject shared styles once ───────────────────────────────────────────────
function injectStyles() {
  if (typeof document === "undefined") return
  const old = document.getElementById("route-domino-styles")
  if (old) old.remove()
  const s = document.createElement("style")
  s.id = "route-domino-styles"
  s.textContent = `
    :root {
      --accent:     #ffffff;
      --accent-mid: #e0e0e0;
      --accent-lo:  #b0b0b0;
    }

    .route-domino {
      position: relative;
      width: var(--w, 4.5em);
      height: var(--h, 7em);
      border-radius: 0.55em;
      background:
        radial-gradient(circle at 50% 55%,
          rgba(0,0,0,0.00) 35%,
          rgba(0,0,0,0.30) 100%
        ),
        linear-gradient(175deg, #3aa8bf 0%, #3296ab 35%, #27809a 100%);
      box-shadow:
        inset -0.14em -0.14em 0.55em rgba(0,0,0,0.55),
        inset  0.14em  0.14em 0.55em rgba(255,255,255,0.16),
        inset 0 0 1.2em rgba(0,0,0,0.18),
        0 0.30em 0.80em rgba(0,0,0,0.65),
        0 0.15em 0.30em rgba(0,0,0,0.42);
      filter: drop-shadow(0 0.08em 0 rgba(0,0,0,0.22));
      transform: translateZ(0);
      user-select: none;
      overflow: hidden;
      transition: box-shadow 0.15s ease, filter 0.15s ease, transform 0.1s ease;
      font-size: var(--domino-fs, 16px);
    }

    /* selected state handled via inline style */

    /* inner rim bevel */
    .route-domino::before {
      content: "";
      position: absolute;
      inset: 0.10em;
      border-radius: 0.48em;
      box-shadow:
        inset 0 0.05em 0.10em rgba(255,255,255,0.16),
        inset 0 -0.12em 0.16em rgba(0,0,0,0.48);
      pointer-events: none;
      z-index: 6;
    }

    /* specular — linear wash, top edge bright fading down. Flat = linear, not radial. */
    .route-domino::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 45%;
      background: linear-gradient(180deg,
        rgba(255,255,255,0.11) 0%,
        rgba(255,255,255,0.04) 50%,
        rgba(255,255,255,0.00) 100%
      );
      pointer-events: none;
      z-index: 5;
    }

    .route-domino .divider {
      position: absolute;
      left: 0.55em;
      right: 0.55em;
      top: 50%;
      height: 0.10em;
      transform: translateY(-50%);
      background: rgba(0,0,0,0.55);
      box-shadow: 0 0.08em 0 rgba(255,255,255,0.08);
      opacity: 0.9;
      z-index: 8;
    }

    .route-domino .pip {
      position: absolute;
      border-radius: 999px;
      background:
        linear-gradient(135deg,
          rgba(0,0,0,0.15) 0%,
          rgba(0,0,0,0.00) 52%
        ),
        linear-gradient(135deg,
          transparent 52%,
          rgba(255,255,255,0.50) 100%
        ),
        radial-gradient(circle at 50% 50%,
          #ffffff 0%,
          #e8e8e8 50%,
          #d0d0d0 100%
        );
      box-shadow:
        0.06em 0.08em 0.10em rgba(0,0,0,0.45);
    }

    .route-domino .arrow {
      position: relative;
      flex-shrink: 0;
    }

    .route-domino .arrow-body {
      position: absolute;
      inset: 0;
      clip-path: polygon(50% 2%, 87% 46%, 66% 46%, 66% 98%, 34% 98%, 34% 46%, 13% 46%);
      background: linear-gradient(160deg,
        #ffffff 0%,
        #e8e8e8 50%,
        #d0d0d0 100%
      );
    }

    /* dark top-left + bright bottom-right = inset/stamped */
    .route-domino .arrow-hi {
      position: absolute;
      inset: 0;
      clip-path: polygon(50% 2%, 87% 46%, 66% 46%, 66% 98%, 34% 98%, 34% 46%, 13% 46%);
      background: linear-gradient(135deg,
        rgba(0,0,0,0.18) 0%,
        rgba(0,0,0,0.05) 38%,
        rgba(0,0,0,0.00) 55%
      );
    }

    /* bright bottom-right catch — light hitting the far inner wall */
    .route-domino .arrow-shadow {
      position: absolute;
      inset: 0;
      clip-path: polygon(50% 2%, 87% 46%, 66% 46%, 66% 98%, 34% 98%, 34% 46%, 13% 46%);
      background: linear-gradient(135deg,
        transparent 52%,
        rgba(255,255,255,0.40) 78%,
        rgba(255,255,255,0.55) 100%
      );
    }

    .route-domino .half {
      z-index: 8;
      position: absolute;
      left: 0; right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .route-domino .half-top {
      top: 0; bottom: 50%;
      border-radius: 0.55em 0.55em 0 0;
    }

    .route-domino .half-bottom {
      top: 50%; bottom: 0;
      border-radius: 0 0 0.55em 0.55em;
    }
  `
  document.head.appendChild(s)
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DIR_ROTATION = {
  N: 0, NE: 45, E: 90, SE: 135,
  S: 180, SW: 225, W: 270, NW: 315,
}

const PIP_LAYOUTS = {
  1: [{ x: 50, y: 50 }],
  2: [{ x: 30, y: 30 }, { x: 70, y: 70 }],
  3: [{ x: 50, y: 26 }, { x: 28, y: 68 }, { x: 72, y: 68 }],
  4: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 30, y: 70 }, { x: 70, y: 70 }],
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RouteDomino({ dir = "N", dist = 1, selected = false, size = 72, highlightColor = "#5de8f7" }) {
  injectStyles()

  const rotation = DIR_ROTATION[dir] ?? 0
  const pips = PIP_LAYOUTS[dist] ?? PIP_LAYOUTS[1]

  // em-based sizing: font-size is the scale knob
  const fs = size * (16 / 72) // 72px default → 16px base em
  const arrowEm = 2.2         // arrow box in em
  const pipEm = 0.46          // pip radius in em

  return (
    <div
      className="route-domino"
      style={{
        "--domino-fs": `${fs}px`,
        ...(selected ? {
          border: `2px solid ${highlightColor}`,
          boxSizing: "border-box",
          boxShadow: `0 0 10px ${highlightColor}72,
            inset -0.14em -0.14em 0.55em rgba(0,0,0,0.55),
            inset 0.14em 0.14em 0.55em rgba(255,255,255,0.16),
            inset 0 0 1.2em rgba(0,0,0,0.18),
            0 0.40em 1.00em rgba(0,0,0,0.72),
            0 0.15em 0.30em rgba(0,0,0,0.45)`,
          transform: "translateZ(0) translateY(-1px)",
        } : {})
      }}
    >
      <div className="divider" />

      {/* Top half: arrow */}
      <div className="half half-top">
        <div
          className="arrow"
          style={{
            width: `${arrowEm}em`,
            height: `${arrowEm}em`,
            transform: `rotate(${rotation}deg)`,
            filter: "drop-shadow(0.06em 0.08em 0.10em rgba(0,0,0,0.45))",
          }}
        >
          <div className="arrow-body" />
          <div className="arrow-hi" />
          <div className="arrow-shadow" />
        </div>
      </div>

      {/* Bottom half: pips */}
      <div className="half half-bottom" style={{ position: "absolute" }}>
        {pips.map((pip, i) => (
          <div
            key={i}
            className="pip"
            style={{
              left:   `calc(${pip.x}% - ${pipEm}em)`,
              top:    `calc(${pip.y}% - ${pipEm}em)`,
              width:  `${pipEm * 2}em`,
              height: `${pipEm * 2}em`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Demo ─────────────────────────────────────────────────────────────────────
const ORTHOGONAL = ["N", "E", "S", "W"]
const DIAGONAL   = ["NE", "SE", "SW", "NW"]

export default function App() {
  const [sel, setSel] = useState(null)

  const renderRow = (dir) => {
    const isOrtho = ORTHOGONAL.includes(dir)
    const dists = isOrtho ? [1, 2, 3, 4] : [1, 2, 3]
    const cols = isOrtho ? 4 : 3
    return (
      <div key={dir} style={{
        display: "grid",
        gridTemplateColumns: `36px repeat(${cols}, 80px)`,
        gap: "10px",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <div style={{ color: "#4b5563", fontSize: 9, letterSpacing: 1, textAlign: "right", paddingRight: 6 }}>
          {dir}
        </div>
        {dists.map(dist => {
          const k = `${dir}-${dist}`
          return (
            <div
              key={dist}
              style={{ display: "flex", justifyContent: "center", cursor: "pointer" }}
              onClick={() => setSel(k === sel ? null : k)}
            >
              <RouteDomino dir={dir} dist={dist} selected={sel === k} size={60} />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1d23",
      padding: "2rem",
      fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ color: "#5de8f7", fontSize: 11, marginBottom: "0.5rem", letterSpacing: 3, opacity: 0.7 }}>
        ROUTE DOMINO — ALL 28 VALID ROUTES
      </div>
      <div style={{ color: "#3296ab", fontSize: 9, marginBottom: "1.75rem", letterSpacing: 2 }}>
        ORTHOGONAL: DIST 1–4 &nbsp;·&nbsp; DIAGONAL: DIST 1–3
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ color: "#3296ab", fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>— ORTHOGONAL —</div>
        <div style={{ display: "grid", gridTemplateColumns: "36px repeat(4, 80px)", gap: "10px", alignItems: "end", marginBottom: 8 }}>
          <div />
          {[1,2,3,4].map(d => (
            <div key={d} style={{ color: "#3296ab", fontSize: 9, textAlign: "center", letterSpacing: 1 }}>DIST {d}</div>
          ))}
        </div>
        {ORTHOGONAL.map(renderRow)}
      </div>

      <div>
        <div style={{ color: "#3296ab", fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>— DIAGONAL —</div>
        <div style={{ display: "grid", gridTemplateColumns: "36px repeat(3, 80px)", gap: "10px", alignItems: "end", marginBottom: 8 }}>
          <div />
          {[1,2,3].map(d => (
            <div key={d} style={{ color: "#3296ab", fontSize: 9, textAlign: "center", letterSpacing: 1 }}>DIST {d}</div>
          ))}
        </div>
        {DIAGONAL.map(renderRow)}
      </div>

      <div style={{ marginTop: "2rem", color: "#2d3748", fontSize: 9, letterSpacing: 1 }}>
        CLICK ANY TILE TO TOGGLE SELECTION
      </div>
    </div>
  )
}
