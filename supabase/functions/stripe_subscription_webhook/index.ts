import Stripe from "npm:stripe@13.10.0"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
)

Deno.serve(async (req) => {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")!
  const webhookSecret = Deno.env.get("STRIPE_PRO_WEBHOOK_SECRET")!

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
  })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error("Webhook signature failed:", err)
    return new Response("Invalid signature", { status: 400 })
  }

  try {
    switch (event.type) {

      // New subscription created via checkout
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== "subscription") break

        const user_id = session.metadata?.user_id
        const period = session.metadata?.period as "monthly" | "annual" | undefined
        if (!user_id) break

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)

        await supabase
          .from("profiles")
          .update({
            account_tier: "pro",
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            subscription_period: period ?? null,
          })
          .eq("id", user_id)

        console.log(`Pro activated for user ${user_id}, period: ${period}`)
        break
      }

      // Subscription renewed or updated (e.g. plan change)
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription
        if (sub.status !== "active") break

        // Find user by stripe_customer_id
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", sub.customer as string)
          .single()

        if (!profile) break

        await supabase
          .from("profiles")
          .update({
            account_tier: "pro",
            stripe_subscription_id: sub.id,
          })
          .eq("id", profile.id)

        console.log(`Subscription updated for customer ${sub.customer}`)
        break
      }

      // Subscription cancelled or expired
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", sub.customer as string)
          .single()

        if (!profile) break

        await supabase
          .from("profiles")
          .update({
            account_tier: "regular",
            stripe_subscription_id: null,
            subscription_period: null,
          })
          .eq("id", profile.id)

        console.log(`Pro revoked for customer ${sub.customer}`)
        break
      }

      // Payment failed — could downgrade or just log
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        console.warn(`Payment failed for customer ${invoice.customer}`)
        // Stripe will retry — we don't downgrade immediately
        // Subscription deleted event will fire if all retries fail
        break
      }

      default:
        console.log(`Unhandled event: ${event.type}`)
    }
  } catch (err) {
    console.error("Webhook handler error:", err)
    return new Response("Handler error", { status: 500 })
  }

  return new Response("OK", { status: 200 })
})
