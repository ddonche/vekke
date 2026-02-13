// games.ts (MVP)
export async function saveGameLog(args: {
  userId: string
  mode: "ai" | "pvp"
  isRanked: boolean
  aiLevel?: string
  timeControlId: "standard" | "rapid" | "blitz" | "daily"
  endedAt: string
  vgn: string
}) { /* insert row */ }

export async function listRecentGames(args: { userId: string; limit?: number }) {
  /* select rows for profile/activity feed later */
}
