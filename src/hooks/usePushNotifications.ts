import { useState, useEffect } from "react"
import { supabase } from "../services/supabase"

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  // Check if already subscribed on mount
  useEffect(() => {
    async function check() {
      if (!("serviceWorker" in navigator)) return
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      setSubscribed(!!existing)
    }
    check()
  }, [])

  async function subscribe() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications aren't supported in this browser.")
      return
    }

    setLoading(true)
    try {
      console.log("1. Requesting permission...")
      const result = await Notification.requestPermission()
      setPermission(result)
      console.log("2. Permission result:", result)
      if (result !== "granted") return

      console.log("3. Waiting for SW ready...")
      const reg = await navigator.serviceWorker.ready
      console.log("4. SW ready:", reg)

      console.log("5. Subscribing to push...")
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      console.log("6. Push subscription:", pushSub)

      console.log("7. Getting user...")
      const { data: { user } } = await supabase.auth.getUser()
      console.log("8. User:", user?.id)
      if (!user) return

      console.log("9. Saving to Supabase...")
      await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        subscription: pushSub.toJSON(),
      })
      console.log("10. Done!")

      setSubscribed(true)
    } catch (err) {
      console.error("Push subscription failed:", err)
    } finally {
      setLoading(false)
    }
  }

  async function unsubscribe() {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const pushSub = await reg.pushManager.getSubscription()
      if (pushSub) await pushSub.unsubscribe()

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from("push_subscriptions").delete().eq("user_id", user.id)
      }

      setSubscribed(false)
    } catch (err) {
      console.error("Push unsubscribe failed:", err)
    } finally {
      setLoading(false)
    }
  }

  return { permission, subscribed, loading, subscribe, unsubscribe }
}