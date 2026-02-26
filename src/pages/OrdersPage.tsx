import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

type OrderRow = {
  id: string
  name: string
  doctrine: string
  primary_color: string
  secondary_color: string
  sigil_url: string | null
  sort_order: number
  is_active: boolean
}

const ORDER_DESCRIPTIONS: Record<string, string> = {
  dragon:  "Masters of the opening. Dragon players seize the board before opponents stabilize — explosive sieges launched before defenses form. If you end games early, you are Dragon.",
  wolf:    "Hunters, not builders. The Wolf doctrine ignores territory and hunts tokens relentlessly — isolating, pressuring, removing. The board empties. The Wolf wins.",
  serpent: "Patience as a weapon. Serpent players establish siege lines and hold them. No rush, no overextension. The board compresses. Space collapses. Opponents surrender to inevitability.",
  spider:  "Geometry over force. Spiders build threat networks — siege formations that cover multiple lanes simultaneously. The enemy moves into one trap while escaping another.",
  raven:   "The clock is a weapon. Ravens control tempo and route priority, denying opponents the sequences they need. Every exchange happens on Raven terms.",
  kraken:  "No fixed doctrine. Kraken players read board states and shift — aggressive one moment, defensive the next. Impossible to predict. Dangerous in any phase.",
  turtle:  "Economy is destiny. The Turtle denies resources, hoards drafts, and outlasts. While opponents burn tokens on failed sieges, the Turtle waits — and wins on supply.",
  stag:    "Never be caught. Stag players master repositioning — formations that slip siege, frustrate pursuit, and score from unexpected angles. Speed is the only armor.",
  fox:     "Mistakes are gifts. The Fox invites aggression and punishes it. Calculated sacrifice, deliberate overextension bait, counterstrikes after commitment. Your aggression is their weapon.",
}


function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-orders-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-orders-fonts"
  link.rel = "stylesheet"
  link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
}

