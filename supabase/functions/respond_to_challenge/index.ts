import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  inviteId: string
  response: "accept" | "decline"
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
    const userId = u.user.id

    const body = (await req.json()) as Body
    if (!body?.inviteId) return json(400, { error: "inviteId is required" })
    if (body.response !== "accept" && body.response !== "decline") return json(400, { error: "Invalid response" })

    const admin = createClient(URL, SRV)

    const { data: invite, error: invErr } = await admin
      .from("game_invites")
      .select("*")
      .eq("id", body.inviteId)
      .single()

    if (invErr || !invite) return json(404, { error: "Invite not found" })
    if (!["pvp"].includes(invite.invite_type)) return json(400, { error: "Not a challenge invite" })
    if (invite.status !== "pending") {
      return json(200, { status: invite.status, gameId: invite.game_id ?? null })
    }

    const inviterId = String(invite.created_by)
    const inviteeId = invite.invited_user_id ? String(invite.invited_user_id) : null
    if (!inviteeId) return json(400, { error: "Invite missing invited_user_id" })

    if (userId !== inviterId && userId !== inviteeId) return json(403, { error: "Not authorized for this invite" })

    // Decline
    if (body.response === "decline") {
      const { error: decErr } = await admin
        .from("game_invites")
        .update({
          status: "declined",
          declined_by: userId,
          declined_at: new Date().toISOString(),
        })
        .eq("id", body.inviteId)

      if (decErr) return json(500, { error: decErr.message })
      return json(200, { status: "declined" })
    }

    // Accept: stamp the right side
    const patch: Record<string, any> = {}
    if (userId === inviterId) patch.inviter_accepted_at = new Date().toISOString()
    if (userId === inviteeId) patch.invitee_accepted_at = new Date().toISOString()

    const { data: updated, error: upErr } = await admin
      .from("game_invites")
      .update(patch)
      .eq("id", body.inviteId)
      .select("*")
      .single()

    if (upErr || !updated) return json(500, { error: upErr?.message ?? "Update failed" })

    // If not both accepted yet
    if (!updated.inviter_accepted_at || !updated.invitee_accepted_at) {
      return json(200, {
        status: "pending",
        waitingFor: updated.inviter_accepted_at ? "invitee" : "inviter",
      })
    }

    // Both accepted, game already created?
    if (updated.game_id) return json(200, { status: "accepted", gameId: updated.game_id })

    const initialState = updated.initial_state
    if (!initialState) return json(500, { error: "Invite missing initial_state" })

    // Prevent duplicate active games between these two players
    const { data: existing, error: dupErr } = await admin
      .from("games")
      .select("id")
      .eq("status", "active")
      .or(`and(wake_id.eq.${inviterId},brake_id.eq.${inviteeId}),and(wake_id.eq.${inviteeId},brake_id.eq.${inviterId})`)
      .maybeSingle()

    if (dupErr) return json(500, { error: dupErr.message })
    if (existing) {
      // Return the existing game rather than creating a duplicate
      const now = new Date().toISOString()
      await admin
        .from("game_invites")
        .update({ status: "accepted", game_id: existing.id, accepted_at: now, accepted_by: userId })
        .eq("id", body.inviteId)
      return json(200, { status: "accepted", gameId: existing.id })
    }

    const wakeId = inviterId
    const brakeId = inviteeId

    const gameInsert: Record<string, any> = {
      created_by: inviterId,
      wake_id: wakeId,
      brake_id: brakeId,
      format: updated.time_control ?? "daily",
      status: "active",
      turn: "B",
      vgn_version: updated.vgn_version ?? "1",
      initial_state: initialState,
      current_state: initialState,
      turn_started_at: null,
      last_move_at: null,
    }

    const { data: game, error: gErr } = await admin
      .from("games")
      .insert(gameInsert)
      .select("id")
      .single()

    if (gErr) return json(500, { error: gErr.message })

    const now = new Date().toISOString()
    const { error: finErr } = await admin
      .from("game_invites")
      .update({
        status: "accepted",
        game_id: game.id,
        accepted_at: now,
        accepted_by: userId,
      })
      .eq("id", body.inviteId)

    if (finErr) return json(500, { error: finErr.message })

    return json(200, { status: "accepted", gameId: game.id })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})
