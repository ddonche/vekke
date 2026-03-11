import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "npm:stripe@13.10.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    })

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const { skin_set_id } = await req.json()
    if (!skin_set_id) return new Response("Missing skin_set_id", { status: 400, headers: corsHeaders })

    const { data: skinSet, error: setError } = await supabase
      .from("skin_sets")
      .select("*")
      .eq("id", skin_set_id)
      .eq("acquisition_type", "purchase")
      .single()

    if (setError || !skinSet) return new Response("Skin set not found", { status: 404, headers: corsHeaders })

    const stripePrice = Deno.env.get("STRIPE_PRICE_ID")
    if (!stripePrice) return new Response("STRIPE_PRICE_ID not configured", { status: 500, headers: corsHeaders })

    // Check ownership
    const { data: skins } = await supabase
      .from("skins")
      .select("id")
      .eq("set_id", skin_set_id)

    if (skins && skins.length > 0) {
      const skinIds = skins.map((s: any) => s.id)
      const { data: existing } = await supabase
        .from("player_inventory")
        .select("skin_id")
        .eq("user_id", user.id)
        .in("skin_id", skinIds)
        .limit(1)

      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ error: "already_owned" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
    }

    const origin = req.headers.get("origin") || "https://vekke.net"

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: stripePrice, quantity: 1 }],
      success_url: `${origin}/marketplace?success=true&set=${skin_set_id}`,
      cancel_url: `${origin}/marketplace?cancelled=true`,
      metadata: {
        user_id: user.id,
        skin_set_id: skin_set_id,
      },
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("checkout error:", err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
