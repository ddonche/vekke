import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type AiLevel = "novice" | "adept" | "expert" | "master" | "senior_master" | "grandmaster"
type TimeControlId = "standard" | "rapid" | "blitz" | "daily"

type CreateAiGameBody = {
  aiLevel: AiLevel
  timeControl?: TimeControlId
  initialState: any
  vgnVersion?: string
  // Optional: choose who the human is. Default "B" so human starts (since your games start with turn="B")
  humanSide?: "W" | "B"
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// Keep these in sync with ui_controller.ts
const TIME_CONTROLS: Record<TimeControlId, { baseMs: number; incMs: number }> = {
  standard: { baseMs: 10 * 60_000, incMs: 5_000 },
  rapid: { baseMs: 5 * 60_000, incMs: 3_000 },
  blitz: { baseMs: 3 * 60_000, incMs: 2_000 },
  daily: { baseMs: 24 * 60 * 60_000, incMs: 0 },
}

// Keep these in sync with ui_controller.ts
const AI_UUID: Record<AiLevel, string> = {
  novice: "00000000-0000-4000-8000-000000000600",
  adept: "00000000-0000-4000-8000-000000000900",
  expert: "00000000-0000-4000-8000-000000001200",
  master: "00000000-0000-4000-8000-000000001500",
  senior_master: "00000000-0000-4000-8000-000000001750",
  grandmaster: "00000000-0000-4000-8000-000000002000",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" })

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(401, { error: "Missing bearer token" })

    const URL = Deno.env.get("SUPABASE_URL")!
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
    const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    if (!URL || !ANON || !SRV) return json(500, { error: "Missing Supabase env vars" })

    // Verify caller (same pattern as your invite functions)
    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })

    const userId = u.user.id

    const body = (await req.json()) as CreateAiGameBody
    if (!body?.initialState) return json(400, { error: "initialState is required" })
    if (!body?.aiLevel) return json(400, { error: "aiLevel is required" })

    const aiId = AI_UUID[body.aiLevel]
    if (!aiId) return json(400, { error: "Invalid aiLevel" })

    const tc: TimeControlId = (body.timeControl ?? "standard") as TimeControlId
    const tcDef = TIME_CONTROLS[tc] ?? TIME_CONTROLS.standard

    // Your DB 'turn' uses "W"/"B". Your existing PvP starts with turn="B".
    // To make the human start by default, we default humanSide="B".
    const humanSide: "W" | "B" = body.humanSide ?? "B"

    const wakeId = humanSide === "W" ? userId : aiId
    const brakeId = humanSide === "B" ? userId : aiId

    const nowIso = new Date().toISOString()

    // Service role insert
    const admin = createClient(URL, SRV)

    const { data: gameRow, error: gameErr } = await admin
      .from("games")
      .insert({
        created_by: userId,
        wake_id: wakeId,
        brake_id: brakeId,
        status: "active",
        turn: "B", // keep consistent with your PvP start
        vgn_version: body.vgnVersion ?? "1",
        initial_state: body.initialState,
        current_state: body.initialState,
        format: tc,
        last_move_at: nowIso,
        turn_started_at: nowIso,

        // AI flags (requires the columns we added)
        is_vs_ai: true,
        ai_level: body.aiLevel,
        // retain_until will be auto-set by your trigger; ok to omit
        // retain_until: null,

        // clocks
        clocks_w_ms: tcDef.baseMs,
        clocks_b_ms: tcDef.baseMs,
      })
      .select("id")
      .single()

    if (gameErr) return json(500, { error: gameErr.message })

    return json(200, { gameId: gameRow.id })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})