// src/components/Header.tsx
import React, { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { ProfileModal } from "../ProfileModal"
import { SkinsModal } from "./SkinsModal"
import { AuthModal } from "../AuthModal"

const ADMIN_USER_ID = "eda57bd5-fdde-4fd5-b662-4f21352861bf"

export type ActivePage =
  | "play"
  | "mygames"
  | "leaderboard"
  | "orders"
  | "rules"
  | "tutorial"
  | "skins"
  | "puzzles"
  | "marketplace"
  | "forum"
  | "pro"
  | null

export interface HeaderProps {
  // Auth/identity
  isLoggedIn: boolean
  userId?: string
  username?: string
  avatarUrl?: string | null
  titleLabel?: string
  elo?: number
  isPro?: boolean

  // My Games badge
  myGamesTurnCount?: number

  // Which page is active (for nav highlight)
  activePage?: ActivePage

  // Navigation callbacks (optional overrides)
  onPlay?: () => void
  onMyGames?: () => void
  onLeaderboard?: () => void
  onChallenges?: () => void
  onOrders?: () => void
  onRules?: () => void
  onTutorial?: () => void
  onPuzzles?: () => void
  onShop?: () => void
  onForum?: () => void

  // User callbacks
  onSignIn?: () => void
  onOpenProfile?: () => void
  onOpenPro?: () => void
  onSignOut?: () => void
  onOpenSkins?: () => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VekkeLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0 }}>
      <img
        src="/logo.png"
        alt="Vekke"
        style={{
          width: 40,
          height: 40,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
      <div style={{ lineHeight: 1.05 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#e8e4d8",
            fontFamily: "'Cinzel', serif",
          }}
        >
          VEKKE
        </div>
        <div
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            opacity: 0.65,
            letterSpacing: "0.3em",
            color: "#b8966a",
            fontWeight: 600,
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          the game of routes
        </div>
      </div>
    </div>
  )
}

function NavItem({
  label,
  active,
  onClick,
  badge,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  badge?: number
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: active ? "rgba(184,150,106,0.10)" : hovered ? "rgba(255,255,255,0.05)" : "transparent",
        border: active ? "1px solid rgba(184,150,106,0.30)" : "1px solid transparent",
        color: active ? "#d4af7a" : hovered ? "#e8e4d8" : "#b0aa9e",
        fontFamily: "'Cinzel', serif",
        fontWeight: 600,
        cursor: "pointer",
        padding: "7px 12px",
        borderRadius: 4,
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        transition: "all 0.12s ease",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      {typeof badge === "number" && badge > 0 && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            borderRadius: 999,
            background: "#ee484c",
            color: "#fff",
            fontSize: 10,
            fontWeight: 900,
            padding: "0 4px",
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  const initials = String(name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("")

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#13131a",
        border: "1px solid rgba(184,150,106,0.2)",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: Math.max(10, Math.floor(size * 0.36)),
        color: "#e8e4d8",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {url ? (
        <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ opacity: 0.9 }}>{initials || "?"}</span>
      )}
    </div>
  )
}

