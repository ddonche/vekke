// src/pages/SkinsPage.tsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"
import { SkinSelector } from "../components/SkinSelector"

function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-skins-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-skins-fonts"
  link.rel = "stylesheet"
  link.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
}

export function SkinsPage() {
  injectFonts()

  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        navigate("/")
        return
      }
      const uid = data.session.user.id
      setUserId(uid)
      const { data: myp } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, order_id")
        .eq("id", uid)
        .single()
      if (myp) {
        setMe(myp as any)
        setOrderId((myp as any).order_id ?? null)
      }
      setLoading(false)
    })
  }, [navigate])

  if (loading) {
    return (
      <div style={{ background: "#0a0a0c", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.72rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "#6b6558" }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: "fixed", inset: 0, width: "100vw", height: "100vh",
      display: "flex", flexDirection: "column",
      backgroundColor: "#0a0a0c",
      fontFamily: "'EB Garamond', Georgia, serif",
      color: "#e8e4d8",
      overflow: "hidden",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #0a0a0c; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        titleLabel="Gear"
        elo={undefined}
        activePage="skins"
        myGamesTurnCount={0}
        onSignIn={() => navigate("/")}
        onOpenProfile={() => navigate("/?openProfile=1")}
        onOpenSkins={() => navigate("/skins")}
        onSignOut={async () => { await supabase.auth.signOut(); navigate("/") }}
        onPlay={() => navigate("/")}
        onMyGames={() => navigate("/challenges")}
        onLeaderboard={() => navigate("/leaderboard")}
        onChallenges={() => navigate("/challenges")}
        onOrders={() => navigate("/orders")}
        onRules={() => navigate("/rules")}
        onTutorial={() => navigate("/tutorial")}
      />

      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "28px 24px 60px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>

          {/* Page title — same as "My Games" in ChallengesPage */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: "1.3rem", fontWeight: 700, color: "#e8e4d8", letterSpacing: "0.06em" }}>
              Gear
            </div>
          </div>

          {userId && <SkinSelector userId={userId} orderId={orderId} />}

        </div>
      </div>
    </div>
  )
}
