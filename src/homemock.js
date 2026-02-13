import React, { useMemo, useState } from "react"

/**
 * VEKKE GAME PORTAL HOMEPAGE — Tournament Hall vibe
 * Restored to the ORIGINAL full-page layout style (header + cards + responsive grid)
 * while adding your requested upgrades:
 * - Wiki -> Rules
 * - Tutorial button visible (nav + hero)
 * - Country flags next to player names
 * - Bigger avatar in "Your Progress"
 * - Pro button implies membership (Pro ✓ vs Upgrade)
 * - Ladder tabs: This Week (default) + Top Rated
 * - Weekly ladder momentum indicators
 * - Next title progress in user card
 * - Belt color progression (grey, blue, red, green, brown, black)
 */

type HomeStats = {
  onlineNow: number
  gamesInProgress: number
  gamesThisWeek: number
}

type Person = {
  name: string
  elo: number
  title: string
  country?: string | null // ISO 3166-1 alpha-2
  avatarUrl?: string | null
}

type ActivityItem =
  | {
      id: string
      atLabel: string
      kind: "result"
      winner: Person
      loser: Person
      deltaLabel?: string
    }
  | {
      id: string
      atLabel: string
      kind: "promo"
      who: Person
      toTitle: string
      toElo: number
    }
  | {
      id: string
      atLabel: string
      kind: "system"
      text: string
    }

type LeaderItem = { rank: number; person: Person; momentum?: number }

type Props = {
  isLoggedIn: boolean
  /** Treat this as “Pro member?” for the mockup */
  isPro?: boolean

  username?: string
  avatarUrl?: string | null
  titleLabel?: string
  elo?: number
  activeGames?: number
  streak?: number

  stats: HomeStats
  activity: ActivityItem[]
  leaderboardTop: LeaderItem[]
  weeklyTop?: LeaderItem[]

  onPlayAi: () => void // label says “Computer”
  onPlayPvp: () => void
  onOpenLeaderboard: () => void
  onOpenProfile: () => void
  onOpenPro: () => void
  onOpenWiki?: () => void
  onOpenChallenges?: () => void
  onOpenTutorial?: () => void
}

// ------------------------------------------------------------
// Belt color system (grey, blue, red, green, brown, black)
// ------------------------------------------------------------

const beltColors: Record<string, string> = {
  Novice: "#6b7280", // grey
  Adept: "#2563eb", // blue
  Expert: "#dc2626", // red
  Master: "#16a34a", // green
  "Senior Master": "#92400e", // brown
  Grandmaster: "#0b0b0f", // black
}

function flagEmoji(cc?: string | null) {
  const s = (cc ?? "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(s)) return ""
  const A = 0x1f1e6
  const base = "A".charCodeAt(0)
  return String.fromCodePoint(A + (s.charCodeAt(0) - base), A + (s.charCodeAt(1) - base))
}

function beltColor(title?: string) {
  if (!title) return "rgba(255,255,255,0.16)"
  return beltColors[title] ?? "rgba(255,255,255,0.16)"
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

// ------------------------------------------------------------
// UI primitives (kept close to your original styling)
// ------------------------------------------------------------

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; title?: string; right?: React.ReactNode }> = ({
  children,
  style,
  title,
  right,
}) => (
  <div
    style={{
      background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18,
      padding: 20,
      boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
      ...style,
    }}
  >
    {(title || right) && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 1000, letterSpacing: 0.2 }}>{title}</div>
        {right}
      </div>
    )}
    {children}
  </div>
)

const Button: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "ghost"
  style?: React.CSSProperties
}> = ({ children, onClick, variant = "secondary", style }) => {
  const base: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 16,
    fontWeight: 1000,
    cursor: "pointer",
    border: "none",
    fontSize: 14,
    letterSpacing: 0.3,
  }

  if (variant === "primary") {
    base.background = "linear-gradient(90deg,#5de8f7,#22d3ee)"
    base.color = "#0b1220"
  } else if (variant === "ghost") {
    base.background = "transparent"
    base.color = "#e5e7eb"
    base.border = "1px solid rgba(255,255,255,0.12)"
  } else {
    base.background = "#1f2937"
    base.color = "#e5e7eb"
    base.border = "1px solid rgba(255,255,255,0.10)"
  }

  return (
    <button onClick={onClick} style={{ ...base, ...style }}>
      {children}
    </button>
  )
}

