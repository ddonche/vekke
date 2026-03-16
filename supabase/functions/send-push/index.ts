import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push"

webpush.setVapidDetails(
  Deno.env.get("VAPID_MAILTO")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
)

serve(async (req) => {
  try {
    const { user_id, title, body, url } = await req.json()

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", user_id)
      .single()

    if (error || !data) {
      return new Response(JSON.stringify({ error: "No subscription found" }), { status: 404 })
    }

    const payload = JSON.stringify({ title, body, url })

    try {
      await webpush.sendNotification(data.subscription, payload)
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    } catch (pushError: any) {
      // Subscription expired or revoked — clean it up
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user_id)
        return new Response(JSON.stringify({ error: "Subscription expired, removed" }), { status: 410 })
      }
      throw pushError
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})