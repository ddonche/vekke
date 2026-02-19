// src/services/skinService.ts
import { supabase } from "./supabase"

// ---------------------------------------------------------------------------
// Types (mirrors the DB schema)
// ---------------------------------------------------------------------------

export type SkinType = "token" | "route" | "board"

export type AcquisitionType = "default" | "purchase" | "achievement" | "tournament" | "manual"

export type TokenStyle = {
  gradient: string
  boxShadow: string
  previewColor: string
}

export type RouteStyle = {
  highlightColor: string
  bodyColor: string
  previewColor: string
}

export type BoardStyle = {
  boardStyle: "grid" | "intersection"
  theme?: string
}

export type SkinStyle = TokenStyle | RouteStyle | BoardStyle

export type Skin = {
  id: string
  name: string
  type: SkinType
  set_id: string
  acquisition_type: AcquisitionType
  acquisition_meta: Record<string, string> | null
  description: string | null
  style: SkinStyle
  price_coins: number | null
}

export type PlayerLoadout = {
  user_id: string
  wake_token_skin_id: string
  brake_token_skin_id: string
  route_skin_id: string
  board_skin_id: string
}

export type ResolvedLoadout = {
  wakeToken: TokenStyle
  brakeToken: TokenStyle
  route: RouteStyle
  board: BoardStyle
}

// The skin IDs every player starts with — used as fallback
export const DEFAULT_LOADOUT: PlayerLoadout = {
  user_id: "",
  wake_token_skin_id: "token-default-wake",
  brake_token_skin_id: "token-default-brake",
  route_skin_id: "route-default",
  board_skin_id: "board-grid-default",
}


// ---------------------------------------------------------------------------
// Fetch a player's loadout
// ---------------------------------------------------------------------------

export async function getPlayerLoadout(userId: string): Promise<PlayerLoadout> {
  const { data, error } = await supabase
    .from("player_loadout")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    console.warn("Could not load loadout for", userId, "— using defaults")
    return { ...DEFAULT_LOADOUT, user_id: userId }
  }

  return data as PlayerLoadout
}


// ---------------------------------------------------------------------------
// Fetch a skin by ID
// ---------------------------------------------------------------------------

export async function getSkinById(skinId: string): Promise<Skin | null> {
  const { data, error } = await supabase
    .from("skins")
    .select("*")
    .eq("id", skinId)
    .maybeSingle()

  if (error || !data) {
    console.warn("Could not load skin:", skinId)
    return null
  }

  return data as Skin
}


// ---------------------------------------------------------------------------
// Resolve a loadout into actual style objects ready for the renderer
// Falls back to defaults if any skin fails to load
// ---------------------------------------------------------------------------

export async function resolveLoadout(loadout: PlayerLoadout): Promise<ResolvedLoadout> {
  const [wakeToken, brakeToken, route, board] = await Promise.all([
    getSkinById(loadout.wake_token_skin_id),
    getSkinById(loadout.brake_token_skin_id),
    getSkinById(loadout.route_skin_id),
    getSkinById(loadout.board_skin_id),
  ])

  return {
    wakeToken:  (wakeToken?.style  ?? defaultTokenStyle("wake"))  as TokenStyle,
    brakeToken: (brakeToken?.style ?? defaultTokenStyle("brake")) as TokenStyle,
    route:      (route?.style      ?? defaultRouteStyle())        as RouteStyle,
    board:      (board?.style      ?? defaultBoardStyle())        as BoardStyle,
  }
}


// ---------------------------------------------------------------------------
// Fetch and resolve a player's full loadout in one call
// This is what GamePage calls on mount
// ---------------------------------------------------------------------------

export async function getResolvedLoadout(userId: string): Promise<ResolvedLoadout> {
  const loadout = await getPlayerLoadout(userId)
  return resolveLoadout(loadout)
}


// ---------------------------------------------------------------------------
// Update a single loadout slot
// slot: 'wake_token_skin_id' | 'brake_token_skin_id' | 'route_skin_id' | 'board_skin_id'
// ---------------------------------------------------------------------------

export async function updateLoadoutSlot(
  userId: string,
  slot: keyof Omit<PlayerLoadout, "user_id">,
  skinId: string
): Promise<void> {
  const { error } = await supabase
    .from("player_loadout")
    .update({ [slot]: skinId, updated_at: new Date().toISOString() })
    .eq("user_id", userId)

  if (error) throw new Error(`Failed to update loadout slot ${slot}: ${error.message}`)
}


// ---------------------------------------------------------------------------
// Fetch a player's full inventory (all skins they own)
// ---------------------------------------------------------------------------

export async function getPlayerInventory(userId: string): Promise<Skin[]> {
  const { data, error } = await supabase
    .from("player_inventory")
    .select("skin_id, skins(*)")
    .eq("user_id", userId)

  if (error || !data) {
    console.warn("Could not load inventory for", userId)
    return []
  }

  return data.map((row: any) => row.skins as Skin)
}


// ---------------------------------------------------------------------------
// Check if a player owns a specific skin
// ---------------------------------------------------------------------------

export async function playerOwnsSkin(userId: string, skinId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("player_inventory")
    .select("skin_id")
    .eq("user_id", userId)
    .eq("skin_id", skinId)
    .maybeSingle()

  if (error) return false
  return !!data
}


// ---------------------------------------------------------------------------
// Fallback style values (match the seeded defaults)
// Used when a skin fails to load — renderer never crashes
// ---------------------------------------------------------------------------

function defaultTokenStyle(side: "wake" | "brake"): TokenStyle {
  if (side === "wake") return {
    gradient: "radial-gradient(circle at 30% 30%, #ffffff, #d4d4d4 40%, #a3a3a3 65%, #737373)",
    boxShadow: "inset -0.12em -0.12em 0.5em rgba(0,0,0,0.3), inset 0.12em 0.12em 0.5em rgba(255,255,255,0.8), 0 0.3em 0.8em rgba(0,0,0,0.6)",
    previewColor: "#e5e7eb",
  }
  return {
    gradient: "radial-gradient(circle at 30% 30%, #ffffff, #5de8f7 20%, #26c6da 40%, #00acc1 65%, #006064)",
    boxShadow: "inset -0.12em -0.12em 0.5em rgba(0,0,0,0.5), inset 0.12em 0.12em 0.5em rgba(255,255,255,0.6), inset 0 0 1em rgba(0,137,123,0.2), 0 0.3em 0.8em rgba(0,0,0,0.6)",
    previewColor: "#5de8f7",
  }
}

function defaultRouteStyle(): RouteStyle {
  return {
    highlightColor: "#ee484c",
    bodyColor: "#26c6da",
    previewColor: "#26c6da",
  }
}

function defaultBoardStyle(): BoardStyle {
  return { boardStyle: "grid", theme: "default" }
}
