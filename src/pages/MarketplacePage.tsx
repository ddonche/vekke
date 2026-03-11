import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import { Header } from "../components/Header"

interface SkinSet {
  id: string
  name: string
  description: string
  acquisition_type: string
  acquisition_meta: { stripe_price_id?: string } | null
  price_coins: number | null
  category: string | null
  created_at: string
}

interface SkinPreview {
  id: string
  name: string
  type: string
  style: Record<string, any>
  image_url: string | null
}

type OwnershipMap = Record<string, boolean>

export default function MarketplacePage() {
  const [sets, setSets] = useState<SkinSet[]>([])
  const [skinsBySet, setSkinsBySet] = useState<Record<string, SkinPreview[]>>({})
  const [owned, setOwned] = useState<OwnershipMap>({})
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<any | null>(null)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("success") === "true") {
      showToast("Purchase complete! Your skins have been added to your inventory.", "success")
      window.history.replaceState({}, "", window.location.pathname)
    }
    if (params.get("cancelled") === "true") {
      showToast("Purchase cancelled.", "error")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id,username,avatar_url")
          .eq("id", user.id)
          .maybeSingle()
        setMe(profile ?? null)
      }

      // Fetch purchasable skin sets
      const { data: fetchedSets } = await supabase
        .from("skin_sets")
        .select("*")
        .eq("acquisition_type", "purchase")
        .order("created_at", { ascending: true })

      if (!fetchedSets || fetchedSets.length === 0) {
        setLoading(false)
        return
      }

      setSets(fetchedSets)

      // Fetch all skins for these sets
      const setIds = fetchedSets.map((s: SkinSet) => s.id)
      const { data: allSkins } = await supabase
        .from("skins")
        .select("id, name, type, style, image_url, set_id")
        .in("set_id", setIds)

      if (allSkins) {
        const grouped: Record<string, SkinPreview[]> = {}
        for (const skin of allSkins) {
          if (!grouped[skin.set_id]) grouped[skin.set_id] = []
          grouped[skin.set_id].push(skin)
        }
        setSkinsBySet(grouped)

        // Check ownership
        if (user) {
          const allSkinIds = allSkins.map((s: any) => s.id)
          const { data: inventory } = await supabase
            .from("player_inventory")
            .select("skin_id")
            .eq("user_id", user.id)
            .in("skin_id", allSkinIds)

          if (inventory) {
            const ownedMap: OwnershipMap = {}
            for (const row of inventory) {
              ownedMap[row.skin_id] = true
            }
            setOwned(ownedMap)
          }
        }
      }

      setLoading(false)
    }

    init()
  }, [])

  const isSetOwned = (setId: string) => {
    const skins = skinsBySet[setId]
    if (!skins || skins.length === 0) return false
    return skins.some((s) => owned[s.id])
  }

  const handlePurchase = async (set: SkinSet) => {
    if (!userId) {
      showToast("You must be signed in to purchase.", "error")
      return
    }

    setPurchasing(set.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Not authenticated")

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ skin_set_id: set.id }),
        }
      )

      const data = await res.json()

      if (res.status === 409) {
        showToast("You already own this skin set.", "error")
        return
      }
      if (!res.ok) throw new Error(data.error || "Checkout failed")

      window.location.href = data.url
    } catch (err: any) {
      showToast(err.message || "Something went wrong.", "error")
    } finally {
      setPurchasing(null)
    }
  }

  const formatPrice = (_set: SkinSet) => "$1.99"

  const availableCategories = Array.from(
    new Set(sets.map(s => s.category).filter(Boolean))
  ).sort() as string[]

  const filteredSets = activeCategory
    ? sets.filter(s => s.category === activeCategory)
    : sets

  return (
    <div className="marketplace-page">
      {/* Toast */}
      {toast && (
        <div className={`marketplace-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <Header
        isLoggedIn={!!userId}
        userId={userId ?? undefined}
        username={me?.username ?? undefined}
        avatarUrl={me?.avatar_url ?? null}
        activePage="marketplace"
      />

      <div className="marketplace-scroll">
        <header className="marketplace-hero">
          <h1 className="marketplace-title">Shop</h1>
          <p className="marketplace-subtitle">Adorn your pieces. Leave your mark.</p>
        </header>

        <div className="marketplace-body">
          {/* Category sidebar */}
          {!loading && availableCategories.length > 0 && (
            <aside className="marketplace-sidebar">
              <div className="sidebar-label">Categories</div>
              <nav className="sidebar-nav">
                <button
                  className={`sidebar-item ${activeCategory === null ? "active" : ""}`}
                  onClick={() => setActiveCategory(null)}
                >
                  All
                  <span className="sidebar-count">{sets.length}</span>
                </button>
                {availableCategories.map(cat => (
                  <button
                    key={cat}
                    className={`sidebar-item ${activeCategory === cat ? "active" : ""}`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat}
                    <span className="sidebar-count">{sets.filter(s => s.category === cat).length}</span>
                  </button>
                ))}
              </nav>
            </aside>
          )}

          {/* Mobile category pills */}
          {!loading && availableCategories.length > 0 && (
            <div className="marketplace-pills">
              <button
                className={`pill ${activeCategory === null ? "active" : ""}`}
                onClick={() => setActiveCategory(null)}
              >All</button>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  className={`pill ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >{cat}</button>
              ))}
            </div>
          )}

          <main className="marketplace-content">
          {loading ? (
            <div className="marketplace-loading">
              <span className="loading-glyph">⬡</span>
            </div>
          ) : filteredSets.length === 0 ? (
            <div className="marketplace-empty">
              <p>{sets.length === 0 ? "No items available yet. Check back soon." : "No items in this category."}</p>
            </div>
          ) : (
            <div className="skin-set-grid">
              {filteredSets.map((set) => {
                const skins = skinsBySet[set.id] ?? []
                const alreadyOwned = isSetOwned(set.id)
                const isPurchasing = purchasing === set.id

                return (
                  <article key={set.id} className={`skin-set-card ${alreadyOwned ? "owned" : ""}`}>
                    <div className="skin-set-card-header">
                      <div className="skin-set-badge">{set.category ?? "Skin Set"}</div>
                      {alreadyOwned && <div className="owned-badge">Owned</div>}
                    </div>

                    {/* Images — prominent */}
                    {skins.length > 0 && (
                      <div className="skin-previews">
                        {skins.map((skin) => (
                          <div key={skin.id} className="skin-chip">
                            {skin.image_url ? (
                              <img src={skin.image_url} alt={skin.name} className="skin-chip-img" />
                            ) : (
                              <div className="skin-chip-swatch" style={buildSwatchStyle(skin.style)} />
                            )}
                            <span className="skin-chip-name">{skin.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Set name — secondary */}
                    <h2 className="skin-set-name">{set.name}</h2>
                    {set.description && (
                      <p className="skin-set-description">{set.description}</p>
                    )}

                    <div className="skin-set-footer">
                      <span className="skin-set-price">{formatPrice(set)}</span>
                      <button
                        className={`buy-btn ${alreadyOwned ? "owned" : ""} ${isPurchasing ? "loading" : ""}`}
                        onClick={() => handlePurchase(set)}
                        disabled={alreadyOwned || isPurchasing || !userId}
                      >
                        {alreadyOwned
                          ? "In Inventory"
                          : isPurchasing
                          ? "Redirecting…"
                          : !userId
                          ? "Sign In to Buy"
                          : "Purchase"}
                      </button>
                    </div>
                  </article>
                )
            })}
          </div>
        )}
      </main>
        </div>
      </div>

      <style>{`
        .marketplace-page {
          width: 100%;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          background-color: #0d0d0d;
          color: #e8dcc8;
          font-family: 'EB Garamond', Georgia, serif;
          overflow: hidden;
        }

        .marketplace-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .marketplace-toast {
          position: fixed;
          top: calc(56px + 1rem);
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          padding: 0.75rem 1.5rem;
          border-radius: 2px;
          font-family: 'Cinzel', serif;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          white-space: nowrap;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
          animation: toastIn 0.25s ease;
        }
        .marketplace-toast.success {
          background: #1a2a1a;
          border: 1px solid #4a7a4a;
          color: #8fcf8f;
        }
        .marketplace-toast.error {
          background: #2a1a1a;
          border: 1px solid #7a3a3a;
          color: #cf8f8f;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        .marketplace-hero {
          border-bottom: 1px solid #2a2218;
          padding: 3rem 2rem 2.5rem;
          text-align: center;
          background: linear-gradient(180deg, #0d0b08 0%, #0d0d0d 100%);
        }

        .marketplace-body {
          display: flex;
          align-items: flex-start;
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
          padding: 2rem 1.5rem;
          gap: 2rem;
          box-sizing: border-box;
        }

        .marketplace-sidebar {
          width: 180px;
          flex-shrink: 0;
          position: sticky;
          top: 1.5rem;
        }

        .sidebar-label {
          font-family: 'Cinzel', serif;
          font-size: 0.7rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #b8966a;
          margin-bottom: 0.75rem;
          padding-left: 0.5rem;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .sidebar-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.5rem 0.6rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 3px;
          font-family: 'Cinzel', serif;
          font-size: 0.85rem;
          letter-spacing: 0.04em;
          color: #b0aa9e;
          cursor: pointer;
          text-align: left;
          transition: all 0.12s ease;
        }
        .sidebar-item:hover {
          color: #e8e4d8;
          background: rgba(184,150,106,0.05);
        }
        .sidebar-item.active {
          color: #d4af7a;
          background: rgba(184,150,106,0.08);
          border-color: rgba(184,150,106,0.2);
        }

        .sidebar-count {
          font-size: 0.6rem;
          color: #6b6558;
          font-family: monospace;
        }
        .sidebar-item.active .sidebar-count {
          color: #b8966a;
        }

        .marketplace-pills {
          display: none;
          gap: 6px;
          overflow-x: auto;
          padding: 1rem 1.5rem 0;
          scrollbar-width: none;
        }
        .marketplace-pills::-webkit-scrollbar { display: none; }

        .pill {
          flex-shrink: 0;
          padding: 0.4rem 0.9rem;
          background: transparent;
          border: 1px solid #2a2218;
          border-radius: 99px;
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.08em;
          color: #7a6a56;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
        }
        .pill:hover { color: #b8a88a; border-color: #4a3c2a; }
        .pill.active { color: #d4b896; border-color: rgba(184,150,106,0.4); background: rgba(184,150,106,0.08); }

        @media (max-width: 768px) {
          .marketplace-sidebar { display: none; }
          .marketplace-pills { display: flex; }
          .marketplace-body { padding: 1rem 0; gap: 0; }
          .marketplace-content { padding: 1rem 1rem 2rem; }
        }
        .marketplace-title {
          font-family: 'Cinzel', 'Times New Roman', serif;
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 400;
          letter-spacing: 0.15em;
          color: #e8e4d8;
          margin: 0 0 0.5rem;
          text-transform: uppercase;
        }
        .marketplace-subtitle {
          font-family: 'EB Garamond', Georgia, serif;
          font-style: italic;
          color: #b0aa9e;
          font-size: 1.05rem;
          margin: 0;
        }

        .marketplace-content {
          flex: 1;
          min-width: 0;
        }

        .marketplace-loading {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 6rem 0;
        }
        .loading-glyph {
          font-size: 2.5rem;
          color: #4a3c2a;
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        .marketplace-empty {
          text-align: center;
          padding: 4rem 0;
          color: #5a4a36;
          font-style: italic;
        }

        .skin-set-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 1.5rem;
        }

        .skin-set-card {
          background: #111009;
          border: 1px solid #2a2218;
          padding: 1.75rem;
          position: relative;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .skin-set-card:not(.owned):hover {
          border-color: #5a4a2e;
          box-shadow: 0 0 24px rgba(90, 70, 30, 0.12);
        }
        .skin-set-card.owned {
          opacity: 0.65;
        }

        .skin-set-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .skin-set-badge {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #b0aa9e;
          border: 1px solid rgba(184,150,106,0.25);
          padding: 0.2rem 0.6rem;
        }
        .owned-badge {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #4a7a4a;
          border: 1px solid #2a4a2a;
          padding: 0.2rem 0.6rem;
        }

        .skin-set-name {
          font-family: 'Cinzel', serif;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: #b0aa9e;
          margin: 0 0 0.3rem;
          text-transform: uppercase;
        }
        .skin-set-description {
          font-size: 0.88rem;
          color: #9a9080;
          font-style: italic;
          margin: 0 0 0.75rem;
          line-height: 1.5;
        }

        .skin-previews {
          display: flex;
          flex-direction: row;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .skin-chip {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
        }
        .skin-chip-img {
          width: 100%;
          aspect-ratio: 1;
          object-fit: contain;
          border-radius: 4px;
          background: #0a0908;
        }
        .skin-chip-swatch {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 4px;
          background: #2a2218;
        }
        .skin-chip-name {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.08em;
          color: #b0aa9e;
          text-align: center;
          text-transform: uppercase;
        }

        .skin-set-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-top: 1px solid #1e1c14;
          padding-top: 1.25rem;
          margin-top: 0.25rem;
        }
        .skin-set-price {
          font-family: 'Cinzel', serif;
          font-size: 1.1rem;
          letter-spacing: 0.06em;
          color: #e8e4d8;
        }

        .buy-btn {
          font-family: 'Cinzel', serif;
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 0.6rem 1.4rem;
          background: transparent;
          border: 1px solid #8a7050;
          color: #d4b896;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .buy-btn:hover:not(:disabled) {
          background: #8a7050;
          color: #0d0d0d;
        }
        .buy-btn.owned,
        .buy-btn:disabled {
          border-color: #2a2218;
          color: #4a3c2a;
          cursor: default;
          background: transparent;
        }
        .buy-btn.loading {
          opacity: 0.6;
        }
      `}</style>
    </div>
  )
}

function buildSwatchStyle(style: Record<string, any>): React.CSSProperties {
  if (!style) return { background: "#2a2218" }
  // Try to pull a background or primary color out of the style JSON
  const bg = style.background || style.backgroundColor || style.color || style.primary || "#2a2218"
  return { background: bg }
}
