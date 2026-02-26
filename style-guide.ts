import { useState } from "react"

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');`

const T = {
  bgBase:        "#0a0a0c",
  bgSurface:     "#0f0f14",
  bgElevated:    "#13131a",
  bgHeader:      "#0d0d10",
  borderSubtle:  "rgba(255,255,255,0.07)",
  borderMid:     "rgba(255,255,255,0.12)",
  borderStrong:  "rgba(255,255,255,0.20)",
  textPrimary:   "#e8e4d8",
  textSecondary: "#b0aa9e",
  textMuted:     "#6b6558",
  textFaint:     "#3a3830",
  gold:          "#b8966a",
  goldBright:    "#d4af7a",
  goldDim:       "#8a6e4a",
  cyan:          "#5de8f7",
  cyanDim:       "rgba(93,232,247,0.15)",
  red:           "#ee484c",
  fontDisplay:   "'Cinzel Decorative', serif",
  fontLabel:     "'Cinzel', serif",
  fontBody:      "'EB Garamond', Georgia, serif",
  fontMono:      "monospace",
}

function Swatch({ name, value }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ width: "100%", height: 48, borderRadius: 6, background: value, border: `1px solid ${T.borderMid}`, transition: "opacity 0.15s" }} />
      <div style={{ fontFamily: T.fontLabel, fontSize: "0.48rem", letterSpacing: "0.15em", color: T.textMuted, textTransform: "uppercase" }}>{name}</div>
      <div style={{ fontFamily: T.fontMono, fontSize: "0.6rem", color: copied ? T.cyan : T.textFaint }}>{copied ? "Copied!" : value}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.borderSubtle, margin: "0 0 36px" }} />
}

