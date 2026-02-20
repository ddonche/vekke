import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = { inviteToken: string }

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
    if (!body?.inviteToken) return json(400, { error: "inviteToken is required" })

    const admin = createClient(URL, SRV)

    const { data: inv, error: invErr } = await admin
      .from("game_invites")
      .select("invite_type, invited_user_id, accepted_at, declined_at, expires_at")
      .eq("invite_token", body.inviteToken)
      .maybeSingle()

    if (invErr) return json(500, { error: invErr.message })
    if (!inv) return json(404, { error: "Invite not found" })

    if ((inv.invite_type ?? "pvp") !== "rematch") {
      return json(400, { error: "Not a rematch invite" })
    }

    if (inv.accepted_at || inv.declined_at) {
      return json(409, { error: "Invite already resolved" })
    }

    const exp = new Date(inv.expires_at).getTime()
    if (!Number.isFinite(exp) || exp < Date.now()) return json(410, { error: "Invite expired" })

    if (!inv.invited_user_id) return json(500, { error: "Invite missing invited_user_id" })
    if (String(inv.invited_user_id) !== String(userId)) {
      return json(403, { error: "Not invited user" })
    }

    const { error: updErr } = await admin
      .from("game_invites")
      .update({ declined_by: userId, declined_at: new Date().toISOString() })
      .eq("invite_token", body.inviteToken)

    if (updErr) return json(500, { error: updErr.message })

    return json(200, { ok: true })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})