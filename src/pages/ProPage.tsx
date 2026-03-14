import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

type Period = "monthly" | "annual"

function injectFonts() {
  if (document.getElementById("vekke-pro-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-pro-fonts"
  link.rel = "stylesheet"
  link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
}

const FEATURES = [
  { icon: "⚔", label: "Full Game History", description: "Complete replay archive for all PvP and AI games" },
  { icon: "◈", label: "Monthly Skin Drop", description: "Exclusive cosmetic skin set delivered every month" },
  { icon: "✦", label: "Pro Badge", description: "Flair displayed on your profile and in game lobbies" },
  { icon: "✎", label: "Bio & Social Links", description: "Customize your profile with a bio and social links" },
  { icon: "⬡", label: "Early Access", description: "First look at new features and game modes" },
]

export default function ProPage() {
  injectFonts()

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<any | null>(null)
  const [isPro, setIsPro] = useState(false)
  const [period, setPeriod] = useState<Period>("annual")
  const [purchasing, setPurchasing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 5000)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("success") === "true") {
      showToast("Welcome to Vekke Pro! Your account has been upgraded.", "success")
      window.history.replaceState({}, "", window.location.pathname)
    }
    if (params.get("cancelled") === "true") {
      showToast("Upgrade cancelled.", "error")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, account_tier, subscription_period")
          .eq("id", user.id)
          .single()

        setMe(profile ?? null)
        setIsPro(profile?.account_tier === "pro")
      }
    })()
  }, [])

  const handleUpgrade = async () => {
    if (!userId) {
      showToast("You must be signed in to upgrade.", "error")
      return
    }

    setPurchasing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Not authenticated")

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-subscription-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ period }),
        }
      )

      const data = await res.json()

      if (res.status === 409) {
        showToast("You are already a Pro member.", "error")
        return
      }
      if (!res.ok) throw new Error(data.error || "Upgrade failed")

      window.location.href = data.url
    } catch (err: any) {
      showToast(err.message || "Something went wrong.", "error")
    } finally {
      setPurchasing(false)
    }
  }

  const monthlyCost = 6.99
  const annualCost = 59.99
  const annualMonthly = (annualCost / 12).toFixed(2)
  const annualSavings = ((monthlyCost * 12) - annualCost).toFixed(2)

  return (
    <div className="pro-page">
      {toast && (
        <div className={`pro-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        activePage={null}
      />

      <div className="pro-scroll">

        {/* Hero */}
        <section className="pro-hero">
          <div className="pro-hero-inner">
            <div className="pro-eyebrow">Vekke Pro</div>
            <h1 className="pro-title">Master the Board.</h1>
            <p className="pro-subtitle">
              Support the game. Unlock the archive. Receive exclusive cosmetics every month.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="pro-features-section">
          <div className="pro-features-inner">
            <div className="pro-features-grid">
              {FEATURES.map((f) => (
                <div key={f.label} className="pro-feature">
                  <div className="pro-feature-icon">{f.icon}</div>
                  <div>
                    <div className="pro-feature-label">{f.label}</div>
                    <div className="pro-feature-desc">{f.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="pro-pricing-section">
          <div className="pro-pricing-inner">

            {isPro ? (
              <div className="pro-already">
                <div className="pro-already-icon">✦</div>
                <div className="pro-already-title">You're a Pro member</div>
                <div className="pro-already-sub">
                  {me?.subscription_period === "annual" ? "Annual plan" : "Monthly plan"} · Thank you for supporting Vekke.
                </div>
              </div>
            ) : (
              <>
                {/* Period toggle */}
                <div className="pro-toggle">
                  <button
                    className={`pro-toggle-btn ${period === "monthly" ? "active" : ""}`}
                    onClick={() => setPeriod("monthly")}
                  >
                    Monthly
                  </button>
                  <button
                    className={`pro-toggle-btn ${period === "annual" ? "active" : ""}`}
                    onClick={() => setPeriod("annual")}
                  >
                    Annual
                    <span className="pro-save-badge">Save ${annualSavings}</span>
                  </button>
                </div>

                {/* Price display */}
                <div className="pro-price-display">
                  {period === "monthly" ? (
                    <>
                      <span className="pro-price-amount">${monthlyCost}</span>
                      <span className="pro-price-period">/ month</span>
                    </>
                  ) : (
                    <>
                      <span className="pro-price-amount">${annualMonthly}</span>
                      <span className="pro-price-period">/ month</span>
                      <span className="pro-price-billed">Billed ${annualCost} annually</span>
                    </>
                  )}
                </div>

                <button
                  className={`pro-cta ${purchasing ? "loading" : ""}`}
                  onClick={handleUpgrade}
                  disabled={purchasing || !userId}
                >
                  {purchasing
                    ? "Redirecting…"
                    : !userId
                    ? "Sign In to Upgrade"
                    : `Upgrade to Pro`}
                </button>

                {!userId && (
                  <p className="pro-signin-note">
                    You need an account to subscribe.
                  </p>
                )}
              </>
            )}

          </div>
        </section>

      </div>

      <style>{`
        * { box-sizing: border-box; }

        .pro-page {
          width: 100%;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          background: #0a0a0c;
          color: #e8e4d8;
          font-family: 'EB Garamond', Georgia, serif;
          overflow: hidden;
        }

        .pro-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .pro-toast {
          position: fixed;
          top: calc(56px + 1rem);
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          padding: 0.75rem 1.5rem;
          border-radius: 2px;
          font-family: 'Cinzel', serif;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          white-space: nowrap;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
          animation: toastIn 0.25s ease;
        }
        .pro-toast.success { background: #1a2a1a; border: 1px solid #4a7a4a; color: #8fcf8f; }
        .pro-toast.error   { background: #2a1a1a; border: 1px solid #7a3a3a; color: #cf8f8f; }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* ── Hero ── */
        .pro-hero {
          padding: 5rem 2rem 4rem;
          text-align: center;
          background: linear-gradient(180deg, #0d0b08 0%, #0a0a0c 100%);
          border-bottom: 1px solid rgba(184,150,106,0.12);
          position: relative;
          overflow: hidden;
        }
        .pro-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(184,150,106,0.06) 0%, transparent 65%);
          pointer-events: none;
        }
        .pro-hero-inner {
          max-width: 620px;
          margin: 0 auto;
          position: relative;
        }
        .pro-eyebrow {
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.5em;
          text-transform: uppercase;
          color: #b8966a;
          margin-bottom: 1.25rem;
        }
        .pro-title {
          font-family: 'Cinzel Decorative', serif;
          font-size: clamp(2rem, 5vw, 3.25rem);
          font-weight: 700;
          color: #e8e4d8;
          margin: 0 0 1rem;
          line-height: 1.1;
        }
        .pro-subtitle {
          font-size: 1.2rem;
          color: #9a9080;
          font-style: italic;
          line-height: 1.7;
          margin: 0;
        }

        /* ── Features ── */
        .pro-features-section {
          padding: 4rem 2rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .pro-features-inner {
          max-width: 700px;
          margin: 0 auto;
        }
        .pro-features-grid {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .pro-feature {
          display: flex;
          align-items: flex-start;
          gap: 1.25rem;
          padding: 1.25rem 1.5rem;
          border: 1px solid rgba(184,150,106,0.1);
          background: rgba(184,150,106,0.02);
        }
        .pro-feature-icon {
          font-size: 1.1rem;
          color: #b8966a;
          flex-shrink: 0;
          width: 24px;
          text-align: center;
          margin-top: 2px;
        }
        .pro-feature-label {
          font-family: 'Cinzel', serif;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: #e8e4d8;
          margin-bottom: 0.3rem;
        }
        .pro-feature-desc {
          font-size: 1rem;
          color: #9a9080;
          font-style: italic;
          line-height: 1.5;
        }

        /* ── Pricing ── */
        .pro-pricing-section {
          padding: 4rem 2rem 6rem;
        }
        .pro-pricing-inner {
          max-width: 420px;
          margin: 0 auto;
          text-align: center;
        }

        .pro-toggle {
          display: inline-flex;
          border: 1px solid rgba(184,150,106,0.2);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 2.5rem;
        }
        .pro-toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.4rem;
          background: transparent;
          border: none;
          font-family: 'Cinzel', serif;
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #6b6558;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pro-toggle-btn.active {
          background: rgba(184,150,106,0.1);
          color: #d4af7a;
        }
        .pro-save-badge {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.08em;
          color: #4ade80;
          border: 1px solid rgba(74,222,128,0.3);
          padding: 0.1rem 0.4rem;
          border-radius: 2px;
        }

        .pro-price-display {
          margin-bottom: 2rem;
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .pro-price-amount {
          font-family: 'Cinzel', serif;
          font-size: 3rem;
          font-weight: 700;
          color: #e8e4d8;
          letter-spacing: -0.02em;
        }
        .pro-price-period {
          font-family: 'Cinzel', serif;
          font-size: 0.85rem;
          color: #6b6558;
          letter-spacing: 0.08em;
        }
        .pro-price-billed {
          width: 100%;
          font-size: 0.9rem;
          color: #6b6558;
          font-style: italic;
          margin-top: 0.25rem;
        }

        .pro-cta {
          width: 100%;
          padding: 1rem;
          font-family: 'Cinzel', serif;
          font-size: 0.8rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          background: rgba(184,150,106,0.12);
          border: 1px solid rgba(184,150,106,0.5);
          color: #d4af7a;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 1rem;
        }
        .pro-cta:hover:not(:disabled) {
          background: rgba(184,150,106,0.2);
          color: #e8e4d8;
        }
        .pro-cta:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .pro-cta.loading { opacity: 0.6; }

        .pro-signin-note {
          font-size: 0.9rem;
          color: #4a4540;
          font-style: italic;
        }

        /* ── Already pro ── */
        .pro-already {
          padding: 3rem;
          border: 1px solid rgba(184,150,106,0.2);
          background: rgba(184,150,106,0.04);
          text-align: center;
        }
        .pro-already-icon {
          font-size: 2rem;
          color: #b8966a;
          margin-bottom: 1rem;
        }
        .pro-already-title {
          font-family: 'Cinzel', serif;
          font-size: 1.1rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: #e8e4d8;
          margin-bottom: 0.5rem;
        }
        .pro-already-sub {
          font-size: 1rem;
          color: #6b6558;
          font-style: italic;
        }

        @media (max-width: 640px) {
          .pro-hero { padding: 3rem 1.5rem 2.5rem; }
          .pro-features-section { padding: 2.5rem 1.5rem; }
          .pro-pricing-section { padding: 2.5rem 1.5rem 4rem; }
          .pro-feature { padding: 1rem 1.25rem; }
        }
      `}</style>
    </div>
  )
}
