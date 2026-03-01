import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  invitedUserId: string
  timeControl: "standard" | "rapid" | "blitz" | "daily"
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

    // Verify caller (inviter)
    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })
    const inviterId = u.user.id

    const body = (await req.json()) as Body

    const invitedUserId = (body?.invitedUserId ?? "").trim()
    if (!invitedUserId || !isUuid(invitedUserId)) return json(400, { error: "invitedUserId is required (uuid)" })
    if (invitedUserId === inviterId) return json(400, { error: "Cannot challenge yourself" })

    const tc = body?.timeControl
    if (tc !== "standard" && tc !== "rapid" && tc !== "blitz" && tc !== "daily") {
      return json(400, { error: "timeControl must be one of: standard, rapid, blitz, daily" })
    }

    if (!body?.initialState) return json(400, { error: "initialState is required" })

    const admin = createClient(URL, SRV)

    // Ensure invited user exists (profiles.id is auth UUID in your schema)
    const { data: invitedProfile, error: ipErr } = await admin
      .from("profiles")
      .select("id, is_ai")
      .eq("id", invitedUserId)
      .maybeSingle()

    if (ipErr) return json(500, { error: ipErr.message })
    if (!invitedProfile) return json(404, { error: "Invited user not found" })
    if (invitedProfile.is_ai) return json(400, { error: "AI cannot be challenged" })

    // Reuse existing pending challenge for this pair + time_control
    const { data: existing, error: exErr } = await admin
      .from("game_invites")
      .select("id, invite_token, status, game_id, time_control")
      .eq("invite_type", "pvp")
      .eq("created_by", inviterId)
      .eq("invited_user_id", invitedUserId)
      .eq("status", "pending")
      .eq("time_control", tc)
      .maybeSingle()

    if (exErr) return json(500, { error: exErr.message })
    if (existing) {
      return json(200, {
        reused: true,
        inviteId: existing.id,
        inviteToken: existing.invite_token,
        status: existing.status,
        gameId: existing.game_id ?? null,
      })
    }

    const inviteToken = crypto.randomUUID()
    const days = Math.max(1, Math.min(30, body.expiresInDays ?? 7))
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    const { data: inserted, error: insErr } = await admin
      .from("game_invites")
      .insert({
        invite_token: inviteToken,
        invite_type: "pvp",
        created_by: inviterId,
        invited_user_id: invitedUserId,
        invitee_email: null,
        time_control: tc,
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
      reused: false,
      inviteId: inserted.id,
      inviteToken: inserted.invite_token,
      status: inserted.status,
      gameId: inserted.game_id ?? null,
    })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})