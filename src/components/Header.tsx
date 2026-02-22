// src/components/Header.tsx
import React, { useState, useRef, useEffect } from "react"

export type ActivePage = "play" | "mygames" | "leaderboard" | "challenges" | "rules" | "tutorial" | "skins" | null

export interface HeaderProps {
  // Auth/identity
  isLoggedIn: boolean
  username?: string
  avatarUrl?: string | null
  titleLabel?: string
  elo?: number
  isPro?: boolean

  // My Games badge
  myGamesTurnCount?: number   // number of active games where it's your turn

  // Online count
  onlineNow?: number

  // Which page is active (for nav highlight)
  activePage?: ActivePage

  // Navigation callbacks
  onPlay?: () => void
  onMyGames?: () => void
  onLeaderboard?: () => void
  onChallenges?: () => void
  onRules?: () => void
  onTutorial?: () => void

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
      {/* Token icon */}
      <img
        src="/logo.png"
        alt="Vekke"
        style={{
          width: 50,
          height: 50,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
      <div style={{ lineHeight: 1.05 }}>
        <div style={{
          fontSize: 20, fontWeight: 1000, letterSpacing: "0.06em",
          color: "#e5e7eb",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          VEKKE
        </div>
        <div style={{ fontSize: 10, opacity: 0.5, letterSpacing: "0.08em", color: "#9ca3af", fontWeight: 600 }}>
          the game of routes
        </div>
      </div>
    </div>
  )
}

function NavItem({
  label, active, onClick, badge,
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
        background: active
          ? "rgba(93,232,247,0.10)"
          : hovered
          ? "rgba(255,255,255,0.06)"
          : "transparent",
        border: active
          ? "1px solid rgba(93,232,247,0.25)"
          : "1px solid transparent",
        color: active ? "#5de8f7" : "#e5e7eb",
        opacity: active ? 1 : hovered ? 1 : 0.78,
        fontWeight: 700,
        cursor: "pointer",
        padding: "7px 11px",
        borderRadius: 10,
        fontSize: 13,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        transition: "all 0.12s ease",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {label}
      {typeof badge === "number" && badge > 0 && (
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 18, borderRadius: 999,
          background: "#ee484c",
          color: "#fff",
          fontSize: 10, fontWeight: 900,
          padding: "0 4px",
          lineHeight: 1,
          boxShadow: "0 0 8px rgba(238,72,76,0.5)",
          animation: badge > 0 ? "badge-pulse 2s ease-in-out infinite" : "none",
        }}>
          {badge > 9 ? "9+" : badge}
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
    .map(s => s[0]?.toUpperCase())
    .join("")

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "#1f2937",
      border: "1px solid rgba(255,255,255,0.12)",
      display: "grid", placeItems: "center",
      fontWeight: 800, fontSize: Math.max(10, Math.floor(size * 0.36)),
      color: "#e5e7eb", flexShrink: 0,
      overflow: "hidden",
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ opacity: 0.9 }}>{initials || "?"}</span>
      }
    </div>
  )
}

function UserDropdown({
  isLoggedIn, username, avatarUrl, titleLabel, elo, isPro,
  onSignIn, onOpenProfile, onOpenPro, onSignOut, onOpenSkins,
}: HeaderProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
          padding: "8px 16px", borderRadius: 10,
          background: "#ee484c",
          border: "none", color: "#fff",
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          letterSpacing: "0.02em",
          boxShadow: "0 4px 12px rgba(238,72,76,0.3)",
          transition: "opacity 0.12s",
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        Sign In
      </button>
    )
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", gap: 9, alignItems: "center",
          padding: "6px 10px", borderRadius: 12,
          background: open ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "#e5e7eb", cursor: "pointer",
          transition: "background 0.12s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
      >
        <Avatar name={username ?? "You"} url={avatarUrl} size={28} />
        <div style={{ display: "grid", lineHeight: 1.15, textAlign: "left" }}>
          <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>
            {username ?? "Player"}
          </div>
          {typeof elo === "number" && titleLabel ? (
            <div style={{ opacity: 0.6, fontSize: 11, whiteSpace: "nowrap" }}>
              {titleLabel} · {elo}{isPro ? " · Pro" : ""}
            </div>
          ) : (
            <div style={{ opacity: 0.6, fontSize: 11 }}>Account</div>
          )}
        </div>
        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5, marginLeft: 2, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          minWidth: 200,
          background: "#111827",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          overflow: "hidden",
          zIndex: 9999,
        }}>
          {/* User info header */}
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Avatar name={username ?? "You"} url={avatarUrl} size={36} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#e5e7eb" }}>{username ?? "Player"}</div>
                {typeof elo === "number" && titleLabel && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{titleLabel} · {elo}</div>
                )}
              </div>
            </div>
          </div>

          {/* Menu items */}
          {[
            { label: "Edit Profile", action: onOpenProfile },
            { label: "Cosmetics", action: onOpenSkins },
            { label: isPro ? "Manage Pro" : "Upgrade to Pro", action: onOpenPro },
          ].map(({ label, action }) => (
            <DropdownItem key={label} label={label} onClick={() => { action?.(); setOpen(false) }} />
          ))}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <DropdownItem
              label="Sign Out"
              onClick={() => { onSignOut?.(); setOpen(false) }}
              danger
            />
          </div>
        </div>
      )}
    </div>
  )
}

function DropdownItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "11px 16px",
        background: hovered ? "rgba(255,255,255,0.05)" : "transparent",
        border: "none",
        color: danger ? "#f87171" : "#d1d5db",
        fontSize: 13, fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  )
}

// ─── Main Header ──────────────────────────────────────────────────────────────

export function Header(props: HeaderProps) {
  const {
    activePage, onlineNow,
    onPlay, onMyGames, onLeaderboard, onChallenges, onRules, onTutorial,
    myGamesTurnCount,
  } = props

  return (
    <>
      <style>{`
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 6px rgba(238,72,76,0.5); }
          50%       { box-shadow: 0 0 12px rgba(238,72,76,0.9); }
        }
        .vekke-header {
          position: sticky;
          top: 0;
          z-index: 1000;
          width: 100%;
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
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
        @media (max-width: 768px) {
          .vekke-nav { display: none; }
          .vekke-header-inner { padding: 0 16px; }
        }
      `}</style>

      <header className="vekke-header">
        <div className="vekke-header-inner">

          {/* Logo */}
          <div onClick={onPlay}>
            <VekkeLogo />
          </div>

          {/* Nav */}
          <nav className="vekke-nav">
            <NavItem label="Play"          active={activePage === "play"}          onClick={onPlay} />
            <NavItem
              label="My Games"
              active={activePage === "mygames"}
              onClick={onMyGames}
              badge={myGamesTurnCount}
            />
            <NavItem label="Leaderboard"   active={activePage === "leaderboard"}   onClick={onLeaderboard} />
            <NavItem label="Challenges"    active={activePage === "challenges"}    onClick={onChallenges} />
            <NavItem label="Rules"         active={activePage === "rules"}         onClick={onRules} />
            <NavItem label="Tutorial"      active={activePage === "tutorial"}      onClick={onTutorial} />
          </nav>

          {/* Right side */}
          <div className="vekke-header-right">
            {typeof onlineNow === "number" && (
              <div style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", display: "inline-block", boxShadow: "0 0 6px #34d399" }} />
                {onlineNow} online
              </div>
            )}
            <UserDropdown {...props} />
          </div>

        </div>
      </header>
    </>
  )
}
