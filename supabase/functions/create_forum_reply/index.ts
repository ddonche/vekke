import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  topicId: string
  body: string
  images?: string[]
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" })

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
    if (!jwt) return json(401, { error: "Missing bearer token" })

    const URL = Deno.env.get("SUPABASE_URL")!
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!
    const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const SITE_URL = Deno.env.get("SITE_URL")?.trim() || "https://vekke.net"

    if (!URL || !ANON || !SRV) return json(500, { error: "Missing Supabase env vars" })

    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: u, error: uerr } = await userClient.auth.getUser()
    if (uerr || !u?.user) return json(401, { error: "Invalid auth" })
    const replierId = u.user.id

    const body = (await req.json()) as Body

    const topicId = (body?.topicId ?? "").trim()
    const replyBody = (body?.body ?? "").trim()
    const images = Array.isArray(body?.images) ? body.images : []

    if (!topicId || !isUuid(topicId)) return json(400, { error: "topicId is required (uuid)" })
    if (!replyBody) return json(400, { error: "body is required" })

    const admin = createClient(URL, SRV)

    const { data: topic, error: topicErr } = await admin
      .from("forum_topics")
      .select("id, author_id, title, slug, category_id, is_locked, is_deleted")
      .eq("id", topicId)
      .maybeSingle()

    if (topicErr) return json(500, { error: topicErr.message })
    if (!topic) return json(404, { error: "Topic not found" })
    if (topic.is_deleted) return json(400, { error: "Topic is deleted" })
    if (topic.is_locked) return json(400, { error: "Topic is locked" })

    const { data: insertedReply, error: insertErr } = await admin
      .from("forum_replies")
      .insert({
        topic_id: topicId,
        author_id: replierId,
        body: replyBody,
        images,
      })
      .select("id, created_at")
      .single()

    if (insertErr) return json(500, { error: insertErr.message })

    const [{ count, error: countErr }, { data: latestReply, error: latestErr }] = await Promise.all([
      admin
        .from("forum_replies")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", topicId)
        .eq("is_deleted", false),
      admin
        .from("forum_replies")
        .select("created_at")
        .eq("topic_id", topicId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (countErr) return json(500, { error: countErr.message })
    if (latestErr) return json(500, { error: latestErr.message })

    const replyCount = count ?? 0
    const lastReplyAt = latestReply?.created_at ?? null

    const { error: updateErr } = await admin
      .from("forum_topics")
      .update({
        reply_count: replyCount,
        last_reply_at: lastReplyAt,
      })
      .eq("id", topicId)

    if (updateErr) return json(500, { error: updateErr.message })

    try {
      if (topic.author_id !== replierId) {
        const [{ data: replierProfile }, { data: category }] = await Promise.all([
          admin
            .from("profiles")
            .select("username")
            .eq("id", replierId)
            .maybeSingle(),
          admin
            .from("forum_categories")
            .select("slug")
            .eq("id", topic.category_id)
            .maybeSingle(),
        ])

        const replierName = replierProfile?.username?.trim() || "A VEKKE player"
        const categorySlug = category?.slug || "forum"
        const threadUrl = `${SITE_URL}/forum/${categorySlug}/${topic.slug}`

        await fetch(`${URL}/functions/v1/send_email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "forum_reply",
            recipientUserId: topic.author_id,
            replierName,
            threadTitle: topic.title,
            replySnippet: replyBody.slice(0, 220),
            threadUrl,
          }),
        })
      }
    } catch {
      // Do not fail reply creation if the email send fails.
    }

    return json(200, {
      success: true,
      replyId: insertedReply.id,
      createdAt: insertedReply.created_at,
      replyCount,
      lastReplyAt,
    })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})