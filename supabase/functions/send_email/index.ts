// supabase/functions/send_email/index.ts

import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type EmailType =
  | "turn"
  | "challenge_received"
  | "forum_reply"
  | "announcement"

interface EmailRequest {
  type: EmailType
  recipientUserId: string

  opponentName?: string
  gameUrl?: string

  challengerName?: string
  challengeUrl?: string
  timeControlLabel?: string

  replierName?: string
  threadTitle?: string
  replySnippet?: string
  threadUrl?: string

  subject?: string
  text?: string
  html?: string
}

const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY")!
const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN")!
const MAILGUN_REGION = Deno.env.get("MAILGUN_REGION") || "US"
const FROM_EMAIL = Deno.env.get("MAILGUN_FROM_EMAIL")!
const FROM_NAME = Deno.env.get("MAILGUN_FROM_NAME") || "VEKKE Team"
const SITE_URL = Deno.env.get("SITE_URL")?.trim() || "https://vekke.net"

const MAILGUN_BASE =
  MAILGUN_REGION === "EU"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net"

serve(async (req) => {
  try {
    const payload: EmailRequest = await req.json()

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(`
        username,
        email_pause_all,
        email_turn_notifications,
        email_challenge_received,
        email_challenge_accepted,
        email_tournament_updates,
        email_forum_thread_replies,
        email_followed_thread_replies,
        email_major_announcements
      `)
      .eq("id", payload.recipientUserId)
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404 })
    }

    if (profile.email_pause_all) {
      return new Response(JSON.stringify({ skipped: "email paused" }), { status: 200 })
    }

    if (payload.type === "turn" && !profile.email_turn_notifications) {
      return new Response(JSON.stringify({ skipped: "turn email disabled" }), { status: 200 })
    }

    if (payload.type === "challenge_received" && !profile.email_challenge_received) {
      return new Response(JSON.stringify({ skipped: "challenge email disabled" }), { status: 200 })
    }

    if (payload.type === "forum_reply" && !profile.email_forum_thread_replies) {
      return new Response(JSON.stringify({ skipped: "forum email disabled" }), { status: 200 })
    }

    if (payload.type === "announcement" && !profile.email_major_announcements) {
      return new Response(JSON.stringify({ skipped: "announcement email disabled" }), { status: 200 })
    }

    const { data: user } = await supabase.auth.admin.getUserById(payload.recipientUserId)
    const recipientEmail = user?.user?.email

    if (!recipientEmail) {
      return new Response(JSON.stringify({ skipped: "no email address" }), { status: 200 })
    }

    let subject = ""
    let text = ""
    let html = ""

    switch (payload.type) {
      case "turn":
        subject = "Your move in VEKKE"

        text = `${payload.opponentName} made a move in your Daily game on VEKKE.

Open your game:
${payload.gameUrl}

Getting too many emails?
Many players prefer push notifications instead. You can disable email and enable push in your profile.`

        html = `
<p><strong>${payload.opponentName}</strong> made a move in your Daily game on <strong>VEKKE</strong>.</p>

<p>
  <a href="${payload.gameUrl}" style="
    display:inline-block;
    background:#2563eb;
    color:#ffffff;
    padding:10px 16px;
    text-decoration:none;
    border-radius:6px;
    font-weight:600;
  ">Open Game</a>
</p>

<p style="color:#777;font-size:0.95em">
Getting too many emails? Many players prefer push notifications instead. You can disable email and enable push in your profile.
</p>
`
        break

      case "challenge_received": {
        const challengerName = payload.challengerName || "A VEKKE player"
        const formatLabel = payload.timeControlLabel || "Daily"
        const challengeUrl = payload.challengeUrl || `${SITE_URL}/challenges`

        subject = `${challengerName} challenged you on VEKKE`

        text = `${challengerName} has challenged you to a ${formatLabel} match on VEKKE.

You can accept or decline the challenge using the link below.

${challengeUrl}

If you accept, ${challengerName} will be notified and the game will start once they confirm.

-----
You can challenge other players anywhere you see the "Challenge" button next to their user info.

Manage email preferences:
${SITE_URL}`

        html = `
<p><strong>${challengerName}</strong> has challenged you to a <strong>${formatLabel}</strong> match on <strong>VEKKE</strong>.</p>

<p>You can accept or decline the challenge using the link below.</p>

<p>
  <a href="${challengeUrl}" style="
    display:inline-block;
    background:#2563eb;
    color:#ffffff;
    padding:10px 16px;
    text-decoration:none;
    border-radius:6px;
    font-weight:600;
  ">View Challenge</a>
</p>

<p>If you accept, <strong>${challengerName}</strong> will be notified and the game will start once they confirm.</p>

<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />

<p style="color:#777;font-size:0.95em">
You can challenge other players anywhere you see the <strong>Challenge</strong> button next to their user info.
</p>

<p style="color:#777;font-size:0.95em">
Manage email preferences:
<a href="${SITE_URL}" style="color:#2563eb;text-decoration:none;">${SITE_URL}</a>
</p>
`
        break
      }

        case "forum_reply":
          subject = `New reply in "${payload.threadTitle}"`

          text = `${payload.replierName} replied to your thread on VEKKE.

  Thread: ${payload.threadTitle}

  Preview:
  "${payload.replySnippet}"

  Open discussion:
  ${payload.threadUrl}`

          html = `
  <p><strong>${payload.replierName}</strong> replied to your thread on <strong>VEKKE</strong>.</p>

  <p><strong>Thread:</strong> ${payload.threadTitle}</p>

  <p><strong>Preview:</strong></p>
  <blockquote style="margin:12px 0;padding-left:12px;border-left:3px solid #ddd;color:#444;">
    ${payload.replySnippet}
  </blockquote>

  <p>
    <a href="${payload.threadUrl}" style="
      display:inline-block;
      background:#2563eb;
      color:#ffffff;
      padding:10px 16px;
      text-decoration:none;
      border-radius:6px;
      font-weight:600;
    ">Open Discussion</a>
  </p>
  `
          break

      case "announcement":
        subject = payload.subject ?? "VEKKE Announcement"
        text = payload.text ?? ""
        html = payload.html ?? ""
        break
    }

    const form = new FormData()
    form.append("from", "VEKKE Team <noreply@vekke.net>")
    form.append("h:Reply-To", FROM_EMAIL)
    form.append("to", recipientEmail)
    form.append("subject", subject)
    form.append("text", text)

    if (html) form.append("html", html)

    const res = await fetch(
      `${MAILGUN_BASE}/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`api:${MAILGUN_API_KEY}`)
        },
        body: form
      }
    )

    if (!res.ok) {
      const msg = await res.text()
      return new Response(JSON.stringify({ error: msg }), { status: 500 })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})