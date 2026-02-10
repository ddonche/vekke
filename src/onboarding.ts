import { supabase } from "./supabase"

export type ProfileUpdate = {
  username: string
  countryCode?: string // "US"
  countryName?: string // "United States"
  avatarFile?: File
}

function normalizeCountryCode(code?: string) {
  const c = (code ?? "").trim().toUpperCase()
  return c.length === 2 ? c : undefined
}

export async function finishOnboarding(input: ProfileUpdate) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr) throw userErr
  if (!user) throw new Error("Not signed in")

  const username = input.username.trim()
  if (!username) throw new Error("Username required")

  const country_code = normalizeCountryCode(input.countryCode)
  const country_name = (input.countryName ?? "").trim() || null

  let avatar_url: string | null = null

  // 1) Upload avatar (optional)
  if (input.avatarFile) {
    const ext = input.avatarFile.name.split(".").pop()?.toLowerCase() || "png"
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, input.avatarFile, { upsert: false, contentType: input.avatarFile.type })

    if (upErr) throw upErr

    // public URL
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path)
    avatar_url = pub.publicUrl
  }

  // 2) Update profile (this will fail if username already taken due to unique constraint)
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      username,
      country_code: country_code ?? null,
      country_name,
      avatar_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)

  if (profErr) {
    // Common case: username unique violation
    throw profErr
  }

  return true
}
