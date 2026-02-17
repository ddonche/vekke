import { useState } from "react"
import { newGame } from "../engine/state"
import { createInvite } from "../services/pvp"

export function DevInvitePage() {
  const [email, setEmail] = useState("")
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    setBusy(true); setErr(null); setLink(null)
    try {
      const initialState = newGame()
      const r = await createInvite({
        inviteeEmail: email.trim() || null,
        timeControlId: "standard",
        isRanked: false,
        initialState,
      })
      setLink(`${window.location.origin}/invite/${r.inviteToken}`)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Dev: Create PvP Invite</h2>
      <div style={{ marginTop: 8 }}>
        <div>Email lock (optional)</div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
      </div>
      <button onClick={() => { console.log("CLICK"); go() }} disabled={busy} style={{ marginTop: 8 }}>
        Create invite
      </button>
      {err && <div style={{ marginTop: 8, color: "red" }}>{err}</div>}
      {link && (
        <div style={{ marginTop: 12 }}>
          <div>Invite link:</div>
          <pre style={{ userSelect: "all" }}>{link}</pre>
        </div>
      )}
    </div>
  )
}
