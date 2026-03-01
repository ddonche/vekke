/**
 * vekke-header.js
 * Self-contained Web Component for the Vekke site header.
 * Drop into any HTML page:
 *   <script src="https://vekke.net/vekke-header.js"></script>
 *   <vekke-header base-url="https://vekke.net"></vekke-header>
 *
 * Attributes:
 *   base-url        Root URL of the Vekke app (default: http://localhost:5173)
 *   active-page     One of: play, mygames, leaderboard, orders, rules, tutorial
 *   supabase-url    Your Supabase project URL
 *   supabase-key    Your Supabase anon key
 */

(function () {
  // ── Inject Cinzel font once per page ──────────────────────────────────────
  if (!document.getElementById('vekke-fonts')) {
    const link = document.createElement('link')
    link.id = 'vekke-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap'
    document.head.appendChild(link)
  }

  const STYLES = `
    :host {
      display: block;
      width: 100%;
      font-family: 'Cinzel', serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .vekke-header {
      position: sticky;
      top: 0;
      z-index: 1000;
      width: 100%;
      background: rgba(10, 10, 12, 0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(184,150,106,0.15);
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
    }
    .vekke-header-inner {
      max-width: 1280px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 24px;
      height: 56px;
    }
    .vekke-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      flex-shrink: 0;
      text-decoration: none;
    }
    .vekke-logo img {
      width: 40px;
      height: 40px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .vekke-logo-text { line-height: 1.05; }
    .vekke-logo-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #e8e4d8;
    }
    .vekke-logo-sub {
      font-size: 9px;
      opacity: 0.65;
      letter-spacing: 0.3em;
      color: #b8966a;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .vekke-nav {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .nav-item {
      position: relative;
      background: transparent;
      border: 1px solid transparent;
      color: #b0aa9e;
      font-family: 'Cinzel', serif;
      font-weight: 600;
      cursor: pointer;
      padding: 7px 12px;
      border-radius: 4px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      white-space: nowrap;
      transition: all 0.12s ease;
      display: flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .nav-item:hover {
      background: rgba(255,255,255,0.05);
      color: #e8e4d8;
    }
    .nav-item.active {
      background: rgba(184,150,106,0.10);
      border-color: rgba(184,150,106,0.30);
      color: #d4af7a;
    }
    .nav-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      border-radius: 999px;
      background: #ee484c;
      color: #fff;
      font-size: 10px;
      font-weight: 900;
      padding: 0 4px;
      line-height: 1;
    }
    .vekke-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .online-indicator {
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #6b6558;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .online-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #34d399;
      display: inline-block;
      box-shadow: 0 0 6px #34d399;
    }

    /* User area */
    .user-btn {
      display: flex;
      gap: 9px;
      align-items: center;
      padding: 6px 10px;
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.10);
      color: #e8e4d8;
      cursor: pointer;
      transition: background 0.12s;
      font-family: 'Cinzel', serif;
    }
    .user-btn:hover { background: rgba(255,255,255,0.07); }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #13131a;
      border: 1px solid rgba(184,150,106,0.2);
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 10px;
      color: #e8e4d8;
      flex-shrink: 0;
      overflow: hidden;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .user-info { display: grid; line-height: 1.15; text-align: left; }
    .user-name {
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.06em;
      white-space: nowrap;
      color: #e8e4d8;
    }
    .user-elo {
      opacity: 0.7;
      font-size: 10px;
      letter-spacing: 0.1em;
      white-space: nowrap;
      color: #b8966a;
    }
    .chevron {
      opacity: 0.5;
      margin-left: 2px;
      transition: transform 0.15s;
    }
    .chevron.open { transform: rotate(180deg); }

    /* Dropdown */
    .dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 200px;
      background: #0d0d10;
      border: 1px solid rgba(184,150,106,0.2);
      border-radius: 8px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      overflow: hidden;
      z-index: 9999;
      display: none;
    }
    .dropdown.open { display: block; }
    .dropdown-header {
      padding: 14px 16px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .dropdown-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #13131a;
      border: 1px solid rgba(184,150,106,0.2);
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 800;
      color: #e8e4d8;
      overflow: hidden;
      flex-shrink: 0;
    }
    .dropdown-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .dropdown-name {
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.06em;
      color: #e8e4d8;
    }
    .dropdown-elo {
      font-size: 10px;
      letter-spacing: 0.1em;
      color: #b8966a;
      margin-top: 4px;
    }
    .dropdown-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 11px 16px;
      background: transparent;
      border: none;
      font-family: 'Cinzel', serif;
      color: #b0aa9e;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.1s;
      text-decoration: none;
    }
    .dropdown-item:hover { background: rgba(184,150,106,0.07); }
    .dropdown-item.danger { color: #f87171; }
    .dropdown-divider { border-top: 1px solid rgba(255,255,255,0.06); }
    .user-area { position: relative; }

    /* Sign in button */
    .signin-btn {
      font-family: 'Cinzel', serif;
      padding: 8px 18px;
      border-radius: 4px;
      background: rgba(184,150,106,0.12);
      border: 1px solid rgba(184,150,106,0.45);
      color: #d4af7a;
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.15s;
      text-decoration: none;
      display: inline-block;
    }
    .signin-btn:hover { background: rgba(184,150,106,0.22); }

    /* Hamburger */
    .vekke-hamburger {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      width: 36px;
      height: 36px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      cursor: pointer;
      padding: 0 8px;
      flex-shrink: 0;
    }
    .vekke-hamburger span {
      display: block;
      height: 1px;
      background: #b0aa9e;
      border-radius: 1px;
    }

    /* Mobile drawer */
    .mobile-drawer {
      display: none;
      flex-direction: column;
      background: rgba(10,10,12,0.98);
      border-bottom: 1px solid rgba(184,150,106,0.15);
      backdrop-filter: blur(16px);
      padding: 8px 0 12px;
    }
    .mobile-drawer.open { display: flex; }
    .mobile-nav-item {
      width: 100%;
      text-align: left;
      padding: 12px 20px;
      background: transparent;
      border: none;
      font-family: 'Cinzel', serif;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #b0aa9e;
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
      text-decoration: none;
      display: block;
    }
    .mobile-nav-item:hover, .mobile-nav-item.active {
      background: rgba(184,150,106,0.07);
      color: #d4af7a;
    }
    .mobile-divider {
      height: 1px;
      background: rgba(255,255,255,0.07);
      margin: 6px 0;
    }

    @media (max-width: 768px) {
      .vekke-nav { display: none; }
      .vekke-header-inner { padding: 0 16px; }
      .vekke-hamburger { display: flex; }
    }
  `

  class VekkeHeader extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
      this._mobileOpen = false
      this._dropdownOpen = false
      this._user = null
      this._turnCount = 0
      this._pollInterval = null
      this._supabase = null
      this._clickOutsideHandler = null
    }

    static get observedAttributes() {
      return ['base-url', 'active-page', 'supabase-url', 'supabase-key']
    }

    get baseUrl() {
      return this.getAttribute('base-url') || 'http://localhost:5173'
    }

    get activePage() {
      return this.getAttribute('active-page') || null
    }

    get supabaseUrl() {
      return this.getAttribute('supabase-url') || ''
    }

    get supabaseKey() {
      return this.getAttribute('supabase-key') || ''
    }

    connectedCallback() {
      this._render()
      this._initSupabase()
    }

    disconnectedCallback() {
      if (this._pollInterval) clearInterval(this._pollInterval)
      if (this._clickOutsideHandler) {
        document.removeEventListener('mousedown', this._clickOutsideHandler)
      }
    }

    async _initSupabase() {
      if (!this.supabaseUrl || !this.supabaseKey) return

      try {
        // Load Supabase via CDN if not already present
        if (!window.__supabaseClient) {
          await this._loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js')
          window.__supabaseClient = window.supabase.createClient(this.supabaseUrl, this.supabaseKey)
        }
        this._supabase = window.__supabaseClient

        // Get session
        const { data: { session } } = await this._supabase.auth.getSession()
        if (session?.user) {
          await this._loadUserProfile(session.user)
          this._startTurnCountPoll(session.user.id)
        }

        // Listen for auth changes
        this._supabase.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            await this._loadUserProfile(session.user)
            this._startTurnCountPoll(session.user.id)
          } else {
            this._user = null
            this._turnCount = 0
            if (this._pollInterval) clearInterval(this._pollInterval)
            this._render()
          }
        })
      } catch (e) {
        console.warn('VekkeHeader: Supabase init failed', e)
      }
    }

    async _loadUserProfile(user) {
      try {
        const { data } = await this._supabase
          .from('profiles')
          .select('username, avatar_url, elo, title_label, is_pro')
          .eq('id', user.id)
          .single()
        this._user = { id: user.id, ...data }
        this._render()
      } catch (e) {
        this._user = { id: user.id, username: user.email }
        this._render()
      }
    }

    _startTurnCountPoll(uid) {
      const fetchCount = async () => {
        try {
          const { count } = await this._supabase
            .from('games')
            .select('id', { count: 'exact', head: true })
            .is('ended_at', null)
            .or(`and(wake_id.eq.${uid},turn.eq.W),and(brake_id.eq.${uid},turn.eq.B)`)
          this._turnCount = count ?? 0
          this._updateTurnBadge()
        } catch (e) {}
      }
      fetchCount()
      if (this._pollInterval) clearInterval(this._pollInterval)
      this._pollInterval = setInterval(fetchCount, 15000)
    }

    _updateTurnBadge() {
      const badge = this.shadowRoot.querySelector('.my-games-badge')
      if (!badge) return
      if (this._turnCount > 0) {
        badge.textContent = this._turnCount
        badge.style.display = 'inline-flex'
      } else {
        badge.style.display = 'none'
      }
    }

    _loadScript(src) {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve()
        const s = document.createElement('script')
        s.src = src
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }

    _nav(path) {
      window.location.href = this.baseUrl + path
    }

    _goRules() {
      // Already on rules - do nothing, or go to root of rules
      window.location.href = window.location.origin
    }

    _initEvents() {
      const root = this.shadowRoot

      // Logo
      root.querySelector('.vekke-logo')?.addEventListener('click', () => this._nav('/'))

      // Desktop nav
      root.querySelector('[data-nav="play"]')?.addEventListener('click', () => this._nav('/'))
      root.querySelector('[data-nav="mygames"]')?.addEventListener('click', () => this._nav('/challenges'))
      root.querySelector('[data-nav="leaderboard"]')?.addEventListener('click', () => this._nav('/leaderboard'))
      root.querySelector('[data-nav="orders"]')?.addEventListener('click', () => this._nav('/orders'))
      root.querySelector('[data-nav="tutorial"]')?.addEventListener('click', () => this._nav('/tutorial'))

      // Mobile nav
      root.querySelector('[data-mobile="play"]')?.addEventListener('click', () => this._nav('/'))
      root.querySelector('[data-mobile="mygames"]')?.addEventListener('click', () => this._nav('/challenges'))
      root.querySelector('[data-mobile="leaderboard"]')?.addEventListener('click', () => this._nav('/leaderboard'))
      root.querySelector('[data-mobile="orders"]')?.addEventListener('click', () => this._nav('/orders'))
      root.querySelector('[data-mobile="tutorial"]')?.addEventListener('click', () => this._nav('/tutorial'))

      // Hamburger
      root.querySelector('.vekke-hamburger')?.addEventListener('click', () => {
        this._mobileOpen = !this._mobileOpen
        root.querySelector('.mobile-drawer')?.classList.toggle('open', this._mobileOpen)
      })

      // User dropdown toggle
      root.querySelector('.user-btn')?.addEventListener('click', () => {
        this._dropdownOpen = !this._dropdownOpen
        root.querySelector('.dropdown')?.classList.toggle('open', this._dropdownOpen)
        root.querySelector('.chevron')?.classList.toggle('open', this._dropdownOpen)
      })

      // Sign out
      root.querySelector('[data-action="signout"]')?.addEventListener('click', async () => {
        await this._supabase?.auth.signOut()
        window.location.href = this.baseUrl + '/auth'
      })

      // Sign in
      root.querySelector('.signin-btn')?.addEventListener('click', () => this._nav('/auth'))

      // Click outside to close dropdown
      if (this._clickOutsideHandler) {
        document.removeEventListener('mousedown', this._clickOutsideHandler)
      }
      this._clickOutsideHandler = (e) => {
        const userArea = root.querySelector('.user-area')
        if (userArea && !userArea.contains(e.target)) {
          this._dropdownOpen = false
          root.querySelector('.dropdown')?.classList.remove('open')
          root.querySelector('.chevron')?.classList.remove('open')
        }
      }
      document.addEventListener('mousedown', this._clickOutsideHandler)
    }

    _initials(name) {
      return String(name ?? '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
    }

    _renderAvatar(size = 28, cls = 'avatar') {
      const u = this._user
      if (!u) return `<div class="${cls}" style="width:${size}px;height:${size}px;font-size:${Math.max(10, Math.floor(size * 0.36))}px">?</div>`
      if (u.avatar_url) {
        return `<div class="${cls}" style="width:${size}px;height:${size}px"><img src="${u.avatar_url}" alt="${u.username}"></div>`
      }
      return `<div class="${cls}" style="width:${size}px;height:${size}px;font-size:${Math.max(10, Math.floor(size * 0.36))}px">${this._initials(u.username)}</div>`
    }

    _renderUserArea() {
      if (!this._user) {
        return `<a class="signin-btn" href="${this.baseUrl}/auth">Sign In</a>`
      }
      const u = this._user
      const eloLine = u.elo && u.title_label ? `${u.title_label} · ${u.elo}${u.is_pro ? ' · Pro' : ''}` : 'Account'
      return `
        <div class="user-area">
          <button class="user-btn">
            ${this._renderAvatar(28, 'avatar')}
            <div class="user-info">
              <div class="user-name">${u.username ?? 'Player'}</div>
              <div class="user-elo">${eloLine}</div>
            </div>
            <svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="dropdown">
            <div class="dropdown-header">
              ${this._renderAvatar(36, 'dropdown-avatar')}
              <div>
                <div class="dropdown-name">${u.username ?? 'Player'}</div>
                ${u.elo && u.title_label ? `<div class="dropdown-elo">${u.title_label} · ${u.elo}</div>` : ''}
              </div>
            </div>
            <a class="dropdown-item" href="${this.baseUrl}/profile">Edit Profile</a>
            <a class="dropdown-item" href="${this.baseUrl}/skins">Gear</a>
            <div class="dropdown-divider">
              <button class="dropdown-item danger" data-action="signout">Sign Out</button>
            </div>
          </div>
        </div>
      `
    }

    _navItem(page, label, path, badge = false) {
      const active = this.activePage === page ? 'active' : ''
      const badgeHtml = badge ? `<span class="nav-badge my-games-badge" style="display:${this._turnCount > 0 ? 'inline-flex' : 'none'}">${this._turnCount}</span>` : ''
      return `<button class="nav-item ${active}" data-nav="${page}">${label}${badgeHtml}</button>`
    }

    _mobileNavItem(page, label) {
      const active = this.activePage === page ? 'active' : ''
      const turnSuffix = page === 'mygames' && this._turnCount > 0 ? ` (${this._turnCount})` : ''
      return `<button class="mobile-nav-item ${active}" data-mobile="${page}">${label}${turnSuffix}</button>`
    }

    _render() {
      const root = this.shadowRoot
      root.innerHTML = `
        <style>${STYLES}</style>
        <header class="vekke-header">
          <div class="vekke-header-inner">
            <div class="vekke-logo">
              <img src="${this.baseUrl}/logo.png" alt="Vekke">
              <div class="vekke-logo-text">
                <div class="vekke-logo-name">VEKKE</div>
                <div class="vekke-logo-sub">the game of routes</div>
              </div>
            </div>

            <nav class="vekke-nav">
              ${this._navItem('play', 'Play', '/')}
              ${this._navItem('mygames', 'My Games', '/challenges', true)}
              ${this._navItem('leaderboard', 'Leaderboard', '/leaderboard')}
              ${this._navItem('orders', 'Orders', '/orders')}
              <button class="nav-item active" data-nav="rules">Rules</button>
              ${this._navItem('tutorial', 'Tutorial', '/tutorial')}
            </nav>

            <div class="vekke-header-right">
              <button class="vekke-hamburger" aria-label="Menu">
                <span></span>
                <span style="width:70%;align-self:flex-end"></span>
                <span style="width:85%"></span>
              </button>
              ${this._renderUserArea()}
            </div>
          </div>
        </header>

        <div class="mobile-drawer ${this._mobileOpen ? 'open' : ''}">
          ${this._mobileNavItem('play', 'Play')}
          ${this._mobileNavItem('mygames', 'My Games')}
          ${this._mobileNavItem('leaderboard', 'Leaderboard')}
          ${this._mobileNavItem('orders', 'Orders')}
          <div class="mobile-divider"></div>
          <button class="mobile-nav-item active" data-mobile="rules">Rules</button>
          ${this._mobileNavItem('tutorial', 'Tutorial')}
        </div>
      `
      this._initEvents()
    }
  }

  customElements.define('vekke-header', VekkeHeader)
})()
