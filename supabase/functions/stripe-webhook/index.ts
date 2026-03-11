import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

// Service role client — needed to write to player_inventory server-side
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
)

serve(async (req) => {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")!
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return new Response("Invalid signature", { status: 400 })
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("Ignored", { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const { user_id, skin_set_id } = session.metadata ?? {}

  if (!user_id || !skin_set_id) {
    console.error("Missing metadata on session:", session.id)
    return new Response("Missing metadata", { status: 400 })
  }

  // Fetch all skins in this set
  const { data: skins, error: skinsError } = await supabase
    .from("skins")
    .select("id")
    .eq("set_id", skin_set_id)

  if (skinsError || !skins || skins.length === 0) {
    console.error("No skins found for set:", skin_set_id, skinsError)
    return new Response("Skins not found", { status: 404 })
  }

  const now = new Date().toISOString()

  const inventoryRows = skins.map((skin: { id: string }) => ({
    user_id,
    skin_id: skin.id,
    granted_at: now,
    granted_by: "stripe",
  }))

  // Upsert — idempotent in case webhook fires twice
  const { error: insertError } = await supabase
    .from("player_inventory")
    .upsert(inventoryRows, { onConflict: "user_id,skin_id", ignoreDuplicates: true })

  if (insertError) {
    console.error("Failed to grant inventory:", insertError)
    return new Response("Inventory insert failed", { status: 500 })
  }

  console.log(`Granted ${skins.length} skins to user ${user_id} for set ${skin_set_id}`)
  return new Response("OK", { status: 200 })
})
