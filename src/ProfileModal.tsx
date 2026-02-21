import React, { useState, useEffect } from "react"
import { supabase } from "./services/supabase"
import { resizeImage } from "./imageUtils"

type ProfileModalProps = {
  userId: string
  onClose: () => void
  onUpdate: () => void
}

// ISO 3166-1 alpha-2 country codes - common ones
const COUNTRIES = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "CV", name: "Cape Verde" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (Democratic Republic)" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d’Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" },
  { code: "GD", name: "Grenada" },
  { code: "GT", name: "Guatemala" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MO", name: "Macau" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "KP", name: "North Korea" },
  { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Palestine" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PR", name: "Puerto Rico" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "São Tomé and Príncipe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatican City" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
] 

export function ProfileModal({ userId, onClose, onUpdate }: ProfileModalProps) {
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [countryCode, setCountryCode] = useState("")
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Load current profile
  useEffect(() => {
    async function loadProfile() {
      // Get email from auth
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setEmail(user.email)
      }

      const { data: profile, error: err } = await supabase
        .from("profiles")
        .select("username, country_code, avatar_url")
        .eq("id", userId)
        .single()

      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }

      if (profile) {
        setUsername(profile.username)
        setCountryCode(profile.country_code || "")
        setCurrentAvatarUrl(profile.avatar_url)
        // Add cache busting to avatar preview
        setAvatarPreview(profile.avatar_url ? `${profile.avatar_url}?t=${Date.now()}` : null)
      }

      setLoading(false)
    }

    loadProfile()
  }, [userId])

  // Check username availability with debounce
  useEffect(() => {
    const checkUsername = async () => {
      if (!username || username.length < 3) {
        setUsernameAvailable(null)
        return
      }

      setCheckingUsername(true)

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("id", userId)
        .single()

      // If username unchanged, it's available
      if (profile?.username === username) {
        setUsernameAvailable(true)
        setCheckingUsername(false)
        return
      }

      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .single()

      setUsernameAvailable(!data)
      setCheckingUsername(false)
    }

    const timer = setTimeout(checkUsername, 500)
    return () => clearTimeout(timer)
  }, [username, userId])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file")
      return
    }

    // Validate file size (max 5MB before resize)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB")
      return
    }

    setError(null)

    try {
      // Resize image to 256x256
      const resizedFile = await resizeImage(file)
      setAvatarFile(resizedFile)

      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(resizedFile)
    } catch (err) {
      setError("Failed to process image")
      console.error(err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!username.trim()) {
      setError("Username is required")
      return
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters")
      return
    }

    if (usernameAvailable === false) {
      setError("Username is already taken")
      return
    }

    if (!countryCode) {
      setError("Please select a country")
      return
    }

    setSaving(true)

    // Update email/password if changed
    const { data: { user } } = await supabase.auth.getUser()
    
    if (email !== user?.email || newPassword) {
      const updates: { email?: string; password?: string } = {}
      
      if (email !== user?.email) {
        updates.email = email
      }
      
      if (newPassword) {
        if (newPassword.length < 6) {
          setSaving(false)
          setError("Password must be at least 6 characters")
          return
        }
        updates.password = newPassword
      }

      const { error: authError } = await supabase.auth.updateUser(updates)
      
      if (authError) {
        setSaving(false)
        setError(authError.message)
        return
      }

      if (updates.email) {
        setMessage("Email updated! Check your inbox to confirm the new email.")
      }
    }

    const country = COUNTRIES.find(c => c.code === countryCode)
    let avatarUrl = currentAvatarUrl

    // Upload new avatar if file selected
    if (avatarFile) {
      const fileExt = avatarFile.name.split(".").pop()
      const fileName = `${userId}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, avatarFile, {
          cacheControl: "3600",
          upsert: true,
        })

      if (uploadError) {
        setSaving(false)
        setError(`Upload failed: ${uploadError.message}`)
        return
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)
      
      avatarUrl = urlData.publicUrl
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        username: username.trim(),
        country_code: countryCode,
        country_name: country?.name || null,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)

    setSaving(false)

    if (updateError) {
      if (updateError.code === "23505") {
        setError("Username already taken")
      } else {
        setError(updateError.message)
      }
      return
    }

    // Success
    if (!message) {
      setMessage("Profile updated successfully!")
    }
    setAvatarFile(null)
    setNewPassword("")
    onUpdate()
    
    // Close after brief delay
    setTimeout(() => {
      onClose()
    }, 1500)
  }

  if (loading) {
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
            backgroundColor: "#374151",
            border: "1px solid #4b5563",
            borderRadius: "12px",
            padding: "20px",
            color: "#e5e7eb",
          }}
        >
          Loading...
        </div>
      </div>
    )
  }

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
          backgroundColor: "#374151",
          border: "1px solid #4b5563",
          borderRadius: "12px",
          padding: "20px",
          maxWidth: "90vw",
          width: "25rem",
          color: "#e5e7eb",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontWeight: "bold",
            fontSize: "1.125rem",
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Edit Profile
        </div>

        {/* Error/Message display */}
        {error && (
          <div
            style={{
              padding: "10px",
              marginTop: "12px",
              marginBottom: "16px",
              backgroundColor: "#991b1b",
              border: "1px solid #dc2626",
              borderRadius: "6px",
              fontSize: "0.875rem",
              color: "#fecaca",
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            style={{
              padding: "10px",
              marginTop: "12px",
              marginBottom: "16px",
              backgroundColor: "#065f46",
              border: "1px solid #059669",
              borderRadius: "6px",
              fontSize: "0.875rem",
              color: "#d1fae5",
            }}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Avatar Upload */}
          <div style={{ marginBottom: "20px", marginTop: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Avatar
            </label>
            
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {/* Avatar preview */}
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: "#1f2937",
                  border: "2px solid #4b5563",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div style={{ fontSize: "1.5rem", color: "#9ca3af" }}>👤</div>
                )}
              </div>

              {/* File input */}
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #4b5563",
                    background: "#1f2937",
                    color: "#e5e7eb",
                    fontSize: "0.75rem",
                    cursor: saving ? "default" : "pointer",
                  }}
                />
                <div
                  style={{
                    fontSize: "0.6875rem",
                    marginTop: "4px",
                    color: "#9ca3af",
                    opacity: 0.7,
                  }}
                >
                  PNG, JPG, or GIF (max 2MB)
                </div>
              </div>
            </div>
          </div>

          {/* Username */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Username
            </label>
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
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${
                  usernameAvailable === false ? "#dc2626" : 
                  usernameAvailable === true ? "#059669" : 
                  "#4b5563"
                }`,
                background: "#1f2937",
                color: "#e5e7eb",
                fontSize: "0.875rem",
              }}
            />
            <div
              style={{
                fontSize: "0.6875rem",
                marginTop: "4px",
                color: usernameAvailable === false ? "#fecaca" : 
                       usernameAvailable === true ? "#d1fae5" : 
                       "#9ca3af",
              }}
            >
              {checkingUsername ? "Checking..." : 
               usernameAvailable === false ? "Username taken" :
               usernameAvailable === true ? "Username available" :
               "3-20 characters, letters/numbers only"}
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={saving}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                background: "#1f2937",
                color: "#e5e7eb",
                fontSize: "0.875rem",
              }}
            />
            <div
              style={{
                fontSize: "0.6875rem",
                marginTop: "4px",
                color: "#9ca3af",
                opacity: 0.7,
              }}
            >
              Changing email requires confirmation
            </div>
          </div>

          {/* New Password */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              New Password (Optional)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={saving}
              minLength={6}
              placeholder="Leave blank to keep current password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                background: "#1f2937",
                color: "#e5e7eb",
                fontSize: "0.875rem",
              }}
            />
            <div
              style={{
                fontSize: "0.6875rem",
                marginTop: "4px",
                color: "#9ca3af",
                opacity: 0.7,
              }}
            >
              Minimum 6 characters
            </div>
          </div>

          {/* Country */}
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: "bold",
                marginBottom: "6px",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Country
            </label>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              required
              disabled={saving}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                background: "#1f2937",
                color: "#e5e7eb",
                fontSize: "0.875rem",
              }}
            >
              <option value="">Select your country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                background: "transparent",
                color: "#9ca3af",
                fontWeight: "bold",
                cursor: saving ? "default" : "pointer",
                fontSize: "0.875rem",
                opacity: saving ? 0.5 : 1,
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: "2px solid #111",
                backgroundColor: "#ee484c",
                color: "white",
                fontWeight: "bold",
                cursor: saving ? "default" : "pointer",
                fontSize: "0.875rem",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