const NavLink: React.FC<{ label: string; onClick?: () => void; hot?: boolean }> = ({ label, onClick, hot }) => (
  <button
    onClick={onClick}
    style={{
      background: hot ? "rgba(93,232,247,0.10)" : "transparent",
      border: hot ? "1px solid rgba(93,232,247,0.22)" : "none",
      color: "#e5e7eb",
      opacity: hot ? 1 : 0.82,
      fontWeight: 1000,
      cursor: "pointer",
      padding: "8px 10px",
      borderRadius: 10,
      letterSpacing: 0.2,
      whiteSpace: "nowrap",
    }}
    onMouseEnter={(e) => {
      if (!hot) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"
      e.currentTarget.style.opacity = "1"
    }}
    onMouseLeave={(e) => {
      if (!hot) e.currentTarget.style.backgroundColor = "transparent"
      e.currentTarget.style.opacity = hot ? "1" : "0.82"
    }}
  >
    {label}
  </button>
)

const Avatar: React.FC<{ name: string; url?: string | null; size?: number }> = ({ name, url, size = 28 }) => {
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
        borderRadius: 999,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "#0b1220",
        display: "grid",
        placeItems: "center",
        fontWeight: 1000,
        fontSize: Math.max(10, Math.floor(size * 0.36)),
        color: "#e5e7eb",
        flexShrink: 0,
        boxShadow: "0 10px 22px rgba(0,0,0,0.35)",
      }}
      aria-label={`Avatar for ${name}`}
    >
      {url ? (
        <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ opacity: 0.9 }}>{initials || "?"}</span>
      )}
    </div>
  )
}

