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

    const { period } = await req.json() // "monthly" | "annual"
    if (!period || !["monthly", "annual"].includes(period)) {
      return new Response("Invalid period", { status: 400, headers: corsHeaders })
    }

    // Fetch profile to check current tier and existing customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_tier, stripe_customer_id, username")
      .eq("id", user.id)
      .single()

    if (profile?.account_tier === "pro") {
      return new Response(
        JSON.stringify({ error: "already_pro" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const priceId = period === "monthly"
      ? Deno.env.get("STRIPE_PRO_MONTHLY_PRICE_ID")!
      : Deno.env.get("STRIPE_PRO_ANNUAL_PRICE_ID")!

    if (!priceId) {
      return new Response("Price not configured", { status: 500, headers: corsHeaders })
    }

    const origin = req.headers.get("origin") || "https://vekke.net"

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pro?success=true`,
      cancel_url: `${origin}/pro?cancelled=true`,
      metadata: {
        user_id: user.id,
        period,
      },
    }

    // Reuse existing Stripe customer if we have one
    if (profile?.stripe_customer_id) {
      sessionParams.customer = profile.stripe_customer_id
    } else {
      sessionParams.customer_email = user.email
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("subscription checkout error:", err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
