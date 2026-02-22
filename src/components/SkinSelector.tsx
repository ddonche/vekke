// src/components/SkinSelector.tsx
import "../styles/skins.css"
import { useEffect, useState, useCallback } from "react"
import {
  getPlayerInventory,
  getPlayerLoadout,
  updateLoadoutSlot,
  type Skin,
  type PlayerLoadout,
  DEFAULT_LOADOUT,
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

// ─── Previews ─────────────────────────────────────────────────────────────

function TokenPreview({ skinId, size = 48 }: { skinId: string; size?: number }) {
  const cls = SKIN_CLASS_MAP[skinId] ?? "skin-token-default-w"
  return (
    <div
      className={cls}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
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

function BoardPreview({ size = 48 }: { size?: number }) {
  const cellCount = 3
  const cellSize = Math.floor((size - 8) / cellCount)
  return (
    <div style={{
      width: size, height: size, display: "grid", flexShrink: 0,
      gridTemplateColumns: `repeat(${cellCount}, ${cellSize}px)`,
      gap: 2, padding: 4,
      background: "#374151", borderRadius: 6,
    }}>
      {Array.from({ length: cellCount * cellCount }).map((_, i) => (
        <div key={i} style={{ background: "#6b7280", borderRadius: 2 }} />
      ))}
    </div>
  )
}

function ImagePreview({ url, size = 48 }: { url: string; size?: number }) {
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      draggable={false}
      style={{
        width: size,
        height: size,
        display: "block",
        objectFit: "contain",
        flexShrink: 0,
        // optional: keep it clean and readable on dark UI
        filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))",
      }}
    />
  )
}

function SkinPreview({ skin, size = 48 }: { skin: Skin; size?: number }) {
  if (skin.image_url) return <ImagePreview url={skin.image_url} size={size} />

  if (skin.type === "token") return <TokenPreview skinId={skin.id} size={size} />
  if (skin.type === "route") return <RoutePreview skinId={skin.id} size={size} />
  return <BoardPreview size={size} />
}

// ─── Slot Card ────────────────────────────────────────────────────────────

function SlotCard({
  slot, equippedSkin, isSelected, onClick,
}: {
  slot: Slot; equippedSkin: Skin | null; isSelected: boolean; onClick: () => void
}) {
  const meta = SLOT_META[slot]
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 100,
      background: isSelected ? "linear-gradient(135deg, #0f2027 0%, #1a3a4a 100%)" : "#1a1a1a",
      border: isSelected ? "2px solid #5de8f7" : "2px solid #2d2d2d",
      borderRadius: 12, padding: "14px 12px", cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      transition: "all 0.15s ease",
      boxShadow: isSelected ? "0 0 20px rgba(93,232,247,0.15)" : "none",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#6b7280", textTransform: "uppercase" }}>
        {meta.label}
      </div>
      <div style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "#111", overflow: "hidden" }}>
        {equippedSkin
          ? <SkinPreview skin={equippedSkin} size={44} />
          : <span style={{ color: "#374151", fontSize: 22 }}>{meta.icon}</span>
        }
      </div>
      <div style={{ fontSize: 11, color: equippedSkin ? "#d1d5db" : "#4b5563", textAlign: "center", lineHeight: 1.3 }}>
        {equippedSkin?.name ?? "None"}
      </div>
    </button>
  )
}

// ─── Skin Card ────────────────────────────────────────────────────────────

function SkinCard({ skin, isEquipped, onEquip }: { skin: Skin; isEquipped: boolean; onEquip: () => void }) {
  return (
    <button onClick={onEquip} style={{
      background: isEquipped ? "linear-gradient(135deg, #0f2027, #1a3a4a)" : "#1a1a1a",
      border: isEquipped ? "2px solid #5de8f7" : "2px solid #2d2d2d",
      borderRadius: 12, padding: 16, cursor: isEquipped ? "default" : "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      transition: "all 0.15s ease", position: "relative",
      boxShadow: isEquipped ? "0 0 20px rgba(93,232,247,0.1)" : "none",
    }}>
      {isEquipped && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "#5de8f7", borderRadius: 4, padding: "2px 6px",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#0a0a0a", textTransform: "uppercase",
        }}>Equipped</div>
      )}
      <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", background: "#111", borderRadius: 10, overflow: "hidden" }}>
        <SkinPreview skin={skin} size={52} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", marginBottom: 4 }}>{skin.name}</div>
        <div style={{ fontSize: 11, color: "#6b7280", textTransform: "capitalize" }}>{skin.acquisition_type}</div>
      </div>
    </button>
  )
}

// ─── Main SkinSelector ────────────────────────────────────────────────────

export function SkinSelector({ userId, onLoadoutChange }: { userId: string; onLoadoutChange?: () => void }) {
  const [loadout, setLoadout] = useState<PlayerLoadout | null>(null)
  const [inventory, setInventory] = useState<Skin[]>([])
  const [skinMap, setSkinMap] = useState<Map<string, Skin>>(new Map())
  const [selectedSlot, setSelectedSlot] = useState<Slot>("wake_token_skin_id")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [lo, inv] = await Promise.all([getPlayerLoadout(userId), getPlayerInventory(userId)])
      if (!mounted) return
      setLoadout(lo)
      setInventory(inv)
      const m = new Map<string, Skin>()
      inv.forEach(s => m.set(s.id, s))
      setSkinMap(m)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [userId])

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

  const skinsByType = (type: string) => inventory.filter(s => s.type === type)
  const currentSlotType = SLOT_META[selectedSlot].type

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <div style={{ color: "#6b7280", fontSize: 14 }}>Loading inventory...</div>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#6b7280", textTransform: "uppercase", marginBottom: 12 }}>
          Current Loadout
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {SLOTS.map(slot => (
            <SlotCard
              key={slot} slot={slot}
              equippedSkin={loadout ? (skinMap.get(loadout[slot]) ?? null) : null}
              isSelected={selectedSlot === slot}
              onClick={() => setSelectedSlot(slot)}
            />
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: "#2d2d2d" }} />

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#6b7280", textTransform: "uppercase", marginBottom: 12 }}>
          {SLOT_META[selectedSlot].label} — Your Collection
        </div>
        {skinsByType(currentSlotType).length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", border: "2px dashed #2d2d2d", borderRadius: 12, color: "#4b5563", fontSize: 13 }}>
            No {SLOT_META[selectedSlot].label.toLowerCase()} skins in your collection yet.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
            {skinsByType(currentSlotType).map(skin => (
              <SkinCard key={skin.id} skin={skin}
                isEquipped={loadout?.[selectedSlot] === skin.id}
                onEquip={() => equip(selectedSlot, skin.id)}
              />
            ))}
          </div>
        )}
      </div>

      {saving && (
        <div style={{ fontSize: 12, color: "#5de8f7", textAlign: "center", opacity: 0.8 }}>Saving...</div>
      )}
    </div>
  )
}
