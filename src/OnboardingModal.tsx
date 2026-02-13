import React, { useState } from "react"
import { supabase } from "./services/supabase"
import { resizeImage } from "./imageUtils"

type OnboardingModalProps = {
  userId: string
  onComplete: () => void
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

export function OnboardingModal({ userId, onComplete }: OnboardingModalProps) {
  const [username, setUsername] = useState("")
  const [countryCode, setCountryCode] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    if (!username.trim()) {
      setError("Username is required")
      return
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters")
      return
    }

    if (!countryCode) {
      setError("Please select a country")
      return
    }

    setLoading(true)

    const country = COUNTRIES.find(c => c.code === countryCode)
    let avatarUrl: string | null = null

    // Upload avatar if file selected
    if (avatarFile) {
      const fileExt = avatarFile.name.split(".").pop()
      const fileName = `${userId}.${fileExt}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, avatarFile, {
          cacheControl: "3600",
          upsert: true, // Replace if already exists
        })

      if (uploadError) {
        setLoading(false)
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

    setLoading(false)

    if (updateError) {
      if (updateError.code === "23505") {
        setError("Username already taken")
      } else {
        setError(updateError.message)
      }
      return
    }

    // Success
    onComplete()
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
      >
        <div
          style={{
            fontWeight: "bold",
            fontSize: "1.125rem",
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Complete Your Profile
        </div>

        <div
          style={{
            fontSize: "0.75rem",
            opacity: 0.75,
            marginBottom: "20px",
            lineHeight: 1.35,
            textAlign: "center",
            color: "#d1d5db",
          }}
        >
          Choose your username and country to get started
        </div>

        {/* Error display */}
        {error && (
          <div
            style={{
              padding: "10px",
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

        <form onSubmit={handleSubmit}>
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
              placeholder="Choose a username"
              required
              disabled={loading}
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_-]+"
              title="Letters, numbers, underscore and dash only"
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
              3-20 characters, letters/numbers only
            </div>
          </div>

          {/* Country */}
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
              Country
            </label>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              required
              disabled={loading}
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

          {/* Avatar Upload (optional) */}
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
              Avatar (Optional)
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
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #4b5563",
                    background: "#1f2937",
                    color: "#e5e7eb",
                    fontSize: "0.75rem",
                    cursor: loading ? "default" : "pointer",
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

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "0.625rem",
              border: "2px solid #111",
              backgroundColor: "#ee484c",
              color: "white",
              fontWeight: "bold",
              cursor: loading ? "default" : "pointer",
              fontSize: "0.875rem",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Saving..." : "Complete Profile"}
          </button>
        </form>
      </div>
    </div>
  )
}
