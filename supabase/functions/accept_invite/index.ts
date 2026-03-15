import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type AcceptInviteBody = { inviteToken: string }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" })

    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      ""
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(401, { error: "Missing bearer token" })

    const URL = Deno.env.get("SUPABASE_URL")!
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
    const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    if (!URL || !ANON || !SRV) return json(500, { error: "Missing Supabase env vars" })

    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })

    const userId = u.user.id
    const userEmail = (u.user.email ?? "").toLowerCase()

    const body = (await req.json()) as AcceptInviteBody
    if (!body?.inviteToken) return json(400, { error: "inviteToken is required" })

    const admin = createClient(URL, SRV)

    const { data: inv, error: invErr } = await admin
      .from("game_invites")
      .select("*")
      .eq("invite_token", body.inviteToken)
      .maybeSingle()

    if (invErr) return json(500, { error: invErr.message })
    if (!inv) return json(404, { error: "Invite not found" })
    if (inv.accepted_at || inv.accepted_by) return json(409, { error: "Invite already accepted" })
    if (inv.declined_at || inv.declined_by) return json(409, { error: "Invite was declined" })

    const exp = new Date(inv.expires_at).getTime()
    if (!Number.isFinite(exp) || exp < Date.now()) return json(410, { error: "Invite expired" })

    const inviteType = (inv.invite_type ?? "pvp") as string

    if (inviteType === "rematch") {
      if (!inv.invited_user_id) return json(500, { error: "Rematch invite missing invited_user_id" })
      if (String(inv.invited_user_id) !== String(userId)) {
        return json(403, { error: "This rematch invite is for a different user" })
      }
    } else {
      if (inv.invitee_email) {
        const required = String(inv.invitee_email).toLowerCase()
        if (!userEmail || userEmail !== required) {
          return json(403, { error: "This invite is restricted to a different email" })
        }
      }
    }

    if (!inv.initial_state) return json(500, { error: "Invite missing initial_state" })

    const inviterId = String(inv.created_by)

    // Prevent duplicate active games between these two players
    const { data: existing, error: dupErr } = await admin
      .from("games")
      .select("id")
      .eq("status", "active")
      .or(`and(wake_id.eq.${inviterId},brake_id.eq.${userId}),and(wake_id.eq.${userId},brake_id.eq.${inviterId})`)
      .maybeSingle()

    if (dupErr) return json(500, { error: dupErr.message })
    if (existing) return json(200, { gameId: existing.id, alreadyExists: true })

    const { data: gameRow, error: gameErr } = await admin
      .from("games")
      .insert({
        created_by: inv.created_by,
        wake_id: inv.created_by,
        brake_id: userId,
        status: "active",
        turn: "B",
        vgn_version: inv.vgn_version ?? "1",
        initial_state: inv.initial_state,
        current_state: inv.initial_state,
        format: inv.time_control ?? "standard",
        last_move_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (gameErr) return json(500, { error: gameErr.message })

    const { error: updErr } = await admin
      .from("game_invites")
      .update({ accepted_by: userId, accepted_at: new Date().toISOString() })
      .eq("invite_token", body.inviteToken)

    if (updErr) return json(500, { error: updErr.message })

    return json(200, { gameId: gameRow.id })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})
