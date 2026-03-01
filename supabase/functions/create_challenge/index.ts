import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  invitedUserId: string
  timeControl?: string // "standard" | "rapid" | "blitz" | "daily"
  isRanked?: boolean
  initialState: unknown
  vgnVersion?: string
  expiresInDays?: number
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

function makeToken(len = 48) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ""
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length]
  return out
}

function addDaysIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function isUuid(v: string) {
  // strict UUID v1-5
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function normalizeTimeControl(v: unknown) {
  const t = String(v ?? "standard").toLowerCase()
  if (t === "standard" || t === "rapid" || t === "blitz" || t === "daily") return t
  return "standard"
}

function clampExpires(v: unknown) {
  if (typeof v !== "number" || !Number.isFinite(v)) return 7
  // clamp to something sane so people can’t make year-long junk rows
  const n = Math.floor(v)
  if (n < 1) return 1
  if (n > 30) return 30
  return n
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json(405, { error: "Method not allowed" })

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(401, { error: "Missing bearer token" })

    const URL = Deno.env.get("SUPABASE_URL") ?? ""
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!URL || !ANON || !SRV) return json(500, { error: "Missing Supabase env vars" })

    // Parse JSON body (hard fail cleanly if it’s not JSON)
    let body: Body
    try {
      body = (await req.json()) as Body
    } catch {
      return json(400, { error: "Invalid JSON body" })
    }

    const invitedUserId = String(body?.invitedUserId ?? "").trim()
    if (!invitedUserId) return json(400, { error: "invitedUserId is required" })
    if (!isUuid(invitedUserId)) return json(400, { error: "invitedUserId must be a UUID" })
    if (body?.initialState == null) return json(400, { error: "initialState is required" })

    // Prevent abuse / accidental giant payloads
    // (Edge functions + Postgres JSONB will happily accept huge blobs unless you stop it.)
    const stateStr = JSON.stringify(body.initialState)
    if (stateStr.length > 150_000) {
      return json(413, { error: "initialState too large" })
    }

    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })

    const challengerId = u.user.id
    if (invitedUserId === challengerId) return json(400, { error: "Cannot challenge yourself" })

    const timeControl = normalizeTimeControl(body.timeControl)
    const expiresInDays = clampExpires(body.expiresInDays)
    const expiresAt = addDaysIso(expiresInDays)
    const vgnVersion = String(body.vgnVersion ?? "1")

    // Service role for DB writes/reads (bypass RLS safely inside this function)
    const admin = createClient(URL, SRV)

    // Reuse existing pending invite between these two users (either direction) to avoid duplicates.
    // NOTE: we keep this EXACTLY to invite_type=pvp + status=pending so “old” invites won’t block new ones.
    const { data: existing, error: exErr } = await admin
      .from("game_invites")
      .select("id, status, game_id")
      .eq("invite_type", "pvp")
      .eq("status", "pending")
      .or(
        `and(created_by.eq.${challengerId},invited_user_id.eq.${invitedUserId}),and(created_by.eq.${invitedUserId},invited_user_id.eq.${challengerId})`,
      )
      .limit(1)

    if (exErr) return json(500, { error: exErr.message })

    if (existing && existing.length > 0) {
      return json(200, {
        reused: true,
        inviteId: existing[0].id,
        status: existing[0].status,
        gameId: existing[0].game_id ?? null,
      })
    }

    const inviteToken = makeToken(48)

    const { data: created, error: cErr } = await admin
      .from("game_invites")
      .insert({
        invite_token: inviteToken,
        invite_type: "pvp",
        created_by: challengerId,
        invited_user_id: invitedUserId,
        // Keep accepted_by empty for direct-user invites; your ChallengesPage already handles accepted_by for token flows.
        accepted_by: null,

        time_control: timeControl,
        status: "pending",
        declined_at: null,
        declined_by: null,

        inviter_accepted_at: null,
        invitee_accepted_at: null,

        game_id: null,

        initial_state: body.initialState,
        vgn_version: vgnVersion,

        expires_at: expiresAt,
        is_ranked: typeof body.isRanked === "boolean" ? body.isRanked : true,
      })
      .select("id, invite_token, status, expires_at")
      .single()

    if (cErr) return json(500, { error: cErr.message })

    return json(200, {
      reused: false,
      inviteId: created.id,
      inviteToken: created.invite_token,
      status: created.status,
      expiresAt: created.expires_at,
    })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})