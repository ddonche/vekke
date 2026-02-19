// src/skins.ts
//
// The Vekke skins catalog.
//
// ACQUISITION TYPES
// -----------------
//   default     → Automatically granted to every new player on signup.
//   purchase    → Available in the shop.
//   achievement → Earned by completing a specific in-game achievement.
//   tournament  → Awarded to participants or winners of a specific tournament.
//
// STRUCTURE
// ---------
//   Sets are the acquisition unit  — you earn/buy a set, which unlocks its members.
//   Skins are the equip unit        — you slot individual skins into Wake, Brake, Route, or Board.
//
// ADDING A NEW SKIN
// -----------------
//   1. Add the skin item(s) to SKIN_CATALOG.
//   2. Add a set entry to SKIN_SETS that references the skin id(s).
//   3. Implement the visual in the appropriate component:
//        Token skins  → add a CSS class in GamePage (or a shared tokens.css)
//        Route skins  → add a color/style variant to RouteIcon
//        Board skins  → add a board variant to GridBoard / IntersectionBoard


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkinType = "token" | "route" | "board"

export type AcquisitionMethod =
  | { type: "default" }
  | { type: "purchase" }
  | { type: "achievement"; achievementId: string; label: string }
  | { type: "tournament"; tournamentId: string; label: string }

export type TokenSkinStyle = {
  /** CSS class name applied to the token div, e.g. "token-teal" */
  cssClass: string
  /** Preview color used in UI (inventory browser, hover tooltip, etc.) */
  previewColor: string
}

export type RouteSkinStyle = {
  /** The tint color passed to <RouteIcon highlightColor={...} /> */
  highlightColor: string
  /** Background/body color of the domino */
  bodyColor: string
  /** Preview color for UI */
  previewColor: string
}

export type BoardSkinStyle = {
  /** Maps to the boardStyle prop: "grid" | "intersection" | future types */
  boardStyle: "grid" | "intersection"
  /** Optional theme variant within a board style (e.g. "dark", "wood", "slate") */
  theme?: string
}

export type SkinStyle = TokenSkinStyle | RouteSkinStyle | BoardSkinStyle

export type SkinItem = {
  id: string
  name: string
  type: SkinType
  setId: string
  acquisition: AcquisitionMethod
  description?: string
  style: SkinStyle
}

export type SkinSet = {
  id: string
  name: string
  description?: string
  acquisition: AcquisitionMethod
  /** Ordered list of skin IDs that belong to this set */
  skinIds: string[]
}

// ---------------------------------------------------------------------------
// Skin Catalog
// ---------------------------------------------------------------------------

export const SKIN_CATALOG: Record<string, SkinItem> = {

  // ── DEFAULT SET ──────────────────────────────────────────────────────────

  "token-default-wake": {
    id: "token-default-wake",
    name: "Wake (White)",
    type: "token",
    setId: "set-default",
    acquisition: { type: "default" },
    description: "The original Wake token. Clean and minimal.",
    style: {
      cssClass: "token-white",
      previewColor: "#e5e7eb",
    },
  },

  "token-default-brake": {
    id: "token-default-brake",
    name: "Brake (Teal)",
    type: "token",
    setId: "set-default",
    acquisition: { type: "default" },
    description: "The original Brake token. Deep teal gloss.",
    style: {
      cssClass: "token-teal",
      previewColor: "#5de8f7",
    },
  },

  "route-default": {
    id: "route-default",
    name: "Route (Default)",
    type: "route",
    setId: "set-default",
    acquisition: { type: "default" },
    description: "Standard teal route markers.",
    style: {
      highlightColor: "#ee484c",
      bodyColor: "#26c6da",
      previewColor: "#26c6da",
    },
  },

  "board-grid-default": {
    id: "board-grid-default",
    name: "Grid Board",
    type: "board",
    setId: "set-default",
    acquisition: { type: "default" },
    description: "The standard grid-style board.",
    style: {
      boardStyle: "grid",
    },
  },

  "board-intersection-default": {
    id: "board-intersection-default",
    name: "Intersection Board",
    type: "board",
    setId: "set-default",
    acquisition: { type: "default" },
    description: "Alternate intersection-style board layout.",
    style: {
      boardStyle: "intersection",
    },
  },

  // ── EMBER SET (purchase) ─────────────────────────────────────────────────
  // Warm red/orange — fiery contrast to the default teal.

  "token-ember-wake": {
    id: "token-ember-wake",
    name: "Ember Wake",
    type: "token",
    setId: "set-ember",
    acquisition: { type: "purchase" },
    description: "Deep crimson with an orange highlight.",
    style: {
      cssClass: "token-ember-wake",
      previewColor: "#f97316",
    },
  },

  "token-ember-brake": {
    id: "token-ember-brake",
    name: "Ember Brake",
    type: "token",
    setId: "set-ember",
    acquisition: { type: "purchase" },
    description: "Burnt sienna with a red core.",
    style: {
      cssClass: "token-ember-brake",
      previewColor: "#dc2626",
    },
  },

  "route-ember": {
    id: "route-ember",
    name: "Ember Route",
    type: "route",
    setId: "set-ember",
    acquisition: { type: "purchase" },
    description: "Warm ember-toned route markers.",
    style: {
      highlightColor: "#f97316",
      bodyColor: "#dc2626",
      previewColor: "#dc2626",
    },
  },

  // ── OBSIDIAN SET (purchase) ───────────────────────────────────────────────
  // Dark, sleek, monochromatic.

  "token-obsidian-wake": {
    id: "token-obsidian-wake",
    name: "Obsidian Wake",
    type: "token",
    setId: "set-obsidian",
    acquisition: { type: "purchase" },
    description: "Polished black with silver sheen.",
    style: {
      cssClass: "token-obsidian-wake",
      previewColor: "#e2e8f0",
    },
  },

  "token-obsidian-brake": {
    id: "token-obsidian-brake",
    name: "Obsidian Brake",
    type: "token",
    setId: "set-obsidian",
    acquisition: { type: "purchase" },
    description: "Deep charcoal with a cold blue tint.",
    style: {
      cssClass: "token-obsidian-brake",
      previewColor: "#475569",
    },
  },

  "route-obsidian": {
    id: "route-obsidian",
    name: "Obsidian Route",
    type: "route",
    setId: "set-obsidian",
    acquisition: { type: "purchase" },
    description: "Matte black route markers with silver edge.",
    style: {
      highlightColor: "#94a3b8",
      bodyColor: "#1e293b",
      previewColor: "#475569",
    },
  },

  // ── GOLD SET (achievement) ────────────────────────────────────────────────
  // Earned by winning 100 ranked games.

  "token-gold-wake": {
    id: "token-gold-wake",
    name: "Gold Wake",
    type: "token",
    setId: "set-gold",
    acquisition: {
      type: "achievement",
      achievementId: "win_100_ranked",
      label: "Win 100 ranked games",
    },
    description: "Burnished gold. Wear it loud.",
    style: {
      cssClass: "token-gold-wake",
      previewColor: "#fbbf24",
    },
  },

  "token-gold-brake": {
    id: "token-gold-brake",
    name: "Gold Brake",
    type: "token",
    setId: "set-gold",
    acquisition: {
      type: "achievement",
      achievementId: "win_100_ranked",
      label: "Win 100 ranked games",
    },
    description: "Deep bronze with gold highlight.",
    style: {
      cssClass: "token-gold-brake",
      previewColor: "#d97706",
    },
  },

  "route-gold": {
    id: "route-gold",
    name: "Gold Route",
    type: "route",
    setId: "set-gold",
    acquisition: {
      type: "achievement",
      achievementId: "win_100_ranked",
      label: "Win 100 ranked games",
    },
    description: "Golden route markers.",
    style: {
      highlightColor: "#fbbf24",
      bodyColor: "#d97706",
      previewColor: "#d97706",
    },
  },

}


