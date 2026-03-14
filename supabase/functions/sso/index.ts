import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const DISCOURSE_SECRET = Deno.env.get("DISCOURSE_SSO_SECRET")!
const DISCOURSE_URL = "https://forum.vekke.net"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

async function computeHmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

Deno.serve(async (req) => {
  try {
  const url = new URL(req.url)

  // ── Step 1: Discourse sends sso + sig query params ──────────────────────────
  const rawSso = url.searchParams.get("sso")
  const sig    = url.searchParams.get("sig")

  if (!rawSso || !sig) {
    return new Response("Missing sso or sig", { status: 400 })
  }

  // ── Step 2: Verify the signature from Discourse ──────────────────────────────
  const expectedSig = await computeHmacSha256(DISCOURSE_SECRET, rawSso)
  console.log("expected:", expectedSig)
  console.log("received:", sig)
  console.log("secret present:", !!DISCOURSE_SECRET)
  if (expectedSig !== sig) {
    return new Response(`Invalid signature — expected: ${expectedSig} got: ${sig}`, { status: 403 })
  }

  // ── Step 3: Decode the nonce ─────────────────────────────────────────────────
  const decoded = atob(rawSso)
  const params  = new URLSearchParams(decoded)
  const nonce   = params.get("nonce")
  const returnUrl = params.get("return_sso_url") ?? `${DISCOURSE_URL}/session/sso_login`

  if (!nonce) {
    return new Response("Missing nonce", { status: 400 })
  }

  // ── Step 4: Verify the user's Supabase session ───────────────────────────────
  const authHeader = req.headers.get("Authorization")
  const token = authHeader?.replace("Bearer ", "") ?? url.searchParams.get("token")

  if (!token) {
    // Not logged in — redirect to Vekke login page with return URL
    const loginUrl = new URL("https://vekke.net/login")
    loginUrl.searchParams.set("redirect", req.url)
    return Response.redirect(loginUrl.toString(), 302)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    const loginUrl = new URL("https://vekke.net/login")
    loginUrl.searchParams.set("redirect", req.url)
    return Response.redirect(loginUrl.toString(), 302)
  }

  // ── Step 5: Fetch their Vekke profile ────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", user.id)
    .single()

  // ── Step 6: Build the response payload ───────────────────────────────────────
  const responseParams = new URLSearchParams({
    nonce,
    email:       user.email!,
    external_id: user.id,
    username:    profile?.username ?? user.email!.split("@")[0],
    ...(profile?.avatar_url ? { avatar_url: profile.avatar_url } : {}),
  })

  const responsePayload = btoa(responseParams.toString())
  const responseSig     = await computeHmacSha256(DISCOURSE_SECRET, responsePayload)

  // ── Step 7: Redirect back to Discourse ───────────────────────────────────────
  const redirectUrl = new URL(returnUrl)
  redirectUrl.searchParams.set("sso", responsePayload)
  redirectUrl.searchParams.set("sig", responseSig)

  return Response.redirect(redirectUrl.toString(), 302)
  } catch (e) {
    console.error("SSO error:", e)
    return new Response(`SSO Error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
})
