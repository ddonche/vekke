// src/services/skinService.ts
import { supabase } from "./supabase"

export type SkinType = "token" | "route" | "board"
export type AcquisitionType = "default" | "purchase" | "achievement" | "tournament" | "manual"

export type Skin = {
  id: string
  name: string
  type: SkinType
  set_id: string
  acquisition_type: AcquisitionType
  acquisition_meta: Record<string, string> | null
  description: string | null
  style: { cssClass: string } | Record<string, any>
  price_coins: number | null
  image_url: string | null
}

export type PlayerLoadout = {
  user_id: string
  wake_token_skin_id: string
  brake_token_skin_id: string
  route_skin_id: string
  board_skin_id: string
}

// Resolved loadout — classes + optional image URLs (for PNG skins)
export type ResolvedLoadout = {
  wakeTokenClass: string
  brakeTokenClass: string
  routeClass: string
  boardClass: string

  wakeTokenImageUrl?: string | null
  brakeTokenImageUrl?: string | null
  routeImageUrl?: string | null
  boardImageUrl?: string | null
}

export const DEFAULT_LOADOUT: PlayerLoadout = {
  user_id: "",
  wake_token_skin_id: "token-default-wake",
  brake_token_skin_id: "token-default-brake",
  route_skin_id: "route-default",
  board_skin_id: "board-grid-default",
}

export const DEFAULT_RESOLVED: ResolvedLoadout = {
  wakeTokenClass: "skin-token-default-w",
  brakeTokenClass: "skin-token-default-b",
  routeClass: "skin-route-default",
  boardClass: "skin-board-default",

  wakeTokenImageUrl: null,
  brakeTokenImageUrl: null,
  routeImageUrl: null,
  boardImageUrl: null,
}

const SKIN_CLASS_MAP: Record<string, string> = {
  "token-default-wake":  "skin-token-default-w",
  "token-default-brake": "skin-token-default-b",
  "route-default":       "skin-route-default",
  "board-grid-default":  "skin-board-default",
}

function skinIdToClass(skinId: string, fallback: string): string {
  return SKIN_CLASS_MAP[skinId] ?? fallback
}

export async function getPlayerLoadout(userId: string): Promise<PlayerLoadout> {
  const { data, error } = await supabase
    .from("player_loadout")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return { ...DEFAULT_LOADOUT, user_id: userId }
  return data as PlayerLoadout
}

export async function getSkinById(skinId: string): Promise<Skin | null> {
  const { data, error } = await supabase
    .from("skins")
    .select("*")
    .eq("id", skinId)
    .maybeSingle()

  if (error || !data) return null
  return data as Skin
}

export async function resolveLoadout(loadout: PlayerLoadout): Promise<ResolvedLoadout> {
  const ids = [
    loadout.wake_token_skin_id,
    loadout.brake_token_skin_id,
    loadout.route_skin_id,
    loadout.board_skin_id,
  ].filter(Boolean)

  // Fetch equipped skins in one query so we can detect PNG skins via image_url
  const { data } = await supabase
    .from("skins")
    .select("id, type, image_url")
    .in("id", ids)

  const byId = new Map<string, { id: string; type: SkinType; image_url: string | null }>(
    (data ?? []).map((s: any) => [s.id, { id: s.id, type: s.type as SkinType, image_url: s.image_url ?? null }])
  )

  const wakeSkin = byId.get(loadout.wake_token_skin_id)
  const brakeSkin = byId.get(loadout.brake_token_skin_id)
  const routeSkin = byId.get(loadout.route_skin_id)
  const boardSkin = byId.get(loadout.board_skin_id)

  const wakePngUrl = wakeSkin?.type === "token" ? wakeSkin.image_url : null
  const brakePngUrl = brakeSkin?.type === "token" ? brakeSkin.image_url : null

  return {
    // If image_url exists, use the PNG token classes
    wakeTokenClass: wakePngUrl
      ? "skin-token-png-w"
      : skinIdToClass(loadout.wake_token_skin_id, DEFAULT_RESOLVED.wakeTokenClass),

    brakeTokenClass: brakePngUrl
      ? "skin-token-png-b"
      : skinIdToClass(loadout.brake_token_skin_id, DEFAULT_RESOLVED.brakeTokenClass),

    routeClass: skinIdToClass(loadout.route_skin_id, DEFAULT_RESOLVED.routeClass),
    boardClass: skinIdToClass(loadout.board_skin_id, DEFAULT_RESOLVED.boardClass),

    wakeTokenImageUrl: wakePngUrl,
    brakeTokenImageUrl: brakePngUrl,
    routeImageUrl: routeSkin?.type === "route" ? (routeSkin.image_url ?? null) : null,
    boardImageUrl: boardSkin?.type === "board" ? (boardSkin.image_url ?? null) : null,
  }
}

export async function getResolvedLoadout(userId: string): Promise<ResolvedLoadout> {
  const loadout = await getPlayerLoadout(userId)
  return resolveLoadout(loadout)
}

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

export async function getPlayerInventory(userId: string): Promise<Skin[]> {
  const { data, error } = await supabase
    .from("player_inventory")
    .select("skin_id, skins(*)")
    .eq("user_id", userId)

  if (error || !data) return []
  return data.map((row: any) => row.skins as Skin)
}

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
