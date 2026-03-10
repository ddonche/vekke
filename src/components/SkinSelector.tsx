// src/components/SkinSelector.tsx
import "../styles/skins.css"
import { RouteDomino } from "../RouteDomino"
import { useEffect, useState, useCallback, useMemo } from "react"
import { supabase } from "../services/supabase"
import {
  getPlayerInventory,
  getPlayerLoadout,
  updateLoadoutSlot,
  type Skin,
  type PlayerLoadout,
  DEFAULT_LOADOUT,
  type DominoStyle,
  updateDominoStyle,
} from "../services/skinService"

type Slot = "wake_token_skin_id" | "brake_token_skin_id" | "route_skin_id" | "board_skin_id"

const SLOT_META: Record<Slot, { label: string; type: string; icon: string }> = {
  wake_token_skin_id:  { label: "Wake Token",  type: "token", icon: "W" },
  brake_token_skin_id: { label: "Brake Token", type: "token", icon: "B" },
  route_skin_id:       { label: "Routes",      type: "route", icon: "→" },
  board_skin_id:       { label: "Board",       type: "board", icon: "⊞" },
}

const SLOTS: Slot[] = [
  "wake_token_skin_id",
  "brake_token_skin_id",
  "route_skin_id",
  "board_skin_id",
]

const SKIN_CLASS_MAP: Record<string, string> = {
  "token-default-wake":  "skin-token-default-w",
  "token-default-brake": "skin-token-default-b",
  "route-default":       "skin-route-default",
  "board-grid-default":  "skin-board-default",
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getOrderSkinId(orderId: string, slot: Slot): string | null {
  if (slot === "wake_token_skin_id") return `token-order-${orderId}-wake`
  if (slot === "brake_token_skin_id") return `token-order-${orderId}-brake`
  if (slot === "route_skin_id") return `route-order-${orderId}`
  return null
}

function extractColors(skin: Skin): { primary?: string; secondary?: string } {
  const s: any = (skin as any).style
  if (!s || typeof s !== "object") return {}
  const primary = typeof s.primary_color === "string" ? s.primary_color : undefined
  const secondary = typeof s.secondary_color === "string" ? s.secondary_color : undefined
  return { primary, secondary }
}

// ─── Previews (unchanged logic, only BoardPreview restyled) ───────────────

function TokenPreview({ skinId, size = 48 }: { skinId: string; size?: number }) {
  const cls = SKIN_CLASS_MAP[skinId] ?? "skin-token-default-w"
  return <div className={cls} style={{ width: size, height: size, flexShrink: 0 }} />
}

function StyledTokenPreview({ primary, secondary, size = 48 }: { primary?: string; secondary?: string; size?: number }) {
  const p = primary ?? "#26c6da"
  const s = secondary ?? "#e5e7eb"
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `radial-gradient(circle at 30% 30%, ${s} 0%, ${p} 55%, #0b0b0b 100%)`,
      boxShadow: "0 8px 14px rgba(0,0,0,0.45)",
      border: "1px solid rgba(255,255,255,0.08)",
    }} />
  )
}

function RoutePreview({ skinId, size = 48 }: { skinId: string; size?: number }) {
  const cls = SKIN_CLASS_MAP[skinId] ?? "skin-route-default"
  return (
    <div className={cls} style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ position: "relative", width: size * 0.8, height: 6, borderRadius: 3, background: "var(--route-body, #26c6da)" }}>
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          width: 14, height: 14, borderRadius: "50%",
          background: "var(--route-highlight, #ee484c)",
          boxShadow: "0 0 8px var(--route-highlight, #ee484c)",
        }} />
      </div>
    </div>
  )
}

function StyledRoutePreview({ primary, secondary, size = 48 }: { primary?: string; secondary?: string; size?: number }) {
  const body = primary ?? "#26c6da"
  const highlight = secondary ?? "#ee484c"
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ position: "relative", width: size * 0.8, height: 6, borderRadius: 3, background: body }}>
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          width: 14, height: 14, borderRadius: "50%",
          background: highlight, boxShadow: `0 0 8px ${highlight}`,
        }} />
      </div>
    </div>
  )
}

function BoardPreview({ size = 48 }: { size?: number }) {
  const cellCount = 3
  const cellSize = Math.floor((size - 8) / cellCount)
  return (
    <div style={{
      width: size, height: size, display: "grid", flexShrink: 0,
      gridTemplateColumns: `repeat(${cellCount}, ${cellSize}px)`,
      gap: 2, padding: 4,
      background: "#13131a", borderRadius: 6,
      border: "1px solid rgba(255,255,255,0.07)",
    }}>
      {Array.from({ length: cellCount * cellCount }).map((_, i) => (
        <div key={i} style={{ background: "rgba(184,150,106,0.15)", borderRadius: 2 }} />
      ))}
    </div>
  )
}