function Label({ children }) {
  return (
    <div style={{ fontFamily: T.fontLabel, fontSize: "0.52rem", letterSpacing: "0.45em", textTransform: "uppercase", color: T.textMuted, marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
      {children}
      <div style={{ flex: 1, height: 1, background: T.borderSubtle }} />
    </div>
  )
}

const ORDERS = [
  { name: "Order of the Dragon", doctrine: "Explosive Initiative",    accent: "#D4AF37", body: "Masters of the opening. Dragon players seize the board before opponents stabilize — explosive sieges launched before defenses form." },
  { name: "Order of the Wolf",   doctrine: "Relentless Elimination",  accent: "#0047AB", body: "Hunters, not builders. The Wolf doctrine ignores territory and hunts tokens relentlessly — isolating, pressuring, removing." },
  { name: "Order of the Raven",  doctrine: "Tempo Control",           accent: "#4B2A7A", body: "The clock is a weapon. Ravens control tempo and route priority, denying opponents the sequences they need." },
]

export default function VekkeDesignSystem() {
  const [selectedCard, setSelectedCard] = useState(null)

  return (
    <>
      <style>{FONTS}</style>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: ${T.borderMid}; border-radius: 3px; }
        .btn-gold:hover  { background: rgba(184,150,106,0.22) !important; border-color: rgba(184,150,106,0.7) !important; }
        .btn-cyan:hover  { background: rgba(93,232,247,0.22) !important; }
        .btn-ghost:hover { border-color: ${T.borderStrong} !important; color: ${T.textSecondary} !important; }
        .vk-input:focus  { outline: none; border-color: ${T.gold} !important; }
        .order-card:hover { border-color: ${T.borderMid} !important; }
      `}</style>

      <div style={{ background: T.bgBase, minHeight: "100vh", color: T.textPrimary, fontFamily: T.fontBody, padding: "48px 28px 100px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* ── Header ── */}
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <div style={{ fontFamily: T.fontLabel, fontSize: "0.52rem", letterSpacing: "0.5em", color: T.gold, textTransform: "uppercase", marginBottom: 14, opacity: 0.8 }}>Vekke · Design System</div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: "clamp(1.8rem, 5vw, 3rem)", fontWeight: 700, color: T.textPrimary, lineHeight: 1, marginBottom: 18 }}>Design Tokens</div>
            <div style={{ width: 100, height: 1, background: `linear-gradient(90deg, transparent, ${T.gold}, transparent)`, margin: "0 auto 18px" }} />
            <div style={{ fontFamily: T.fontBody, fontSize: "1rem", color: T.textSecondary, fontStyle: "italic", maxWidth: 380, margin: "0 auto" }}>
              Click swatches to copy. Interact with every component.
            </div>
          </div>

          {/* ── Colors ── */}
          <Label>Backgrounds</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 36 }}>
            <Swatch name="bgBase" value={T.bgBase} />
            <Swatch name="bgSurface" value={T.bgSurface} />
            <Swatch name="bgElevated" value={T.bgElevated} />
            <Swatch name="bgHeader" value={T.bgHeader} />
          </div>

          <Label>Text</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 36 }}>
            <Swatch name="textPrimary" value={T.textPrimary} />
            <Swatch name="textSecondary" value={T.textSecondary} />
            <Swatch name="textMuted" value={T.textMuted} />
            <Swatch name="textFaint" value={T.textFaint} />
          </div>

          <Label>Accents</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 48 }}>
            <Swatch name="gold" value={T.gold} />
            <Swatch name="goldBright" value={T.goldBright} />
            <Swatch name="goldDim" value={T.goldDim} />
            <Swatch name="cyan" value={T.cyan} />
            <Swatch name="red" value={T.red} />
          </div>

          <Divider />

          {/* ── Typography ── */}
          <Label>Typography</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 28, background: T.bgSurface, borderRadius: 10, border: `1px solid ${T.borderSubtle}`, marginBottom: 48 }}>
            <div>
              <div style={{ fontFamily: T.fontDisplay, fontSize: "clamp(1.5rem, 4vw, 2.4rem)", fontWeight: 700, color: T.textPrimary, lineHeight: 1.1 }}>Choose Your Doctrine</div>
            </div>
            <div style={{ height: 1, background: T.borderSubtle }} />
            <div>
              <div style={{ fontFamily: T.fontLabel, fontSize: "1.15rem", fontWeight: 600, color: T.textPrimary }}>Order of the Wolf</div>
            </div>
            <div style={{ height: 1, background: T.borderSubtle }} />
            <div>
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.45em", textTransform: "uppercase", color: T.gold }}>Current Allegiance</div>
            </div>
            <div style={{ height: 1, background: T.borderSubtle }} />
            <div>
              <div style={{ fontFamily: T.fontBody, fontSize: "1.2rem", fontStyle: "italic", color: T.textPrimary, lineHeight: 1.75, maxWidth: 480 }}>
                Every serious player eventually develops a philosophy. The Orders formalize what already exists — schools of strategic thought that have emerged from competitive play.
              </div>
            </div>
            <div style={{ height: 1, background: T.borderSubtle }} />
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: "1.4rem", fontWeight: 700, color: T.textPrimary, letterSpacing: "0.05em" }}>5:32</div>
              <div style={{ fontFamily: T.fontMono, fontSize: "0.85rem", color: T.textSecondary, marginTop: 6 }}>ELO 1240 · W/B notation</div>
            </div>
          </div>

          <Divider />

          {/* ── Buttons ── */}
          <Label>Buttons — hover to test</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 24, background: T.bgSurface, borderRadius: 10, border: `1px solid ${T.borderSubtle}`, marginBottom: 48 }}>
            <button className="btn-gold" style={{ fontFamily: T.fontLabel, fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", padding: "11px 22px", borderRadius: 4, cursor: "pointer", border: `1px solid rgba(184,150,106,0.5)`, background: "rgba(184,150,106,0.12)", color: T.goldBright, transition: "all 0.15s" }}>
              Pledge Allegiance
            </button>
            <button className="btn-cyan" style={{ fontFamily: T.fontLabel, fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", padding: "11px 22px", borderRadius: 4, cursor: "pointer", border: `1px solid ${T.cyan}`, background: T.cyanDim, color: T.cyan, transition: "all 0.15s" }}>
              Save
            </button>
            <button className="btn-ghost" style={{ fontFamily: T.fontLabel, fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", padding: "10px 16px", borderRadius: 4, cursor: "pointer", border: `1px solid ${T.borderMid}`, background: "transparent", color: T.textMuted, transition: "all 0.15s" }}>
              Renounce
            </button>
            <button style={{ fontFamily: T.fontLabel, fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", padding: "10px 16px", borderRadius: 4, cursor: "not-allowed", border: `1px solid ${T.borderSubtle}`, background: "transparent", color: T.textFaint, opacity: 0.4 }}>
              Disabled
            </button>
          </div>

          {/* ── Inputs ── */}
          <Label>Inputs — click to focus (gold border)</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360, padding: 24, background: T.bgSurface, borderRadius: 10, border: `1px solid ${T.borderSubtle}`, marginBottom: 48 }}>
            <input className="vk-input" placeholder="Username" style={{ fontFamily: T.fontBody, fontSize: "1rem", padding: "10px 14px", borderRadius: 6, border: `1px solid ${T.borderMid}`, background: T.bgBase, color: T.textPrimary, transition: "border-color 0.15s", width: "100%" }} />
            <input className="vk-input" placeholder="Search players..." style={{ fontFamily: T.fontBody, fontSize: "1rem", padding: "10px 14px", borderRadius: 6, border: `1px solid ${T.borderMid}`, background: T.bgBase, color: T.textPrimary, transition: "border-color 0.15s", width: "100%" }} />
          </div>

          <Divider />

          {/* ── Cards ── */}
          <Label>Order Cards — click to select</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 48 }}>
            {ORDERS.map((o, i) => {
              const sel = selectedCard === i
              return (
                <div
                  key={i}
                  className={sel ? "" : "order-card"}
                  onClick={() => setSelectedCard(sel ? null : i)}
                  style={{ padding: 18, borderRadius: 10, border: sel ? `2px solid ${o.accent}` : `1px solid ${T.borderSubtle}`, background: T.bgSurface, cursor: "pointer", transition: "border-color 0.15s", position: "relative", overflow: "hidden" }}
                >
                  {sel && <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${o.accent}14 0%, transparent 65%)`, pointerEvents: "none" }} />}
                  <div style={{ position: "relative" }}>
                    <div style={{ fontFamily: T.fontLabel, fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", color: o.accent, marginBottom: 8 }}>{o.doctrine}</div>
                    <div style={{ fontFamily: T.fontLabel, fontSize: "1.15rem", fontWeight: 600, color: sel ? o.accent : T.textPrimary, marginBottom: 12 }}>{o.name}</div>
                    <div style={{ height: 1, background: T.borderSubtle, marginBottom: 10 }} />
                    <div style={{ fontFamily: T.fontBody, fontSize: "1.1rem", color: T.textSecondary, fontStyle: "italic", lineHeight: 1.7 }}>{o.body}</div>
                    {sel && <div style={{ marginTop: 12, fontFamily: T.fontLabel, fontSize: "0.48rem", letterSpacing: "0.2em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 2, background: o.accent, color: "#0a0a0a", display: "inline-block" }}>Selected</div>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Allegiance Banner ── */}
          <Label>Allegiance Banner</Label>
          <div style={{ padding: "14px 18px", borderRadius: 10, border: `1px solid rgba(184,150,106,0.25)`, background: "rgba(184,150,106,0.04)", display: "flex", alignItems: "center", gap: 14, marginBottom: 48 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, background: "rgba(184,150,106,0.15)", border: `1px solid rgba(184,150,106,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontLabel, fontSize: "1rem", color: T.gold }}>W</div>
            <div>
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.5rem", letterSpacing: "0.4em", textTransform: "uppercase", color: T.gold, opacity: 0.75, marginBottom: 4 }}>Current Allegiance</div>
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.95rem", fontWeight: 600, color: T.goldBright }}>Order of the Wolf</div>
            </div>
          </div>

          <Divider />

          {/* ── Game UI ── */}
          <Label>Game UI Elements</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 48 }}>
            <div style={{ padding: "12px 18px", background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 8 }}>
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: T.textSecondary, marginBottom: 4 }}>Clock</div>
              <div style={{ fontFamily: T.fontMono, fontSize: "1.5rem", fontWeight: 700, color: T.textPrimary, letterSpacing: "0.05em" }}>5:32</div>
            </div>
            <div style={{ padding: "12px 18px", background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 8 }}>
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: T.textSecondary, marginBottom: 4 }}>Rating</div>
              <div style={{ fontFamily: T.fontMono, fontSize: "1.1rem", fontWeight: 700, color: T.cyan }}>1 240</div>
            </div>
            <div style={{ padding: "12px 18px", background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.cyan, boxShadow: `0 0 8px ${T.cyan}` }} />
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.52rem", letterSpacing: "0.3em", textTransform: "uppercase", color: T.cyan }}>Your Turn</div>
            </div>
            <div style={{ padding: "12px 18px", background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #5de8f7 0%, #26c6da 55%, #0b1220 100%)", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }} />
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: T.textSecondary }}>Wake</div>
            </div>
            <div style={{ padding: "12px 18px", background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #ee484c 0%, #c0392b 55%, #0b0b0b 100%)", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }} />
              <div style={{ fontFamily: T.fontLabel, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: T.textSecondary }}>Brake</div>
            </div>
          </div>

          {/* ── Dividers ── */}
          <Label>Dividers & Rules</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 24, background: T.bgSurface, borderRadius: 10, border: `1px solid ${T.borderSubtle}` }}>
            <div><div style={{ fontFamily: T.fontLabel, fontSize: "0.44rem", letterSpacing: "0.25em", color: T.textFaint, textTransform: "uppercase", marginBottom: 8 }}>Subtle</div><div style={{ height: 1, background: T.borderSubtle }} /></div>
            <div><div style={{ fontFamily: T.fontLabel, fontSize: "0.44rem", letterSpacing: "0.25em", color: T.textFaint, textTransform: "uppercase", marginBottom: 8 }}>Mid</div><div style={{ height: 1, background: T.borderMid }} /></div>
            <div><div style={{ fontFamily: T.fontLabel, fontSize: "0.44rem", letterSpacing: "0.25em", color: T.textFaint, textTransform: "uppercase", marginBottom: 8 }}>Gold Rule</div><div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.gold}, transparent)` }} /></div>
            <div><div style={{ fontFamily: T.fontLabel, fontSize: "0.44rem", letterSpacing: "0.25em", color: T.textFaint, textTransform: "uppercase", marginBottom: 8 }}>Gold Rule Centered</div><div style={{ width: 80, height: 1, background: `linear-gradient(90deg, transparent, ${T.gold}, transparent)`, margin: "0 auto" }} /></div>
          </div>

        </div>
      </div>
    </>
  )
}