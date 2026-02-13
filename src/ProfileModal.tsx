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
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" },
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