const RatingTag: React.FC<{ elo: number; title: string }> = ({ elo, title }) => {
  const c = beltColor(title)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${c}`,
        background: "rgba(255,255,255,0.03)",
        fontWeight: 950,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: 0.9, color: c }}>{title}</span>
      <span style={{ fontFamily: "monospace" }}>{elo}</span>
    </span>
  )
}

const TabPill: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      border: "1px solid rgba(255,255,255,0.10)",
      background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
      color: "#e5e7eb",
      fontWeight: 1000,
      padding: "8px 10px",
      borderRadius: 999,
      cursor: "pointer",
      letterSpacing: 0.2,
      fontSize: 12,
      opacity: active ? 1 : 0.82,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </button>
)

function PlayerInline({ p }: { p: Person }) {
  const flag = flagEmoji(p.country)
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Avatar name={p.name} url={p.avatarUrl ?? null} size={26} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 1000 }}>
        {flag ? <span style={{ fontSize: 14, lineHeight: 1 }}>{flag}</span> : null}
        {p.name}
      </span>
      <RatingTag elo={p.elo} title={p.title} />
    </span>
  )
}

function ActivityRow({ a }: { a: ActivityItem }) {
  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "52px 1fr",
    gap: 12,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
  }

  if (a.kind === "system") {
    return (
      <div style={rowStyle}>
        <div style={{ width: 52, opacity: 0.55, fontSize: 12 }}>{a.atLabel}</div>
        <div style={{ opacity: 0.86 }}>{a.text}</div>
      </div>
    )
  }

  if (a.kind === "promo") {
    return (
      <div style={rowStyle}>
        <div style={{ width: 52, opacity: 0.55, fontSize: 12 }}>{a.atLabel}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <PlayerInline p={a.who} />
          <span style={{ opacity: 0.86 }}>promoted to</span>
          <RatingTag elo={a.toElo} title={a.toTitle} />
        </div>
      </div>
    )
  }

  return (
    <div style={rowStyle}>
      <div style={{ width: 52, opacity: 0.55, fontSize: 12 }}>{a.atLabel}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <PlayerInline p={a.winner} />
        <span style={{ opacity: 0.86 }}>defeated</span>
        <PlayerInline p={a.loser} />
        {a.deltaLabel && (
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 950,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(93,232,247,0.12)",
              border: "1px solid rgba(93,232,247,0.25)",
            }}
          >
            {a.deltaLabel}
          </span>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

export function HomePage(props: Props) {
  const {
    isLoggedIn,
    isPro,
    username,
    avatarUrl,
    titleLabel,
    elo,
    activeGames,
    streak,
    stats,
    activity,
    leaderboardTop,
    weeklyTop,
    onPlayAi,
    onPlayPvp,
    onOpenLeaderboard,
    onOpenProfile,
    onOpenPro,
    onOpenWiki,
    onOpenChallenges,
    onOpenTutorial,
  } = props

  const openRules = onOpenWiki ?? (() => {})
  const openChallenges = onOpenChallenges ?? (() => {})
  const openTutorial = onOpenTutorial ?? (() => {})

  const [ladderTab, setLadderTab] = useState<"week" | "rated">("week")

  const ladderRows = useMemo(() => {
    if (ladderTab === "week") return (weeklyTop && weeklyTop.length ? weeklyTop : leaderboardTop).slice(0, 6)
    return leaderboardTop.slice(0, 6)
  }, [ladderTab, weeklyTop, leaderboardTop])

  const nextTitleLabel = "Master"
  const pointsToNextTitle = 40
  const progress01 = clamp01(1 - pointsToNextTitle / 200)

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top left, #0f172a, #020617)",
        color: "#e5e7eb",
        padding: "34px 20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        @media (max-width: 980px) {
          .grid { grid-template-columns: 1fr !important; }
          .header { flex-wrap: wrap; gap: 12px !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background:
                  "radial-gradient(circle at 30% 30%, #ffffff, #5de8f7 20%, #26c6da 40%, #00acc1 65%, #006064)",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 14px 26px rgba(0,0,0,0.35)",
              }}
            />
            <div style={{ display: "grid", lineHeight: 1.05 }}>
              <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: 0.8 }}>VEKKE</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>competitive portal</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <NavLink label="Play" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
            <NavLink label="Leaderboard" onClick={onOpenLeaderboard} />
            <NavLink label="Challenges" onClick={openChallenges} />
            <NavLink label="Rules" onClick={openRules} />
            <NavLink label="Tutorial" onClick={openTutorial} hot />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ opacity: 0.7, fontSize: 13, whiteSpace: "nowrap" }}>{stats.onlineNow} online</div>
            <Button variant="ghost" onClick={onOpenPro}>
              {isPro ? "Pro ✓" : "Upgrade"}
            </Button>
            <button
              onClick={onOpenProfile}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              <Avatar name={isLoggedIn ? (username ?? "You") : "Guest"} url={isLoggedIn ? avatarUrl ?? null : null} size={28} />
              <div style={{ display: "grid", lineHeight: 1.1, textAlign: "left" }}>
                <div style={{ fontWeight: 1000, fontSize: 13 }}>{isLoggedIn ? username ?? "Profile" : "Sign in"}</div>
                {isLoggedIn && typeof elo === "number" && titleLabel ? (
                  <div style={{ opacity: 0.7, fontSize: 11 }}>
                    {titleLabel} · {elo}
                    {isPro ? " · Pro" : ""}
                  </div>
                ) : (
                  <div style={{ opacity: 0.7, fontSize: 11 }}>Account</div>
                )}
              </div>
            </button>
          </div>
        </div>

        <Card style={{ marginBottom: 20, position: "relative", overflow: "hidden" }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: -2,
              background:
                "radial-gradient(circle at 25% 10%, rgba(93,232,247,0.12), transparent 55%), radial-gradient(circle at 80% 25%, rgba(34,211,238,0.10), transparent 55%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center", position: "relative" }}>
            <div style={{ fontSize: 40, fontWeight: 1100, letterSpacing: 0.2 }}>Play. Compete. Ascend.</div>
            <div style={{ opacity: 0.78, maxWidth: 820, lineHeight: 1.35 }}>
              Competitive abstract strategy of routes, sieges, and positional control.
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                fontSize: 13,
                opacity: 0.9,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <span style={{ fontFamily: "monospace", opacity: 0.9 }}>LIVE</span>
              <span style={{ opacity: 0.8 }}>·</span>
              <span style={{ opacity: 0.92 }}>Rin defeated Cal</span>
              <span style={{ fontFamily: "monospace", opacity: 0.9 }}>+9</span>
              <span style={{ opacity: 0.8 }}>·</span>
              <span style={{ opacity: 0.92 }}>Maria promoted to Senior Master</span>
              <span style={{ opacity: 0.8 }}>·</span>
              <span style={{ opacity: 0.92 }}>3 Grandmaster games in progress</span>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Button variant="primary" onClick={onPlayPvp} style={{ padding: "14px 20px", fontSize: 15 }}>
                ⚔ Play vs Player
              </Button>
              <Button variant="secondary" onClick={onPlayAi} style={{ padding: "14px 20px", fontSize: 15 }}>
                ▶ Play vs Computer
              </Button>
              <Button variant="ghost" onClick={openTutorial} style={{ padding: "14px 20px", fontSize: 15 }}>
                Tutorial
              </Button>
            </div>

            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center", fontSize: 14, opacity: 0.72 }}>
              <div>{stats.gamesThisWeek.toLocaleString()} games this week</div>
              <div>{stats.gamesInProgress} in progress</div>
              <div>{stats.onlineNow} online</div>
            </div>
          </div>
        </Card>

        <div className="grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 20 }}>
            <Card title="Live Activity">
              <div style={{ display: "grid", gap: 10 }}>
                {activity.slice(0, 6).map((a) => (
                  <ActivityRow key={a.id} a={a} />
                ))}
              </div>
            </Card>

            <Card
              title={ladderTab === "week" ? "This Week" : "Top Rated"}
              right={
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <TabPill active={ladderTab === "week"} label="This Week" onClick={() => setLadderTab("week")} />
                  <TabPill active={ladderTab === "rated"} label="Top Rated" onClick={() => setLadderTab("rated")} />
                  <Button variant="ghost" onClick={onOpenLeaderboard} style={{ padding: "10px 12px" }}>
                    View All
                  </Button>
                </div>
              }
            >
              <div style={{ display: "grid", gap: 10 }}>
                {ladderRows.map((row) => {
                  const flag = flagEmoji(row.person.country)
                  const momentum = row.momentum
                  return (
                    <div
                      key={`${ladderTab}-${row.rank}-${row.person.name}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 1fr auto",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 1000, opacity: 0.7 }}>#{row.rank}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Avatar name={row.person.name} url={row.person.avatarUrl ?? null} size={28} />
                        <div style={{ display: "grid", lineHeight: 1.1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 1000,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {flag ? <span style={{ fontSize: 14, lineHeight: 1 }}>{flag}</span> : null}
                            {row.person.name}
                            {ladderTab === "week" && typeof momentum === "number" && momentum !== 0 ? (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontFamily: "monospace",
                                  fontSize: 12,
                                  padding: "1px 8px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: "rgba(255,255,255,0.03)",
                                  color: momentum > 0 ? "#34d399" : "#fb7185",
                                }}
                              >
                                {momentum > 0 ? `▲ ${momentum}` : `▼ ${Math.abs(momentum)}`}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.72 }}>{row.person.title}</div>
                        </div>
                      </div>
                      <div style={{ justifySelf: "end" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 1000 }}>{row.person.elo}</span>
                      </div>
                    </div>
                  )
                })}

                {ladderTab === "week" ? (
                  <div style={{ fontSize: 12, opacity: 0.68, paddingTop: 6, lineHeight: 1.35 }}>
                    Weekly ladder is based on activity points (plays + challenges + achievements). Anyone can make it.
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            {isLoggedIn ? (
              <Card title="Your Progress" style={{ position: "sticky", top: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                  <Avatar name={username ?? "You"} url={avatarUrl ?? null} size={64} />
                  <div style={{ display: "grid", lineHeight: 1.1, minWidth: 0 }}>
                    <div style={{ fontWeight: 1100, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {username ?? "You"}
                    </div>
                    {typeof elo === "number" && titleLabel ? (
                      <div style={{ fontSize: 12, opacity: 0.75, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>
                          {titleLabel} · {elo}
                          {isPro ? " · Pro" : ""}
                        </span>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: beltColor(titleLabel),
                            border: "1px solid rgba(255,255,255,0.14)",
                            opacity: 0.9,
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Signed in</div>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ opacity: 0.75 }}>Active games</span>
                    <b>{activeGames ?? 0}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ opacity: 0.75 }}>Streak</span>
                    <b>{streak ?? 0}</b>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                    <span>Next title</span>
                    <span style={{ fontFamily: "monospace" }}>{nextTitleLabel} · {pointsToNextTitle} pts</span>
                  </div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(progress01 * 100)}%`,
                        background: "linear-gradient(90deg, rgba(93,232,247,0.65), rgba(34,211,238,0.85))",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  <Button variant="secondary" onClick={onOpenProfile}>
                    Profile
                  </Button>
                  <Button variant="ghost" onClick={onOpenPro}>
                    {isPro ? "Manage Pro" : "Upgrade to Pro"}
                  </Button>
                </div>
              </Card>
            ) : (
              <Card title="Account" style={{ position: "sticky", top: 12 }}>
                <div style={{ opacity: 0.8, lineHeight: 1.35, marginBottom: 12 }}>Sign in to track Elo, titles, and match history.</div>
                <Button variant="primary" onClick={onOpenProfile}>
                  Sign in
                </Button>
              </Card>
            )}

            <Card title="What is Vekke?">
              <div style={{ fontSize: 14, opacity: 0.78, lineHeight: 1.6 }}>
                Vekke is a serious abstract strategy game built for ranked play: routes, sieges, and positional control.
                <div style={{ marginTop: 10, opacity: 0.75 }}>Governed by the International Vekke Council (IVC).</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomePagePreview() {
  return (
    <HomePage
      isLoggedIn={true}
      isPro={true}
      username="Dan"
      avatarUrl={null}
      titleLabel="Expert"
      elo={1200}
      activeGames={7}
      streak={4}
      stats={{ onlineNow: 42, gamesInProgress: 12, gamesThisWeek: 3214 }}
      activity={[
        {
          id: "1",
          atLabel: "Now",
          kind: "result",
          winner: { name: "Dan", elo: 1200, title: "Expert", country: "US" },
          loser: { name: "Alex", elo: 900, title: "Adept", country: "CA" },
          deltaLabel: "+12",
        },
        {
          id: "2",
          atLabel: "3m",
          kind: "promo",
          who: { name: "Maria", elo: 1502, title: "Master", country: "ES" },
          toTitle: "Senior Master",
          toElo: 1801,
        },
        { id: "3", atLabel: "7m", kind: "system", text: "Game #1452 finished (32 moves)" },
        {
          id: "4",
          atLabel: "12m",
          kind: "result",
          winner: { name: "Rin", elo: 1011, title: "Adept", country: "KR" },
          loser: { name: "Cal", elo: 740, title: "Novice", country: "US" },
          deltaLabel: "+9",
        },
      ]}
      weeklyTop={[
        { rank: 1, person: { name: "Rin", elo: 1011, title: "Adept", country: "KR" }, momentum: 2 },
        { rank: 2, person: { name: "Cal", elo: 740, title: "Novice", country: "US" }, momentum: -1 },
        { rank: 3, person: { name: "Omar", elo: 905, title: "Novice", country: "EG" }, momentum: 1 },
        { rank: 4, person: { name: "Lena", elo: 1322, title: "Expert", country: "SE" }, momentum: 3 },
        { rank: 5, person: { name: "Kira", elo: 1188, title: "Adept", country: "JP" }, momentum: -2 },
      ]}
      leaderboardTop={[
        { rank: 1, person: { name: "John", elo: 2124, title: "Grandmaster", country: "US" } },
        { rank: 2, person: { name: "Elena", elo: 2093, title: "Grandmaster", country: "RU" } },
        { rank: 3, person: { name: "Mark", elo: 2050, title: "Grandmaster", country: "GB" } },
        { rank: 4, person: { name: "Sol", elo: 2022, title: "Senior Master", country: "BR" } },
        { rank: 5, person: { name: "Nolan", elo: 1998, title: "Master", country: "DE" } },
      ]}
      onPlayAi={() => alert("Computer")}
      onPlayPvp={() => alert("PvP")}
      onOpenLeaderboard={() => alert("Leaderboard")}
      onOpenProfile={() => alert("Profile")}
      onOpenPro={() => alert("Pro / Upgrade")}
      onOpenWiki={() => alert("Rules")}
      onOpenChallenges={() => alert("Challenges")}
      onOpenTutorial={() => alert("Tutorial")}
    />
  )
}
