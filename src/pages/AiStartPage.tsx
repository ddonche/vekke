// src/pages/AiStartPage.tsx
import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../services/supabase"
import { newGame } from "../engine/state"

type AiLevel = "novice" | "adept" | "expert" | "master" | "senior_master" | "grandmaster"
type TimeControlId = "standard" | "rapid" | "blitz" | "daily"

async function invokeAuthed<T>(fn: string, body: any): Promise<T> {
  const { data: sess, error: sessErr } = await supabase.auth.getSession()
  if (sessErr) throw sessErr
  const token = sess.session?.access_token
  if (!token) throw new Error("No session token (not logged in)")

  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) throw error
  return data as T
}

export function AiStartPage() {
  const nav = useNavigate()
  const location = useLocation()

  // ✅ FIX: If someone hits "/" with ?openAuth=1&returnTo=..., this is NOT an AI flow.
  // Bounce to /auth which forwards to /auth-host (GamePage) to open auth modal + return.
  useEffect(() => {
    const sp = new URLSearchParams(location.search)
    const wantsAuth =
      sp.get("openAuth") === "1" ||
      sp.get("openAuth") === "true" ||
      sp.get("auth") === "1" ||
      sp.get("auth") === "true"
    const returnTo = sp.get("returnTo")

    if (wantsAuth || returnTo) {
      const rt = returnTo || "/"
      nav(`/auth?openAuth=1&returnTo=${encodeURIComponent(rt)}`, { replace: true })
    }
  }, [location.search, nav])

  const [aiLevel, setAiLevel] = useState<AiLevel>("novice")
  const [timeControl, setTimeControl] = useState<TimeControlId>("standard")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function start() {
    setErr(null)
    setBusy(true)
    try {
      const initialState = newGame()

      const res = await invokeAuthed<{ gameId: string }>("create_ai_game", {
        aiLevel,
        timeControl,
        initialState,
        vgnVersion: "1",
        humanSide: "B",
      })

      nav(`/ai/${res.gameId}`, { replace: true })
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>Play vs Computer</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>AI Level</span>
          <select value={aiLevel} onChange={(e) => setAiLevel(e.target.value as AiLevel)}>
            <option value="novice">Novice</option>
            <option value="adept">Adept</option>
            <option value="expert">Expert</option>
            <option value="master">Master</option>
            <option value="senior_master">Senior Master</option>
            <option value="grandmaster">Grandmaster</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Time Control</span>
          <select value={timeControl} onChange={(e) => setTimeControl(e.target.value as TimeControlId)}>
            <option value="standard">Standard</option>
            <option value="rapid">Rapid</option>
            <option value="blitz">Blitz</option>
            <option value="daily">Daily</option>
          </select>
        </label>
      </div>

      <button onClick={start} disabled={busy} style={{ padding: "10px 14px" }}>
        {busy ? "Creating game..." : "Start"}
      </button>

      {err && <div style={{ marginTop: 12, color: "crimson" }}>{err}</div>}
    </div>
  )
}