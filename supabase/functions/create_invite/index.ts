// supabase/functions/create_invite/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type CreateInviteBody = {
  inviteeEmail?: string | null
  timeControl?: string // "standard" | "rapid" | "blitz" | "daily"
  isRanked?: boolean
  initialState: any
  vgnVersion?: string
  expiresInDays?: number
}

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "http://localhost:5173"
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) })
  }

  try {
    if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" })

    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      ""

    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(req, 401, { error: "Missing bearer token" })

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(req, 500, { error: "Missing Supabase env vars" })
    }

    // Verify caller (works even if verify_jwt is disabled at the gateway)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json(req, 401, { error: "Invalid auth" })

    const userId = userData.user.id
    const userEmail = userData.user.email ?? null

    const body = (await req.json()) as CreateInviteBody
    if (!body?.initialState) return json(req, 400, { error: "initialState is required" })

    const inviteToken = crypto.randomUUID()
    const days = Math.max(1, Math.min(30, body.expiresInDays ?? 7))
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    // Service role insert
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { error: insErr } = await admin.from("game_invites").insert({
      created_by: userId,
      invite_token: inviteToken,
      invitee_email: body.inviteeEmail ?? null,
      time_control: body.timeControl ?? "standard",
      is_ranked: body.isRanked ?? false,
      expires_at: expiresAt,
      initial_state: body.initialState,
      vgn_version: body.vgnVersion ?? "1",
    })

    if (insErr) return json(req, 500, { error: insErr.message })

    return json(req, 200, {
      inviteToken,
      createdBy: userId,
      createdByEmail: userEmail,
      expiresAt,
    })
  } catch (e) {
    return json(req, 500, { error: String(e) })
  }
})
