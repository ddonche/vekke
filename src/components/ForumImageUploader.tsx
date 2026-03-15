// src/components/ForumImageUploader.tsx
import React, { useRef, useState } from "react"
import { supabase } from "../services/supabase"

const MAX_IMAGES = 3
const MAX_SIZE_MB = 5
const ACCEPTED = "image/jpeg,image/png,image/gif,image/webp"

interface Props {
  userId: string
  images: string[]
  onChange: (urls: string[]) => void
}

export function ForumImageUploader({ userId, images, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)

    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) return

    const toUpload = Array.from(files).slice(0, remaining)
    setUploading(true)

    const newUrls: string[] = []

    for (const file of toUpload) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`${file.name} exceeds ${MAX_SIZE_MB}MB limit.`)
        continue
      }

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("forum-images")
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`)
        continue
      }

      const { data } = supabase.storage.from("forum-images").getPublicUrl(path)
      if (data?.publicUrl) newUrls.push(data.publicUrl)
    }

    onChange([...images, ...newUrls])
    setUploading(false)

    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = ""
  }

  function removeImage(url: string) {
    onChange(images.filter(u => u !== url))
    // Optionally delete from storage — skip for now, orphan cleanup can be a cron
  }

  return (
    <div style={{ marginTop: 10 }}>
      {/* Thumbnails */}
      {images.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {images.map(url => (
            <div key={url} style={{ position: "relative", flexShrink: 0 }}>
              <img
                src={url}
                alt="attachment"
                style={{
                  width: 80, height: 80, objectFit: "cover",
                  borderRadius: 6, border: "1px solid rgba(184,150,106,0.25)",
                  display: "block",
                }}
              />
              <button
                onClick={() => removeImage(url)}
                style={{
                  position: "absolute", top: -6, right: -6,
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#0a0a0c", border: "1px solid rgba(238,72,76,0.5)",
                  color: "#ee484c", cursor: "pointer",
                  display: "grid", placeItems: "center",
                  fontSize: 11, fontWeight: 900, lineHeight: 1,
                  padding: 0,
                }}
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {images.length < MAX_IMAGES && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            style={{ display: "none" }}
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase" as const,
              background: "transparent",
              border: "1px solid rgba(184,150,106,0.25)",
              color: "#b0aa9e", borderRadius: 4, padding: "7px 14px",
              cursor: uploading ? "default" : "pointer",
              opacity: uploading ? 0.5 : 1, transition: "all 0.12s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            {uploading ? "Uploading…" : `Add Image${images.length > 0 ? ` (${images.length}/${MAX_IMAGES})` : ""}`}
          </button>
          <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: "#4a4540" }}>
            JPG, PNG, GIF, WEBP · max {MAX_SIZE_MB}MB each
          </span>
        </div>
      )}

      {error && (
        <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: "#ee484c", margin: "8px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  )
}

// ─── ImageGrid — renders images inside a PostCard ──────────────────────────

export function ImageGrid({ images }: { images: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (!images || images.length === 0) return null

  return (
    <>
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, marginTop: 4,
      }}>
        {images.map(url => (
          <img
            key={url}
            src={url}
            alt="attachment"
            onClick={() => setLightbox(url)}
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              borderRadius: 6,
              border: "1px solid rgba(184,150,106,0.2)",
              cursor: "zoom-in",
              display: "block",
            }}
          />
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "grid", placeItems: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightbox}
            alt="full size"
            style={{
              maxWidth: "90vw", maxHeight: "90vh",
              objectFit: "contain", borderRadius: 8,
              boxShadow: "0 0 60px rgba(0,0,0,0.8)",
            }}
          />
        </div>
      )}
    </>
  )
}
