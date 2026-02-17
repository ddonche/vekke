// src/services/pvp.ts
import { supabase } from "./supabase"

export type TimeControlId = "standard" | "rapid" | "blitz" | "daily"

// flip this on/off as needed
const PVP_DEBUG = true

function toMessage(e: unknown) {
  if (!e) return "Unknown error"
  if (typeof e === "string") return e
  if (e instanceof Error) return e.message
  // @ts-expect-error - supabase error shapes vary
  return e.message || e.error_description || e.error || JSON.stringify(e)
}

async function debugAuth(where: string) {
  if (!PVP_DEBUG) return

  const { data: sess, error } = await supabase.auth.getSession()

  // supabase-js has supabaseUrl on the client instance, but it isn't always typed
  const url = (supabase as any)?.supabaseUrl

  console.log(`[PVP][${where}] supabaseUrl =`, url)
  console.log(`[PVP][${where}] session? =`, !!sess.session, "err =", error?.message)

  const tok = sess.session?.access_token
  console.log(`[PVP][${where}] tokenType =`, typeof tok)
  console.log(`[PVP][${where}] tokenPreview =`, tok ? tok.slice(0, 18) : null)
  console.log(`[PVP][${where}] tokenParts =`, tok ? tok.split(".").length : 0)

  if (tok && tok.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(tok.split(".")[1]))
      console.log(`[PVP][${where}] jwt.iss =`, payload.iss)
      console.log(`[PVP][${where}] jwt.aud =`, payload.aud)
      console.log(
        `[PVP][${where}] jwt.exp =`,
        payload.exp ? new Date(payload.exp * 1000).toISOString() : null
      )
    } catch {
      console.log(`[PVP][${where}] failed to decode JWT payload`)
    }
  }
}

async function requireSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(toMessage(error))
  if (!data.session?.access_token) throw new Error("Not signed in (no session)")
  return data.session
}

export async function createInvite(args: {
  inviteeEmail?: string | null
  timeControlId: TimeControlId
  isRanked?: boolean
  initialState: any
}) {
  if (!args?.initialState) throw new Error("createInvite: initialState is required")

  await debugAuth("createInvite:before-requireSession")
  await requireSession()
  await debugAuth("createInvite:before-invoke")

  const { data, error } = await supabase.functions.invoke("create_invite", {
    body: {
      inviteeEmail: args.inviteeEmail ?? null,
      timeControl: args.timeControlId,
      isRanked: !!args.isRanked,
      initialState: args.initialState,
      vgnVersion: "1",
      expiresInDays: 7,
    },
    // DO NOT pass Authorization headers manually.
    // invoke() attaches the current session JWT automatically.
  })

  if (error) throw new Error(toMessage(error))
  return data as { inviteToken: string; expiresAt: string }
}

export async function acceptInvite(inviteToken: string) {
  const t = (inviteToken ?? "").trim()
  if (!t) throw new Error("acceptInvite: inviteToken is required")

  await debugAuth("acceptInvite:before-requireSession")
  await requireSession()
  await debugAuth("acceptInvite:before-invoke")

  const { data, error } = await supabase.functions.invoke("accept_invite", {
    body: { inviteToken: t },
  })

  if (error) throw new Error(toMessage(error))
  return data as { gameId: string }
}
