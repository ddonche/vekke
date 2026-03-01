import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  invitedUserId: string
  timeControl?: string // "standard" | "rapid" | "blitz" | "daily"
  isRanked?: boolean
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

    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })

    const challengerId = u.user.id

    const body = (await req.json()) as Body
    const invitedUserId = String(body?.invitedUserId ?? "").trim()
    if (!invitedUserId) return json(400, { error: "invitedUserId is required" })
    if (!body?.initialState) return json(400, { error: "initialState is required" })
    if (invitedUserId === String(challengerId)) return json(400, { error: "Cannot challenge yourself" })

    const timeControl = String(body.timeControl ?? "standard").toLowerCase()
    const expiresInDays = typeof body.expiresInDays === "number" && body.expiresInDays > 0 ? body.expiresInDays : 7
    const expiresAt = addDaysIso(expiresInDays)
    const vgnVersion = body.vgnVersion ?? "1"

    const admin = createClient(URL, SRV)

    // Reuse existing pending invite between these two users (either direction) to avoid duplicates.
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
        time_control: timeControl,
        status: "pending",
        declined_at: null,
        declined_by: null,
        inviter_accepted_at: null, // IMPORTANT for your handshake UI
        invitee_accepted_at: null, // IMPORTANT for your handshake UI
        game_id: null,
        initial_state: body.initialState,
        vgn_version: vgnVersion,
        expires_at: expiresAt,
        // accepted_by: null (leave unset unless your schema requires it)
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