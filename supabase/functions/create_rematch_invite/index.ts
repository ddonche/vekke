import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = { sourceGameId: string }

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

    // Verify caller
    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })

    const userId = u.user.id

    const body = (await req.json()) as Body
    if (!body?.sourceGameId) return json(400, { error: "sourceGameId is required" })

    const admin = createClient(URL, SRV)

    // Load source game info
    const { data: g, error: gerr } = await admin
      .from("games")
      .select("id, wake_id, brake_id, format, vgn_version, initial_state")
      .eq("id", body.sourceGameId)
      .single()

    if (gerr) return json(500, { error: gerr.message })
    if (!g) return json(404, { error: "Game not found" })
    if (!g.wake_id || !g.brake_id) return json(400, { error: "Source game missing players" })
    if (!g.initial_state) return json(500, { error: "Source game missing initial_state" })

    // Caller must be a participant
    if (String(g.wake_id) !== String(userId) && String(g.brake_id) !== String(userId)) {
      return json(403, { error: "Not a participant in source game" })
    }

    const opponentId = String(g.wake_id) === String(userId) ? g.brake_id : g.wake_id
    if (!opponentId) return json(500, { error: "Could not determine opponent" })

    // Reuse existing pending rematch invite (either direction)
    const { data: existing, error: exErr } = await admin
      .from("game_invites")
      .select("invite_token, expires_at")
      .eq("invite_type", "rematch")
      .eq("source_game_id", g.id)
      .is("accepted_at", null)
      .is("declined_at", null)
      .or(
        `and(created_by.eq.${userId},invited_user_id.eq.${opponentId}),and(created_by.eq.${opponentId},invited_user_id.eq.${userId})`
      )
      .order("created_at", { ascending: false })
      .maybeSingle()

    if (exErr) return json(500, { error: exErr.message })

    if (existing) {
      const exp = new Date(existing.expires_at).getTime()
      if (Number.isFinite(exp) && exp > Date.now()) {
        return json(200, { inviteToken: existing.invite_token, reused: true })
      }
    }

    const inviteToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

    const { error: insErr } = await admin.from("game_invites").insert({
      invite_token: inviteToken,
      invite_type: "rematch",
      source_game_id: g.id,
      created_by: userId,
      invited_user_id: opponentId,
      invitee_email: null,
      time_control: g.format ?? "standard",
      initial_state: g.initial_state,
      vgn_version: g.vgn_version ?? "1",
      expires_at: expiresAt,
    })

    if (insErr) return json(500, { error: insErr.message })

    return json(200, { inviteToken, reused: false, expiresAt })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})