export default function OrdersPage() {
  injectFonts()
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<any | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (error) { setErr(error.message); setLoading(false); return }
      const uid = data.session?.user?.id ?? null
      setUserId(uid)
      if (!uid) setLoading(false)
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!userId) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setErr(null)
      const [ordersRes, profileRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id,name,doctrine,primary_color,secondary_color,sigil_url,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("profiles")
          .select("id,username,avatar_url,order_id")
          .eq("id", userId)
          .maybeSingle(),
      ])
      if (!mounted) return
      if (ordersRes.error) { setErr(ordersRes.error.message); setLoading(false); return }
      if (profileRes.error) { setErr(profileRes.error.message); setLoading(false); return }
      const ords = (ordersRes.data ?? []) as OrderRow[]
      const profile = profileRes.data as any
      const oid = (profile?.order_id ?? null) as string | null
      setOrders(ords)
      setMe(profile ?? null)
      setCurrentOrderId(oid)
      setSelectedOrderId(oid)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [userId])

  const dirty = useMemo(() => selectedOrderId !== currentOrderId, [selectedOrderId, currentOrderId])
  const currentOrder = useMemo(() => orders.find(o => o.id === currentOrderId) ?? null, [orders, currentOrderId])

  async function save() {
    if (!userId) return
    setBusy(true)
    setErr(null)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ order_id: selectedOrderId })
        .eq("id", userId)
      if (error) throw error
      setCurrentOrderId(selectedOrderId)
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.")
    } finally {
      setBusy(false)
    }
  }

  function OrderCard({ o }: { o: OrderRow }) {
    const selected = selectedOrderId === o.id
    const desc = ORDER_DESCRIPTIONS[o.id] ?? ""
    const initial = o.name.replace("Order of the ", "").charAt(0)
    // Orders where primary drives selected state and doctrine label
    const accentColor = ["wolf", "raven", "fox"].includes(o.id) ? o.primary_color : o.secondary_color

    return (
      <button
        onClick={() => setSelectedOrderId(o.id)}
        style={{
          textAlign: "left",
          width: "100%",
          padding: 0,
          borderRadius: 12,
          border: selected ? `2px solid ${accentColor}` : "1px solid rgba(255,255,255,0.09)",
          background: "#0f0f14",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          transition: "border-color 0.15s",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Banner image — full width portrait */}
        <div style={{
          width: "100%",
          aspectRatio: "3 / 4",
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(160deg, ${o.primary_color}44 0%, #111827 100%)`,
          flexShrink: 0,
        }}>
          {o.sigil_url ? (
            <img
              src={o.sigil_url}
              alt={o.name}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center top",
                display: "block",
              }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: o.secondary_color, fontSize: "4rem", fontWeight: 900, opacity: 0.3 }}>{initial}</span>
            </div>
          )}

          {/* Fade into card body */}
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            height: "40%",
            background: "linear-gradient(to bottom, transparent, #0f0f14)",
            pointerEvents: "none",
          }} />

          {/* Selected badge */}
          {selected && (
            <div style={{
              position: "absolute",
              top: 10, right: 10,
              fontFamily: "'Cinzel', serif",
              fontSize: "0.5rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              padding: "4px 9px",
              borderRadius: 2,
              background: accentColor,
              color: "#0a0a0a",
            }}>
              Selected
            </div>
          )}
        </div>

        {/* Card body */}
        <div style={{ padding: "14px 16px 16px", position: "relative" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(ellipse at 50% 0%, ${o.primary_color}14 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative" }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: accentColor,
              marginBottom: 8,
            }}>
              {o.doctrine}
            </div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "1.15rem",
              fontWeight: 600,
              color: selected ? accentColor : "#e8e4d8",
              marginBottom: 12,
              lineHeight: 1.2,
            }}>
              {o.name}
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 10 }} />
            <div style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1.1rem", color: "#b0aa9e", lineHeight: 1.7, fontStyle: "italic" }}>
              {desc}
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div style={{
      inset: 0,
      width: "100vw",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#0a0a0c",
      fontFamily: "'EB Garamond', Georgia, serif",
      color: "#e8e4d8",
      overflow: "hidden",
    }}>
      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel="Orders"
        elo={undefined}
        activePage="orders"
        onSignIn={() => {
          const rt = encodeURIComponent(`/orders`)
          window.location.assign(`/?openAuth=1&returnTo=${rt}`)
        }}
        onOpenProfile={() => navigate("/?openProfile=1")}
        onOpenSkins={() => navigate("/skins")}
        onSignOut={async () => { await supabase.auth.signOut(); navigate("/") }}
        onPlay={() => navigate("/")}
        onMyGames={() => navigate("/challenges")}
        onLeaderboard={() => navigate("/leaderboard")}
        onOrders={() => navigate("/orders")}
        onChallenges={() => navigate("/challenges")}
        onRules={() => navigate("/rules")}
        onTutorial={() => navigate("/tutorial")}
      />

      <div style={{ flex: 1, overflowY: "auto" }} className="hide-scrollbar">

        {/* Intro block */}
        <div style={{
          padding: "32px 16px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "#0d0d10",
        }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.4em", color: "#b8966a", textTransform: "uppercase", marginBottom: 12, opacity: 0.9 }}>
              The Orders of Vekke
            </div>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: "clamp(1.4rem, 4vw, 2.2rem)", fontWeight: 700, color: "#e8e4d8", marginBottom: 14, lineHeight: 1.1 }}>
              Choose Your Doctrine
            </div>
            <div style={{ width: 80, height: 1, background: "linear-gradient(90deg, transparent, #b8966a, transparent)", marginBottom: 16 }} />
            <div style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1.2rem", color: "#b0aa9e", lineHeight: 1.75, fontStyle: "italic", textAlign: "justify" }}>
              Every serious player eventually develops a philosophy. The Orders formalize what already exists —
              schools of strategic thought that have emerged from competitive play. They carry no mechanical advantage
              and change no rules. They are a statement of how you see the board.
            </div>
            <div style={{ marginTop: 14, fontFamily: "'Cinzel', serif", fontSize: "0.8rem", color: "#6b6558", letterSpacing: "0.25em", textTransform: "uppercase" }}>
              No gameplay effect · Cosmetic identity only · Leave at any time
            </div>
          </div>
        </div>

        <div style={{ padding: "28px 16px 60px", maxWidth: 900, margin: "0 auto", width: "100%" }}>

          {err && (
            <div style={{
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.08)",
              color: "#fca5a5",
              fontSize: "0.875rem",
            }}>
              {err}
            </div>
          )}

          {/* Current allegiance banner */}
          {currentOrder && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 12,
              border: `1px solid ${currentOrder.secondary_color}40`,
              background: "rgba(255,255,255,0.03)",
              marginBottom: 24,
            }}>
              {currentOrder.sigil_url && (
                <img
                  src={currentOrder.sigil_url}
                  alt=""
                  draggable={false}
                  style={{
                    width: 40, height: 40,
                    borderRadius: 6,
                    objectFit: "cover",
                    objectPosition: "center top",
                    flexShrink: 0,
                  }}
                />
              )}
              <div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.55rem", fontWeight: 600, letterSpacing: "0.4em", textTransform: "uppercase", color: "#b8966a", marginBottom: 4, opacity: 0.8 }}>
                  Current Allegiance
                </div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1rem", fontWeight: 600, color: currentOrder.secondary_color }}>
                  {currentOrder.name}
                </div>
              </div>
            </div>
          )}

          {/* Section label */}
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: "0.58rem",
            fontWeight: 600,
            letterSpacing: "0.45em",
            textTransform: "uppercase",
            color: "#6b6558",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            The Nine Orders
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", fontFamily: "'Cinzel', serif", color: "#6b6558", fontSize: "0.65rem", letterSpacing: "0.3em", textTransform: "uppercase" }}>
              Loading...
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
              marginBottom: 32,
            }}>
              {orders.map(o => <OrderCard key={o.id} o={o} />)}
            </div>
          )}

          {/* Action row — sticky */}
          <div style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "14px 0",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            background: "linear-gradient(to bottom, transparent, #0a0a0c 30%)",
            zIndex: 10,
          }}>
            <button
              disabled={busy || loading || selectedOrderId === null}
              onClick={() => setSelectedOrderId(null)}
              style={{
                fontFamily: "'Cinzel', serif",
                padding: "10px 16px",
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: selectedOrderId === null ? "#3a3830" : "#6b6558",
                fontWeight: 600,
                fontSize: "0.6rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: selectedOrderId === null ? "not-allowed" : "pointer",
              }}
            >
              Renounce
            </button>

            <button
              disabled={!dirty || busy || loading}
              onClick={() => save().catch(e => setErr((e as any)?.message ?? "Failed to save."))}
              style={{
                fontFamily: "'Cinzel', serif",
                padding: "11px 22px",
                borderRadius: 4,
                border: !dirty || busy || loading ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(184,150,106,0.5)",
                background: !dirty || busy || loading ? "rgba(255,255,255,0.03)" : "rgba(184,150,106,0.12)",
                color: !dirty || busy || loading ? "#3a3830" : "#d4af7a",
                fontWeight: 600,
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: !dirty || busy || loading ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Pledging..." : "Pledge Allegiance"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
