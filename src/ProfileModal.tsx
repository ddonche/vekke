import React, { useState, useEffect } from "react"
import { supabase } from "./services/supabase"
import { resizeImage } from "./imageUtils"

type ProfileModalProps = {
  userId: string
  onClose: () => void
  onUpdate: () => void
}

const COUNTRIES = [
  { code: "AF", name: "Afghanistan" }, { code: "AL", name: "Albania" }, { code: "DZ", name: "Algeria" },
  { code: "AD", name: "Andorra" }, { code: "AO", name: "Angola" }, { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" }, { code: "AM", name: "Armenia" }, { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" }, { code: "AZ", name: "Azerbaijan" }, { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" }, { code: "BD", name: "Bangladesh" }, { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" }, { code: "BE", name: "Belgium" }, { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" }, { code: "BT", name: "Bhutan" }, { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" }, { code: "BW", name: "Botswana" }, { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" }, { code: "BG", name: "Bulgaria" }, { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" }, { code: "KH", name: "Cambodia" }, { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" }, { code: "CV", name: "Cape Verde" }, { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" }, { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" }, { code: "KM", name: "Comoros" }, { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (Democratic Republic)" }, { code: "CR", name: "Costa Rica" }, { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" }, { code: "CU", name: "Cuba" }, { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" }, { code: "DK", name: "Denmark" }, { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" }, { code: "DO", name: "Dominican Republic" }, { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" }, { code: "SV", name: "El Salvador" }, { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" }, { code: "EE", name: "Estonia" }, { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" }, { code: "FJ", name: "Fiji" }, { code: "FI", name: "Finland" },
  { code: "FR", name: "France" }, { code: "GA", name: "Gabon" }, { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" }, { code: "DE", name: "Germany" }, { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" }, { code: "GD", name: "Grenada" }, { code: "GT", name: "Guatemala" },
  { code: "GN", name: "Guinea" }, { code: "GW", name: "Guinea-Bissau" }, { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" }, { code: "HN", name: "Honduras" }, { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" }, { code: "IS", name: "Iceland" }, { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" }, { code: "IR", name: "Iran" }, { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" }, { code: "IL", name: "Israel" }, { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" }, { code: "JP", name: "Japan" }, { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" }, { code: "KE", name: "Kenya" }, { code: "KI", name: "Kiribati" },
  { code: "KW", name: "Kuwait" }, { code: "KG", name: "Kyrgyzstan" }, { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" }, { code: "LB", name: "Lebanon" }, { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" }, { code: "LY", name: "Libya" }, { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" }, { code: "LU", name: "Luxembourg" }, { code: "MO", name: "Macau" },
  { code: "MG", name: "Madagascar" }, { code: "MW", name: "Malawi" }, { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" }, { code: "ML", name: "Mali" }, { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" }, { code: "MR", name: "Mauritania" }, { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" }, { code: "FM", name: "Micronesia" }, { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" }, { code: "MN", name: "Mongolia" }, { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" }, { code: "MZ", name: "Mozambique" }, { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" }, { code: "NR", name: "Nauru" }, { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" }, { code: "NZ", name: "New Zealand" }, { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" }, { code: "NG", name: "Nigeria" }, { code: "KP", name: "North Korea" },
  { code: "MK", name: "North Macedonia" }, { code: "NO", name: "Norway" }, { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" }, { code: "PW", name: "Palau" }, { code: "PS", name: "Palestine" },
  { code: "PA", name: "Panama" }, { code: "PG", name: "Papua New Guinea" }, { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" }, { code: "PH", name: "Philippines" }, { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" }, { code: "PR", name: "Puerto Rico" }, { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" }, { code: "RU", name: "Russia" }, { code: "RW", name: "Rwanda" },
  { code: "KN", name: "Saint Kitts and Nevis" }, { code: "LC", name: "Saint Lucia" },
  { code: "VC", name: "Saint Vincent and the Grenadines" }, { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" }, { code: "ST", name: "São Tomé and Príncipe" },
  { code: "SA", name: "Saudi Arabia" }, { code: "SN", name: "Senegal" }, { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" }, { code: "SL", name: "Sierra Leone" }, { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" }, { code: "SI", name: "Slovenia" }, { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" }, { code: "ZA", name: "South Africa" }, { code: "KR", name: "South Korea" },
  { code: "SS", name: "South Sudan" }, { code: "ES", name: "Spain" }, { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" }, { code: "SR", name: "Suriname" }, { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" }, { code: "SY", name: "Syria" }, { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" }, { code: "TZ", name: "Tanzania" }, { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" }, { code: "TG", name: "Togo" }, { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" }, { code: "TN", name: "Tunisia" }, { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" }, { code: "TV", name: "Tuvalu" }, { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" }, { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" }, { code: "UZ", name: "Uzbekistan" }, { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatican City" }, { code: "VE", name: "Venezuela" }, { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" }, { code: "ZM", name: "Zambia" }, { code: "ZW", name: "Zimbabwe" },
]

// ── Shared Vekke modal styles ─────────────────────────────────────────────────
const S = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10001,
    padding: "20px",
  },
  card: {
    background: "#0f0f14",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: "30px 30px",

    // Width is set dynamically in render for mobile vs web
    width: "36rem",
    maxWidth: "96vw",

    color: "#e8e4d8",
    fontFamily: "'EB Garamond', Georgia, serif",
    maxHeight: "92vh",
    overflowY: "auto" as const,
  },
  title: {
    fontFamily: "'Cinzel', serif",
    fontSize: "1.05rem",
    fontWeight: 700,
    letterSpacing: "0.22em",
    textTransform: "uppercase" as const,
    color: "#b8966a",
    marginBottom: 18,
    textAlign: "center" as const,
  },
  divider: { height: 1, background: "rgba(255,255,255,0.07)", margin: "0 0 20px" },
  label: {
    display: "block",
    fontFamily: "'Cinzel', serif",
    fontSize: "0.85rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#b0aa9e",
    marginBottom: 8,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 6,
    border: "1px solid rgba(184,150,106,0.2)",
    background: "#13131a",
    color: "#e8e4d8",
    fontSize: "1.05rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 6,
    border: "1px solid rgba(184,150,106,0.2)",
    background: "#13131a",
    color: "#e8e4d8",
    fontSize: "1.05rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    outline: "none",
    boxSizing: "border-box" as const,
    resize: "vertical" as const,
    minHeight: 92,
  },
  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 6,
    border: "1px solid rgba(184,150,106,0.2)",
    background: "#13131a",
    color: "#e8e4d8",
    fontSize: "1.05rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  hint: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: "0.95rem",
    marginTop: 6,
    color: "#6b6558",
  },
  field: { marginBottom: 18 },
  error: {
    padding: "12px 14px",
    marginBottom: 16,
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    fontSize: "1.0rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    color: "#fca5a5",
  },
  success: {
    padding: "12px 14px",
    marginBottom: 16,
    background: "rgba(52,211,153,0.08)",
    border: "1px solid rgba(52,211,153,0.3)",
    borderRadius: 6,
    fontSize: "1.0rem",
    fontFamily: "'EB Garamond', Georgia, serif",
    color: "#6ee7b7",
  },
  btnPrimary: {
    flex: 1,
    padding: "12px",
    borderRadius: 4,
    border: "1px solid rgba(184,150,106,0.45)",
    background: "rgba(184,150,106,0.12)",
    color: "#d4af7a",
    fontFamily: "'Cinzel', serif",
    fontWeight: 700,
    fontSize: "0.9rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
  },
  btnCancel: {
    flex: 1,
    padding: "12px",
    borderRadius: 4,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "#6b6558",
    fontFamily: "'Cinzel', serif",
    fontWeight: 700,
    fontSize: "0.9rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
  },
  proBox: {
    padding: "14px 14px",
    marginBottom: 18,
    background: "rgba(184,150,106,0.08)",
    border: "1px solid rgba(184,150,106,0.22)",
    borderRadius: 10,
  },
  proBoxTitle: {
    fontFamily: "'Cinzel', serif",
    fontSize: "0.85rem",
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#d4af7a",
    marginBottom: 10,
  },
}

export function ProfileModal({ userId, onClose, onUpdate }: ProfileModalProps) {
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [countryCode, setCountryCode] = useState("")
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const [accountTier, setAccountTier] = useState<string | null>(null)

  // Pro-only profile extras
  const [bio, setBio] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [xUrl, setXUrl] = useState("")
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [twitchUrl, setTwitchUrl] = useState("")
  const [instagramUrl, setInstagramUrl] = useState("")
  const [facebookUrl, setFacebookUrl] = useState("")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 640)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const isPro = accountTier === "pro"

  // Load current profile
  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) setEmail(user.email)

      const { data: profile, error: err } = await supabase
        .from("profiles")
        .select(
          "username, country_code, avatar_url, account_tier, bio, website_url, x_url, youtube_url, twitch_url, instagram_url, facebook_url"
        )
        .eq("id", userId)
        .single()

      if (err) { setError(err.message); setLoading(false); return }

      if (profile) {
        setUsername(profile.username)
        setCountryCode(profile.country_code || "")
        setCurrentAvatarUrl(profile.avatar_url)
        setAvatarPreview(profile.avatar_url ? `${profile.avatar_url}?t=${Date.now()}` : null)

        setAccountTier(profile.account_tier ?? null)

        // Load extras (even if not Pro right now; we still gate rendering + saving)
        setBio(profile.bio || "")
        setWebsiteUrl(profile.website_url || "")
        setXUrl(profile.x_url || "")
        setYoutubeUrl(profile.youtube_url || "")
        setTwitchUrl(profile.twitch_url || "")
        setInstagramUrl(profile.instagram_url || "")
        setFacebookUrl(profile.facebook_url || "")
      }
      setLoading(false)
    }
    loadProfile()
  }, [userId])

  // Check username availability with debounce
  useEffect(() => {
    const checkUsername = async () => {
      if (!username || username.length < 3) { setUsernameAvailable(null); return }
      setCheckingUsername(true)

      const { data: profile } = await supabase
        .from("profiles").select("id, username").eq("id", userId).single()

      if (profile?.username === username) {
        setUsernameAvailable(true); setCheckingUsername(false); return
      }

      const { data } = await supabase
        .from("profiles").select("id").eq("username", username).single()
      setUsernameAvailable(!data)
      setCheckingUsername(false)
    }

    const timer = setTimeout(checkUsername, 500)
    return () => clearTimeout(timer)
  }, [username, userId])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) { setError("Please select an image file"); return }
    if (file.size > 5 * 1024 * 1024) { setError("Image must be less than 5MB"); return }
    setError(null)
    try {
      const resizedFile = await resizeImage(file)
      setAvatarFile(resizedFile)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(resizedFile)
    } catch {
      setError("Failed to process image")
    }
  }

  const normalizeUrl = (raw: string) => {
    const s = raw.trim()
    if (!s) return ""
    if (!/^https?:\/\//i.test(s)) return `https://${s}`
    return s
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setMessage(null)

    if (!username.trim()) { setError("Username is required"); return }
    if (username.length < 3) { setError("Username must be at least 3 characters"); return }
    if (usernameAvailable === false) { setError("Username is already taken"); return }
    if (!countryCode) { setError("Please select a country"); return }

    if (isPro && bio && bio.length > 140) {
      setError("Bio must be 140 characters or less")
      return
    }

    setSaving(true)

    // Update email/password if changed
    const { data: { user } } = await supabase.auth.getUser()
    if (email !== user?.email || newPassword) {
      const updates: { email?: string; password?: string } = {}
      if (email !== user?.email) updates.email = email
      if (newPassword) {
        if (newPassword.length < 6) { setSaving(false); setError("Password must be at least 6 characters"); return }
        updates.password = newPassword
      }
      const { error: authError } = await supabase.auth.updateUser(updates)
      if (authError) { setSaving(false); setError(authError.message); return }
      if (updates.email) setMessage("Email updated! Check your inbox to confirm.")
    }

    const country = COUNTRIES.find(c => c.code === countryCode)
    let avatarUrl = currentAvatarUrl

    if (avatarFile) {
      const fileExt = avatarFile.name.split(".").pop()
      const fileName = `${userId}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from("avatars").upload(fileName, avatarFile, { cacheControl: "3600", upsert: true })
      if (uploadError) { setSaving(false); setError(`Upload failed: ${uploadError.message}`); return }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName)
      avatarUrl = urlData.publicUrl
    }

    const updatePayload: Record<string, any> = {
      username: username.trim(),
      country_code: countryCode,
      country_name: country?.name || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }

    // Only Pro can write these fields.
    if (isPro) {
      updatePayload.bio = bio.trim() || null
      updatePayload.website_url = normalizeUrl(websiteUrl) || null
      updatePayload.x_url = normalizeUrl(xUrl) || null
      updatePayload.youtube_url = normalizeUrl(youtubeUrl) || null
      updatePayload.twitch_url = normalizeUrl(twitchUrl) || null
      updatePayload.instagram_url = normalizeUrl(instagramUrl) || null
      updatePayload.facebook_url = normalizeUrl(facebookUrl) || null
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId)

    setSaving(false)
    if (updateError) {
      setError(updateError.code === "23505" ? "Username already taken" : updateError.message)
      return
    }

    if (!message) setMessage("Profile updated successfully!")
    setAvatarFile(null)
    setNewPassword("")
    onUpdate()
    setTimeout(() => onClose(), 1500)
  }

  if (loading) {
    return (
      <div style={{ ...S.overlay, padding: isNarrow ? "10px" : "24px" }} onClick={onClose}>
        <div
          style={{
            ...S.card,
            width: isNarrow ? "96vw" : "min(64rem, 96vw)",
            padding: isNarrow ? "22px 18px" : "30px 30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 140,
          }}
        >
          <span style={{ color: "#6b6558", fontFamily: "'Cinzel', serif", fontSize: "0.95rem", letterSpacing: "0.18em" }}>
            Loading…
          </span>
        </div>
      </div>
    )
  }

  const unameColor = usernameAvailable === false ? "#fca5a5" : usernameAvailable === true ? "#6ee7b7" : "#6b6558"
  const unameText = checkingUsername ? "Checking…"
    : usernameAvailable === false ? "Username taken"
    : usernameAvailable === true ? "Username available"
    : "3–20 characters · letters, numbers, _ and -"

  const unameBorder = usernameAvailable === false
    ? "1px solid rgba(239,68,68,0.4)"
    : usernameAvailable === true
    ? "1px solid rgba(52,211,153,0.35)"
    : "1px solid rgba(184,150,106,0.2)"

  const bioRemaining = 140 - bio.length

  const proGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
    gap: 14,
  }

  return (
    <div style={{ ...S.overlay, padding: isNarrow ? "10px" : "24px" }} onClick={onClose}>
      <div
        style={{
          ...S.card,
          width: isNarrow ? "96vw" : "min(64rem, 96vw)",
          padding: isNarrow ? "22px 18px" : "30px 30px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={S.title}>Edit Profile</div>
        <div style={S.divider} />

        {error && <div style={S.error}>{error}</div>}
        {message && <div style={S.success}>{message}</div>}

        <form onSubmit={handleSubmit}>
          {/* Avatar */}
          <div style={S.field}>
            <label style={S.label}>Avatar</label>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", background: "#13131a",
                border: "1px solid rgba(184,150,106,0.2)", display: "flex",
                alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0,
              }}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: "1.6rem", opacity: 0.3 }}>👤</span>
                }
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={saving}
                  style={{
                    ...S.input,
                    fontSize: "0.98rem",
                    padding: "10px 12px",
                    cursor: saving ? "default" : "pointer",
                  }}
                />
                <div style={S.hint}>PNG, JPG, GIF · max 5MB</div>
              </div>
            </div>
          </div>

          {/* Username */}
          <div style={S.field}>
            <label style={S.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={saving}
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_-]+"
              title="Letters, numbers, underscore and dash only"
              style={{ ...S.input, border: unameBorder }}
            />
            <div style={{ ...S.hint, color: unameColor }}>{unameText}</div>
          </div>

          {/* Email */}
          <div style={S.field}>
            <label style={S.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={saving}
              style={S.input}
            />
            <div style={S.hint}>Changing email requires inbox confirmation</div>
          </div>

          {/* New Password */}
          <div style={S.field}>
            <label style={S.label}>
              New Password{" "}
              <span
                style={{
                  color: "#6b6558",
                  fontFamily: "'EB Garamond', serif",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontSize: "1.0rem",
                  fontWeight: 400,
                }}
              >
                (optional)
              </span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={saving}
              minLength={6}
              placeholder="Leave blank to keep current"
              style={S.input as any}
            />
            <div style={S.hint}>Minimum 6 characters</div>
          </div>

          {/* Country */}
          <div style={{ ...S.field, marginBottom: 22 }}>
            <label style={S.label}>Country</label>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              required
              disabled={saving}
              style={S.select}
            >
              <option value="">Select your country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Pro-only extras */}
          {isPro && (
            <div style={S.proBox}>
              <div style={S.proBoxTitle}>Pro Profile</div>

              <div style={S.field}>
                <label style={S.label}>Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={saving}
                  maxLength={140}
                  style={S.textarea}
                  placeholder="140 characters max"
                />
                <div style={S.hint}>{bioRemaining} characters remaining</div>
              </div>

              <div style={proGridStyle}>
                <div style={{ marginBottom: 0 }}>
                  <label style={S.label}>Website</label>
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    disabled={saving}
                    style={S.input}
                    placeholder="yourdomain.com"
                  />
                </div>

                <div style={{ marginBottom: 0 }}>
                  <label style={S.label}>YouTube</label>
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    disabled={saving}
                    style={S.input}
                    placeholder="youtube.com/@yourchannel"
                  />
                </div>

                <div style={{ marginBottom: 0 }}>
                  <label style={S.label}>Twitch</label>
                  <input
                    type="text"
                    value={twitchUrl}
                    onChange={(e) => setTwitchUrl(e.target.value)}
                    disabled={saving}
                    style={S.input}
                    placeholder="twitch.tv/yourname"
                  />
                </div>

                <div style={{ marginBottom: 0 }}>
                  <label style={S.label}>X</label>
                  <input
                    type="text"
                    value={xUrl}
                    onChange={(e) => setXUrl(e.target.value)}
                    disabled={saving}
                    style={S.input}
                    placeholder="x.com/yourname"
                  />
                </div>

                <div style={{ marginBottom: 0 }}>
                  <label style={S.label}>Instagram</label>
                  <input
                    type="text"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    disabled={saving}
                    style={S.input}
                    placeholder="instagram.com/yourname"
                  />
                </div>

                <div style={{ marginBottom: 0 }}>
                  <label style={S.label}>Facebook</label>
                  <input
                    type="text"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    disabled={saving}
                    style={S.input}
                    placeholder="facebook.com/yourname"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ ...S.btnCancel, opacity: saving ? 0.5 : 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}