function UserDropdown(
  props: HeaderProps & {
    goOrders: () => void
    goChallenges: () => void
    onOpenProfileModal: () => void
  }
) {
  const navigate = useNavigate()

  const {
    isLoggedIn,
    userId,
    username,
    avatarUrl,
    isPro,
    onSignIn,
    onOpenPro,
    onSignOut,
    onOpenSkins,
    onOpenProfileModal,
  } = props

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  async function copyInviteLink() {
    if (!userId) return
    const link = `${window.location.origin}/invite/${userId}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = link
      ta.style.position = "fixed"
      ta.style.left = "-9999px"
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try {
        document.execCommand("copy")
      } catch {}
      document.body.removeChild(ta)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  if (!isLoggedIn) {
    return (
      <button
        onClick={onSignIn}
        style={{
          fontFamily: "'Cinzel', serif",
          padding: "8px 18px",
          borderRadius: 4,
          background: "rgba(184,150,106,0.12)",
          border: "1px solid rgba(184,150,106,0.45)",
          color: "#d4af7a",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(184,150,106,0.22)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(184,150,106,0.12)")}
      >
        Sign In
      </button>
    )
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          gap: 9,
          alignItems: "center",
          padding: "6px 10px",
          borderRadius: 12,
          background: open ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "#e8e4d8",
          cursor: "pointer",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.03)"
        }}
      >
        <Avatar name={username ?? "You"} url={avatarUrl} size={28} />
        <div style={{ display: "grid", lineHeight: 1.15, textAlign: "left" }}>
          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
              color: "#e8e4d8",
            }}
          >
            {username ?? "Player"}
          </div>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          style={{
            opacity: 0.5,
            marginLeft: 2,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 200,
            background: "#0d0d10",
            border: "1px solid rgba(184,150,106,0.2)",
            borderRadius: 8,
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            overflow: "hidden",
            zIndex: 9999,
          }}
        >
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Avatar name={username ?? "You"} url={avatarUrl} size={36} />
              <div>
                <div
                  onClick={() => {
                    const un = (username ?? "").trim()
                    if (un) { navigate(`/u/${encodeURIComponent(un)}`); setOpen(false) }
                  }}
                  title="View profile"
                  style={{
                    fontFamily: "'Cinzel', serif",
                    fontWeight: 600,
                    fontSize: 13,
                    letterSpacing: "0.06em",
                    color: "#e8e4d8",
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                >
                  {username ?? "Player"}
                </div>
              </div>
            </div>
          </div>

          {[
            { label: "Edit Profile", action: onOpenProfileModal },
            { label: "Game History", action: () => navigate("/history") },
            { label: "Gear", action: onOpenSkins },
            { label: copied ? "Invite Link Copied!" : "Copy Invite Link", action: copyInviteLink, disabled: !userId },
            { label: isPro ? "Manage Pro" : "Upgrade to Pro", action: onOpenPro },
          ].map(({ label, action, disabled }) => (
            <DropdownItem
              key={label}
              label={label}
              disabled={!!disabled}
              onClick={() => {
                if (!disabled) action?.()
                setOpen(false)
              }}
            />
          ))}

          {userId === ADMIN_USER_ID && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <DropdownItem
                label="Admin"
                onClick={() => {
                  navigate("/admin")
                  setOpen(false)
                }}
              />
            </div>
          )}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <DropdownItem
              label="Sign Out"
              onClick={() => {
                onSignOut?.()
                setOpen(false)
              }}
              danger
            />
          </div>
        </div>
      )}
    </div>
  )
}

function DropdownItem({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onMouseEnter={() => {
        if (!disabled) setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!disabled) onClick()
      }}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "11px 16px",
        background: hovered ? "rgba(184,150,106,0.07)" : "transparent",
        border: "none",
        fontFamily: "'Cinzel', serif",
        color: disabled ? "rgba(232,228,216,0.25)" : danger ? "#f87171" : "#b0aa9e",
        fontSize: 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  )
}

// ─── Main Header ──────────────────────────────────────────────────────────────

function injectFonts() {
  if (typeof document === "undefined") return
  if (document.getElementById("vekke-header-fonts")) return
  const link = document.createElement("link")
  link.id = "vekke-header-fonts"
  link.rel = "stylesheet"
  link.href =
    "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
  document.head.appendChild(link)
}

export function Header(props: HeaderProps) {
  injectFonts()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [profileModalOpen, setProfileModalOpen] = React.useState(false)
  const [skinsModalOpen, setSkinsModalOpen] = React.useState(false)
  const [authModalOpen, setAuthModalOpen] = React.useState(false)
  const navigate = useNavigate()

  const { activePage, isLoggedIn } = props

  const [turnCount, setTurnCount] = useState(0)

  useEffect(() => {
    const uid = props.userId
    if (!uid) {
      setTurnCount(0)
      return
    }

    async function fetchCount() {
      const { count } = await supabase
        .from("games")
        .select("id", { count: "exact", head: true })
        .is("ended_at", null)
        .is("winner_id", null)
        .not("status", "in", '("finished","complete","completed","over")')
        .or(`and(wake_id.eq.${uid},turn.eq.W),and(brake_id.eq.${uid},turn.eq.B)`)
      setTurnCount(count ?? 0)
    }

    fetchCount()
    const t = window.setInterval(fetchCount, 15_000)
    return () => window.clearInterval(t)
  }, [props.userId])

  const handleSignIn   = () => setAuthModalOpen(true)
  const handleSignOut  = props.onSignOut  ?? (() => { supabase.auth.signOut().then(() => navigate("/")) })
  const handleOpenSkins = props.onOpenSkins ?? (() => setSkinsModalOpen(true))
  const handleOpenPro   = props.onOpenPro   ?? (() => {})
  const goHome         = () => navigate("/")
  const goPlay        = props.onPlay        ?? (() => navigate("/play?openNewGame=1"))
  const goMyGames     = props.onMyGames     ?? (() => navigate("/challenges"))
  const goLeaderboard = props.onLeaderboard ?? (() => navigate("/leaderboard"))
  const goOrders      = props.onOrders      ?? (() => navigate("/orders"))
  const goRules       = props.onRules       ?? (() => navigate("/rules"))
  const goTutorial    = props.onTutorial    ?? (() => navigate("/tutorial"))
  const goPuzzles     = props.onPuzzles     ?? (() => navigate("/puzzles"))
  const goShop        = props.onShop        ?? (() => navigate("/marketplace"))
  const goForum       = props.onForum       ?? (() => navigate("/forum"))
  const goChallenges  = props.onChallenges  ?? (() => navigate("/challenges"))

  return (
    <>
      <style>{`
        .vekke-header {
          position: sticky;
          top: 0;
          z-index: 1000;
          width: 100%;
          background: rgba(10, 10, 12, 0.96);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(184,150,106,0.15);
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
        }
        .vekke-header-inner {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 24px;
          height: 56px;
        }
        .vekke-nav {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .vekke-header-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        @media (max-width: 1024px) {
          .vekke-nav { display: none; }
          .vekke-header-inner { padding: 0 16px; }
          .vekke-hamburger { display: flex !important; }
        }
        .vekke-hamburger {
          display: none;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          width: 36px;
          height: 36px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 4px;
          cursor: pointer;
          padding: 0 8px;
          flex-shrink: 0;
        }
        .vekke-hamburger span {
          display: block;
          height: 1px;
          background: #b0aa9e;
          border-radius: 1px;
          transition: all 0.2s;
        }
        .vekke-mobile-drawer {
          display: none;
          position: fixed;
          top: 56px;
          left: 0;
          right: 0;
          background: rgba(10,10,12,0.98);
          border-bottom: 1px solid rgba(184,150,106,0.15);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 999;
          flex-direction: column;
          padding: 8px 0 12px;
        }
        .vekke-mobile-drawer.open { display: flex; }
        .vekke-mobile-nav-item {
          width: 100%;
          text-align: left;
          padding: 12px 20px;
          background: transparent;
          border: none;
          font-family: 'Cinzel', serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #b0aa9e;
          cursor: pointer;
          transition: background 0.1s, color 0.1s;
        }
        .vekke-mobile-nav-item:hover, .vekke-mobile-nav-item.active {
          background: rgba(184,150,106,0.07);
          color: #d4af7a;
        }
        .vekke-mobile-divider {
          height: 1px;
          background: rgba(255,255,255,0.07);
          margin: 6px 0;
        }
      `}</style>

      <header className="vekke-header">
        <div className="vekke-header-inner">
          <div onClick={goHome}>
            <VekkeLogo />
          </div>

          <nav className="vekke-nav">
            <NavItem label="Play" active={activePage === "play"} onClick={goPlay} />
            <NavItem label="Puzzles" active={activePage === "puzzles"} onClick={goPuzzles} />
            <NavItem label="Shop" active={activePage === "marketplace"} onClick={goShop} />
            <NavItem label="Forum" active={activePage === "forum"} onClick={goForum} />
            <NavItem label="Rankings" active={activePage === "leaderboard"} onClick={goLeaderboard} />
            <NavItem label="Orders" active={activePage === "orders"} onClick={goOrders} />
            <NavItem label="Rules" active={activePage === "rules"} onClick={goRules} />
            <NavItem label="Tutorial" active={activePage === "tutorial"} onClick={goTutorial} />
          </nav>

          <div className="vekke-header-right">
            <button className="vekke-hamburger" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
              <span style={{ width: mobileOpen ? "100%" : "100%" }} />
              <span style={{ width: "70%", alignSelf: "flex-end" }} />
              <span style={{ width: mobileOpen ? "100%" : "85%" }} />
            </button>

            {isLoggedIn && (
              <button
                onClick={goMyGames}
                aria-label="My Games"
                title={turnCount > 0 ? `My Games — ${turnCount} awaiting your move` : "My Games"}
                style={{
                  position: "relative",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 8px",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: activePage === "mygames" ? "#5de8f7" : "#b8966a",
                  transition: "color 0.2s",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" fill="currentColor">
                  <path d="M160 64C142.3 64 128 78.3 128 96C128 113.7 142.3 128 160 128L160 139C160 181.4 176.9 222.1 206.9 252.1L274.8 320L206.9 387.9C176.9 417.9 160 458.6 160 501L160 512C142.3 512 128 526.3 128 544C128 561.7 142.3 576 160 576L480 576C497.7 576 512 561.7 512 544C512 526.3 497.7 512 480 512L480 501C480 458.6 463.1 417.9 433.1 387.9L365.2 320L433.1 252.1C463.1 222.1 480 181.4 480 139L480 128C497.7 128 512 113.7 512 96C512 78.3 497.7 64 480 64L160 64zM224 139L224 128L416 128L416 139C416 158 410.4 176.4 400 192L240 192C229.7 176.4 224 158 224 139zM240 448C243.5 442.7 247.6 437.7 252.1 433.1L320 365.2L387.9 433.1C392.5 437.7 396.5 442.7 400.1 448L240 448z"/>
                </svg>
                {turnCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 16,
                      height: 16,
                      borderRadius: 999,
                      background: "#ee484c",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 900,
                      padding: "0 3px",
                      lineHeight: 1,
                      border: "1.5px solid #0a0a0c",
                    }}
                  >
                    {turnCount}
                  </span>
                )}
              </button>
            )}

            <UserDropdown
              {...props}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              onOpenSkins={handleOpenSkins}
              onOpenPro={handleOpenPro}
              goOrders={goOrders}
              goChallenges={goChallenges}
              onOpenProfileModal={() => setProfileModalOpen(true)}
            />
          </div>
        </div>
      </header>

      <div className={`vekke-mobile-drawer${mobileOpen ? " open" : ""}`}>
        <button
          className={`vekke-mobile-nav-item${activePage === "play" ? " active" : ""}`}
          onClick={() => { goPlay(); setMobileOpen(false) }}
        >
          Play
        </button>
        {isLoggedIn && (
          <button
            className={`vekke-mobile-nav-item${activePage === "mygames" ? " active" : ""}`}
            onClick={() => { goMyGames(); setMobileOpen(false) }}
          >
            My Games{turnCount > 0 ? ` (${turnCount})` : ""}
          </button>
        )}
        <button
          className={`vekke-mobile-nav-item${activePage === "puzzles" ? " active" : ""}`}
          onClick={() => { goPuzzles(); setMobileOpen(false) }}
        >
          Puzzles
        </button>
        <button
          className={`vekke-mobile-nav-item${activePage === "marketplace" ? " active" : ""}`}
          onClick={() => { goShop(); setMobileOpen(false) }}
        >
          Shop
        </button>
        <button
          className={`vekke-mobile-nav-item${activePage === "forum" ? " active" : ""}`}
          onClick={() => { goForum(); setMobileOpen(false) }}
        >
          Forum
        </button>
        <button
          className={`vekke-mobile-nav-item${activePage === "leaderboard" ? " active" : ""}`}
          onClick={() => { goLeaderboard(); setMobileOpen(false) }}
        >
          Rankings
        </button>
        <button
          className={`vekke-mobile-nav-item${activePage === "orders" ? " active" : ""}`}
          onClick={() => { goOrders(); setMobileOpen(false) }}
        >
          Orders
        </button>
        <div className="vekke-mobile-divider" />
        <button
          className={`vekke-mobile-nav-item${activePage === "rules" ? " active" : ""}`}
          onClick={() => { goRules(); setMobileOpen(false) }}
        >
          Rules
        </button>
        <button
          className={`vekke-mobile-nav-item${activePage === "tutorial" ? " active" : ""}`}
          onClick={() => { goTutorial(); setMobileOpen(false) }}
        >
          Tutorial
        </button>

      </div>

      {skinsModalOpen && (
        <SkinsModal
          isOpen={skinsModalOpen}
          onClose={() => setSkinsModalOpen(false)}
        />
      )}
      {profileModalOpen && props.userId && (
        <ProfileModal
          userId={props.userId}
          onClose={() => setProfileModalOpen(false)}
          onUpdate={() => setProfileModalOpen(false)}
        />
      )}

      {authModalOpen && (
        <AuthModal onClose={() => setAuthModalOpen(false)} />
      )}
    </>
  )
}