function ImagePreview({ url, size = 48 }: { url: string; size?: number }) {
  return (
    <img src={url} alt="" width={size} height={size} draggable={false}
      style={{ width: size, height: size, display: "block", objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))" }}
    />
  )
}

function SkinPreview({ skin, size = 48 }: { skin: Skin; size?: number }) {
  if (skin.image_url) return <ImagePreview url={skin.image_url} size={size} />
  const { primary, secondary } = extractColors(skin)
  if (skin.type === "token") {
    if (SKIN_CLASS_MAP[skin.id]) return <TokenPreview skinId={skin.id} size={size} />
    return <StyledTokenPreview primary={primary} secondary={secondary} size={size} />
  }
  if (skin.type === "route") {
    if (SKIN_CLASS_MAP[skin.id]) return <RoutePreview skinId={skin.id} size={size} />
    return <StyledRoutePreview primary={primary} secondary={secondary} size={size} />
  }
  return <BoardPreview size={size} />
}

// ─── Slot Card ────────────────────────────────────────────────────────────

function SlotCard({ slot, equippedSkin, isSelected, onClick }: {
  slot: Slot; equippedSkin: Skin | null; isSelected: boolean; onClick: () => void
}) {
  const meta = SLOT_META[slot]
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minWidth: 110,
        background: isSelected ? "rgba(93,232,247,0.04)" : "#0f0f14",
        border: isSelected ? "1px solid rgba(93,232,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10, padding: "14px 12px", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        transition: "all 0.15s ease",
        boxShadow: isSelected ? "0 0 18px rgba(93,232,247,0.08)" : "none",
      }}
    >
      {/* Slot label — matches the Cinzel card label size used throughout the site */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: "0.85rem", fontWeight: 600,
        letterSpacing: "0.2em", textTransform: "uppercase",
        color: isSelected ? "#5de8f7" : "#6b6558",
        transition: "color 0.15s",
      }}>
        {meta.label}
      </div>

      {/* Preview thumbnail */}
      <div style={{
        width: 56, height: 56,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8, background: "#0a0a0c",
        border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
      }}>
        {equippedSkin
          ? <SkinPreview skin={equippedSkin} size={44} />
          : <span style={{ fontFamily: "'Cinzel', serif", fontSize: "1.2rem", color: "#3a3830" }}>{meta.icon}</span>
        }
      </div>

      {/* Equipped skin name — EB Garamond italic, same as secondary text throughout */}
      <div style={{
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: "1.05rem", fontStyle: "italic",
        color: equippedSkin ? "#b0aa9e" : "#3a3830",
        textAlign: "center", lineHeight: 1.3,
      }}>
        {equippedSkin?.name ?? "None"}
      </div>
    </button>
  )
}

// ─── Skin Card ────────────────────────────────────────────────────────────

function SkinCard({ skin, isEquipped, onEquip }: { skin: Skin; isEquipped: boolean; onEquip: () => void }) {
  return (
    <button
      onClick={onEquip}
      style={{
        background: isEquipped ? "rgba(93,232,247,0.04)" : "#0f0f14",
        border: isEquipped ? "1px solid rgba(93,232,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10, padding: 16,
        cursor: isEquipped ? "default" : "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        transition: "all 0.15s ease", position: "relative",
        boxShadow: isEquipped ? "0 0 18px rgba(93,232,247,0.08)" : "none",
      }}
    >
      {isEquipped && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(93,232,247,0.15)",
          border: "1px solid rgba(93,232,247,0.4)",
          borderRadius: 3, padding: "2px 7px",
          fontFamily: "'Cinzel', serif",
          fontSize: "0.52rem", fontWeight: 600,
          letterSpacing: "0.2em", textTransform: "uppercase",
          color: "#5de8f7",
        }}>
          Equipped
        </div>
      )}

      {/* Preview */}
      <div style={{
        width: 64, height: 64,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0a0a0c",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 8, overflow: "hidden",
      }}>
        <SkinPreview skin={skin} size={52} />
      </div>

      {/* Skin name — Cinzel at readable size, same as other card titles on the site */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: "1rem", fontWeight: 600,
          letterSpacing: "0.04em",
          color: isEquipped ? "#5de8f7" : "#e8e4d8",
          marginBottom: 4,
        }}>
          {skin.name}
        </div>
        <div style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: "1rem", fontStyle: "italic",
          color: "#6b6558",
          textTransform: "capitalize",
        }}>
          {skin.acquisition_type}
        </div>
      </div>
    </button>
  )
}

// ─── Main SkinSelector ────────────────────────────────────────────────────

