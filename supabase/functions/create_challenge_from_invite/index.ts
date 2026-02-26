import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  inviterId: string
  initialState: any
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

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" })

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(401, { error: "Missing bearer token" })

    const URL = Deno.env.get("SUPABASE_URL")!
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
    const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    if (!URL || !ANON || !SRV) return json(500, { error: "Missing Supabase env vars" })

    // Verify caller (invitee)
    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })
    const inviteeId = u.user.id

    const body = (await req.json()) as Body
    if (!body?.inviterId || !isUuid(body.inviterId)) return json(400, { error: "inviterId is required" })
    if (!body?.initialState) return json(400, { error: "initialState is required" })
    if (body.inviterId === inviteeId) return json(400, { error: "Cannot invite yourself" })

    const inviterId = body.inviterId
    const admin = createClient(URL, SRV)

    // Ensure inviter exists (profiles.id is auth UUID in your schema)
    const { data: inviterProfile, error: pErr } = await admin
      .from("profiles")
      .select("id, username, avatar_url, country_code, country_name")
      .eq("id", inviterId)
      .maybeSingle()

    if (pErr) return json(500, { error: pErr.message })
    if (!inviterProfile) return json(404, { error: "Inviter not found" })

    // Credit referral ONLY if invitee is a "new user" (not onboarded yet) AND has no referrer yet.
    // This prevents counting existing accounts.
    const { data: inviteeProfile, error: ipErr } = await admin
      .from("profiles")
      .select("id, username, country_code, referred_by")
      .eq("id", inviteeId)
      .maybeSingle()

    if (ipErr) return json(500, { error: ipErr.message })
    if (!inviteeProfile) return json(500, { error: "Invitee profile not found" })

    const isNewUser = (inviteeProfile.username?.startsWith("user_") ?? false) || !inviteeProfile.country_code

    if (isNewUser && !inviteeProfile.referred_by) {
      const { error: rbErr } = await admin
        .from("profiles")
        .update({ referred_by: inviterId })
        .eq("id", inviteeId)
        .is("referred_by", null) // race-safe: only set if still null

      if (rbErr) return json(500, { error: rbErr.message })
    }

    // Reuse existing pending challenge for this pair
    const { data: existing, error: exErr } = await admin
      .from("game_invites")
      .select("id, invite_token, status, game_id")
      .eq("invite_type", "pvp")
      .eq("created_by", inviterId)
      .eq("invited_user_id", inviteeId)
      .eq("status", "pending")
      .maybeSingle()

    if (exErr) return json(500, { error: exErr.message })
    if (existing) {
      return json(200, {
        inviteId: existing.id,
        inviteToken: existing.invite_token,
        status: existing.status,
        inviter: {
          user_id: inviterProfile.id,
          username: inviterProfile.username,
          avatar_url: inviterProfile.avatar_url ?? null,
          country: inviterProfile.country_name ?? inviterProfile.country_code ?? null,
        },
        gameId: existing.game_id ?? null,
        reused: true,
      })
    }

    const inviteToken = crypto.randomUUID()
    const days = Math.max(1, Math.min(30, body.expiresInDays ?? 30))
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    const { data: inserted, error: insErr } = await admin
      .from("game_invites")
      .insert({
        invite_token: inviteToken,
        invite_type: "pvp",
        created_by: inviterId,
        invited_user_id: inviteeId,
        invitee_email: null,
        time_control: "daily",
        initial_state: body.initialState,
        vgn_version: body.vgnVersion ?? "1",
        expires_at: expiresAt,
        status: "pending",
        inviter_accepted_at: null,
        invitee_accepted_at: null,
      })
      .select("id, invite_token, status, game_id")
      .single()

    if (insErr) return json(500, { error: insErr.message })

    return json(200, {
      inviteId: inserted.id,
      inviteToken: inserted.invite_token,
      status: inserted.status,
      inviter: {
        user_id: inviterProfile.id,
        username: inviterProfile.username,
        avatar_url: inviterProfile.avatar_url ?? null,
        country: inviterProfile.country_name ?? inviterProfile.country_code ?? null,
      },
      gameId: inserted.game_id ?? null,
      reused: false,
    })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})