// ---------------------------------------------------------------------------
// Set Catalog
// ---------------------------------------------------------------------------

export const SKIN_SETS: Record<string, SkinSet> = {

  "set-default": {
    id: "set-default",
    name: "Default",
    description: "The standard Vekke set. Every player starts with this.",
    acquisition: { type: "default" },
    skinIds: [
      "token-default-wake",
      "token-default-brake",
      "route-default",
      "board-grid-default",
      "board-intersection-default",
    ],
  },

  "set-ember": {
    id: "set-ember",
    name: "Ember",
    description: "A fiery set for players who run hot.",
    acquisition: { type: "purchase" },
    skinIds: ["token-ember-wake", "token-ember-brake", "route-ember"],
  },

  "set-obsidian": {
    id: "set-obsidian",
    name: "Obsidian",
    description: "Cold, sleek, and unreadable.",
    acquisition: { type: "purchase" },
    skinIds: ["token-obsidian-wake", "token-obsidian-brake", "route-obsidian"],
  },

  "set-gold": {
    id: "set-gold",
    name: "Gold",
    description: "For those who've put in the work.",
    acquisition: {
      type: "achievement",
      achievementId: "win_100_ranked",
      label: "Win 100 ranked games",
    },
    skinIds: ["token-gold-wake", "token-gold-brake", "route-gold"],
  },

}


// ---------------------------------------------------------------------------
// Default loadout — what every new player starts with
// ---------------------------------------------------------------------------

export type PlayerLoadout = {
  wakeTokenSkinId: string
  brakeTokenSkinId: string
  routeSkinId: string
  boardSkinId: string
}

export const DEFAULT_LOADOUT: PlayerLoadout = {
  wakeTokenSkinId: "token-default-wake",
  brakeTokenSkinId: "token-default-brake",
  routeSkinId: "route-default",
  boardSkinId: "board-grid-default",
}

/** Skin IDs automatically granted to every new player */
export const DEFAULT_INVENTORY: string[] = SKIN_SETS["set-default"].skinIds


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a skin item by ID, throws if not found (catalog is static, this should never fail) */
export function getSkin(id: string): SkinItem {
  const skin = SKIN_CATALOG[id]
  if (!skin) throw new Error(`Unknown skin id: "${id}"`)
  return skin
}

/** Get the token CSS class for a given skin ID */
export function getTokenClass(skinId: string): string {
  const skin = getSkin(skinId)
  if (skin.type !== "token") throw new Error(`Skin "${skinId}" is not a token skin`)
  return (skin.style as TokenSkinStyle).cssClass
}

/** Get the route style for a given skin ID */
export function getRouteStyle(skinId: string): RouteSkinStyle {
  const skin = getSkin(skinId)
  if (skin.type !== "route") throw new Error(`Skin "${skinId}" is not a route skin`)
  return skin.style as RouteSkinStyle
}

/** Get the board style for a given skin ID */
export function getBoardStyle(skinId: string): BoardSkinStyle {
  const skin = getSkin(skinId)
  if (skin.type !== "board") throw new Error(`Skin "${skinId}" is not a board skin`)
  return skin.style as BoardSkinStyle
}

/** Human-readable acquisition label for use in hover tooltips */
export function getAcquisitionLabel(acquisition: AcquisitionMethod): string {
  switch (acquisition.type) {
    case "default":     return "Free — available to all players"
    case "purchase":    return "Available in the shop"
    case "achievement": return `Earned by: ${acquisition.label}`
    case "tournament":  return `Tournament reward: ${acquisition.label}`
  }
}