export function SkinSelector({
  userId,
  orderId,
  onLoadoutChange,
}: {
  userId: string
  orderId?: string | null
  onLoadoutChange?: () => void
}) {
  const [loadout, setLoadout] = useState<PlayerLoadout | null>(null)
  const [inventory, setInventory] = useState<Skin[]>([])
  const [skinMap, setSkinMap] = useState<Map<string, Skin>>(new Map())
  const [selectedSlot, setSelectedSlot] = useState<Slot>("wake_token_skin_id")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dominoStyle, setDominoStyleState] = useState<DominoStyle>("default")

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [lo, inv] = await Promise.all([
        getPlayerLoadout(userId),
        getPlayerInventory(userId),
      ])
      if (!mounted) return

      setLoadout(lo)
      setDominoStyleState((lo as any).domino_style ?? "default")
      setInventory(inv)

      const m = new Map<string, Skin>()
      inv.forEach(s => m.set(s.id, s))

      if (orderId) {
        const ids = [
          `token-order-${orderId}-wake`,
          `token-order-${orderId}-brake`,
          `route-order-${orderId}`,
        ]
        const { data, error } = await supabase.from("skins").select("*").in("id", ids)
        if (!error) {
          ;(data ?? []).forEach((s: any) => m.set(s.id, s as Skin))

          // If no dedicated route skin exists in DB, synthesize one from the
          // order wake token's colors so the route slot always matches the tokens.
          const routeId = `route-order-${orderId}`
          if (!m.has(routeId)) {
            const wakeSkin = m.get(`token-order-${orderId}-wake`)
            if (wakeSkin) {
              const wStyle: any = (wakeSkin as any).style ?? {}
              m.set(routeId, {
                id: routeId,
                name: wakeSkin.name,
                type: "route",
                acquisition_type: wakeSkin.acquisition_type,
                image_url: null,
                style: {
                  primary_color: wStyle.primary_color,
                  secondary_color: wStyle.secondary_color,
                },
              } as Skin)
            }
          }
        }
      }

      setSkinMap(m)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [userId, orderId])

  useEffect(() => {
    if (!orderId || !loadout) return

    const desiredWake = `token-order-${orderId}-wake`
    const desiredBrake = `token-order-${orderId}-brake`
    const desiredRoute = `route-order-${orderId}`

    // Treat slots as "unset" if they're null OR if they belong to a different order
    const isWandererWake =
      !loadout.wake_token_skin_id ||
      (loadout.wake_token_skin_id.startsWith("token-order-") &&
       !loadout.wake_token_skin_id.startsWith(`token-order-${orderId}-`))
    const isWandererBrake =
      !loadout.brake_token_skin_id ||
      (loadout.brake_token_skin_id.startsWith("token-order-") &&
       !loadout.brake_token_skin_id.startsWith(`token-order-${orderId}-`))
    const isWandererRoute =
      !loadout.route_skin_id ||
      (loadout.route_skin_id.startsWith("route-order-") &&
       loadout.route_skin_id !== `route-order-${orderId}`)

    if (!isWandererWake && !isWandererBrake && !isWandererRoute) return

    let cancelled = false
    ;(async () => {
      setSaving(true)
      try {
        const ops: Array<Promise<any>> = []
        if (isWandererWake) ops.push(updateLoadoutSlot(userId, "wake_token_skin_id", desiredWake))
        if (isWandererBrake) ops.push(updateLoadoutSlot(userId, "brake_token_skin_id", desiredBrake))
        if (isWandererRoute) ops.push(updateLoadoutSlot(userId, "route_skin_id", desiredRoute))
        await Promise.all(ops)
        if (cancelled) return
        setLoadout(prev => prev ? ({
          ...prev,
          ...(isWandererWake ? { wake_token_skin_id: desiredWake } : {}),
          ...(isWandererBrake ? { brake_token_skin_id: desiredBrake } : {}),
          ...(isWandererRoute ? { route_skin_id: desiredRoute } : {}),
        }) : prev)
        onLoadoutChange?.()
      } catch (e) {
        console.error("Failed to apply order defaults:", e)
      } finally {
        if (!cancelled) setSaving(false)
      }
    })()
    return () => { cancelled = true }
  }, [orderId, loadout, userId, onLoadoutChange])

  const equip = useCallback(async (slot: Slot, skinId: string) => {
    if (!loadout) return
    setSaving(true)
    try {
      await updateLoadoutSlot(userId, slot, skinId)
      setLoadout(prev => prev ? { ...prev, [slot]: skinId } : prev)
      onLoadoutChange?.()
    } catch (e) {
      console.error("Failed to equip skin:", e)
    } finally {
      setSaving(false)
    }
  }, [userId, loadout, onLoadoutChange])

  const saveDominoStyle = async (style: DominoStyle) => {
    setDominoStyleState(style)
    try {
      await updateDominoStyle(userId, style)
      onLoadoutChange?.()
    } catch (e) {
      console.error("Failed to update domino style:", e)
    }
  }

  const currentSlotType = SLOT_META[selectedSlot].type

  const skinsByType = useMemo(() => {
    // For token slots, show ALL tokens regardless of wake/brake side —
    // players can pick any token from their inventory for either slot.
    const isTokenSlot = currentSlotType === "token"
    const base = inventory.filter(s =>
      isTokenSlot ? s.type === "token" : s.type === currentSlotType
    )

    if (orderId && isTokenSlot) {
      // Inject both order token skins so either can be equipped to either slot
      const orderSkinIds = [
        `token-order-${orderId}-wake`,
        `token-order-${orderId}-brake`,
      ]
      const toInject = orderSkinIds
        .map(id => skinMap.get(id))
        .filter((s): s is Skin => !!s && !base.some(b => b.id === s.id))
      return [...toInject, ...base]
    }

    if (orderId && !isTokenSlot) {
      const orderSkinId = getOrderSkinId(orderId, selectedSlot)
      if (orderSkinId) {
        const orderSkin = skinMap.get(orderSkinId)
        if (orderSkin && !base.some(s => s.id === orderSkin.id)) {
          return [orderSkin, ...base]
        }
      }
    }

    return base
  }, [inventory, currentSlotType, orderId, selectedSlot, skinMap])

  const equippedSkinForSlot = useCallback((slot: Slot): Skin | null => {
    if (!loadout) return null
    const explicit = (loadout as any)[slot] as string | null | undefined
    if (explicit) return skinMap.get(explicit) ?? null
    if (orderId) {
      const id = getOrderSkinId(orderId, slot)
      if (id) return skinMap.get(id) ?? null
    }
    return null
  }, [loadout, orderId, skinMap])

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 64 }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.72rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "#6b6558" }}>
        Loading inventory...
      </div>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Current Loadout — section label matches ChallengesPage "Active Games" exactly ── */}
      <div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "#b8966a", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          Current Loadout
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {SLOTS.map(slot => (
            <SlotCard
              key={slot}
              slot={slot}
              equippedSkin={equippedSkinForSlot(slot)}
              isSelected={selectedSlot === slot}
              onClick={() => setSelectedSlot(slot)}
            />
          ))}
        </div>
      </div>

      {/* ── Domino Style ── */}
      <div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "#b8966a", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          Domino Style
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(["default", "modern", "notation"] as DominoStyle[]).map(s => {
            const labels: Record<DominoStyle, { label: string; sub: string }> = {
              default:  { label: "Default",  sub: "Arrow · Pips" },
              modern:   { label: "Modern",   sub: "Arrow · Number" },
              notation: { label: "Notation", sub: "Number · Number" },
            }
            const isSelected = dominoStyle === s
            return (
              <button
                key={s}
                onClick={() => saveDominoStyle(s)}
                style={{
                  flex: 1, minWidth: 110,
                  background: isSelected ? "rgba(93,232,247,0.04)" : "#0f0f14",
                  border: isSelected ? "1px solid rgba(93,232,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10, padding: "14px 12px", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? "0 0 18px rgba(93,232,247,0.08)" : "none",
                }}
              >
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: isSelected ? "#5de8f7" : "#6b6558", transition: "color 0.15s" }}>
                  {labels[s].label}
                </div>
                <div style={{ pointerEvents: "none" }}>
                  <RouteDomino dir="E" dist={3} size={52} dominoStyle={s} primaryColor="#26c6da" secondaryColor="#ee484c" />
                </div>
                <div style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: "1rem", fontStyle: "italic", color: "#6b6558", textAlign: "center" }}>
                  {labels[s].sub}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Available Skins ── */}
      <div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "#b8966a", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          {SLOT_META[selectedSlot].label} — Available
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        </div>

        {skinsByType.length === 0 ? (
          <div style={{
            padding: "40px 24px", textAlign: "center",
            border: "1px dashed rgba(255,255,255,0.07)",
            borderRadius: 10,
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: "1.1rem", fontStyle: "italic",
            color: "#b0aa9e",
          }}>
            No {SLOT_META[selectedSlot].label.toLowerCase()} skins available yet.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {skinsByType.map(skin => (
              <SkinCard
                key={skin.id}
                skin={skin}
                isEquipped={(loadout as any)?.[selectedSlot] === skin.id}
                onEquip={() => equip(selectedSlot, skin.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Saving indicator ── */}
      {saving && (
        <div style={{
          fontFamily: "'Cinzel', serif", fontSize: "0.72rem",
          letterSpacing: "0.3em", textTransform: "uppercase",
          color: "#5de8f7", textAlign: "center", opacity: 0.7,
        }}>
          Saving...
        </div>
      )}

    </div>
  )
}
