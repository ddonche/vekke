/**
 * vekke-header.js
 * Shared Vekke header Web Component for static pages like rules.vekke.net
 *
 * Usage:
 *   <script src="/assets/vekke-header.js"></script>
 *   <vekke-header
 *     base-url="https://vekke.net"
 *     active-page="rules"
 *   ></vekke-header>
 *
 * Attributes:
 *   base-url     Root URL of the main Vekke site
 *   active-page  One of: play, leaderboard, orders, rules, tutorial, puzzles, announcements
 */
(function () {
  if (!document.getElementById('vekke-header-fonts')) {
    const link = document.createElement('link')
    link.id = 'vekke-header-fonts'
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap'
    document.head.appendChild(link)
  }

  const STYLES = `
    :host {
      display: block;
      width: 100%;
      position: static;
      margin: 0;
      padding: 0;
      font-family: 'Cinzel', serif;
    }

    * {
      box-sizing: border-box;
    }

    .vekke-header {
      position: relative;
      width: 100%;
      margin: 0;
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
      user-select: none;
    }

    .vekke-logo img {
      width: 40px;
      height: 40px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .vekke-logo-text {
      line-height: 1.05;
    }

    .vekke-logo-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #e8e4d8;
      font-family: 'Cinzel', serif;
    }

    .vekke-logo-sub {
      font-family: 'Cinzel', serif;
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
      appearance: none;
      -webkit-appearance: none;
      outline: none;
    }

    .nav-item:hover {
      background: rgba(255,255,255,0.05);
      color: #e8e4d8;
    }

    .nav-item.active {
      background: rgba(184,150,106,0.10);
      border: 1px solid rgba(184,150,106,0.30);
      color: #d4af7a;
    }

    .vekke-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .announcements-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #b8966a;
      transition: color 0.2s, background 0.15s ease;
      appearance: none;
      -webkit-appearance: none;
    }

    .announcements-btn:hover {
      color: #e8e4d8;
      background: rgba(255,255,255,0.04);
    }

    .announcements-btn.active {
      color: #5de8f7;
    }

    .account-btn {
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      appearance: none;
      -webkit-appearance: none;
    }

    .account-btn:hover {
      background: rgba(184,150,106,0.22);
    }

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
      appearance: none;
      -webkit-appearance: none;
    }

    .vekke-hamburger span {
      display: block;
      height: 1px;
      background: #b0aa9e;
      border-radius: 1px;
      transition: all 0.2s;
    }

    .vekke-mobile-drawer {
      display: none;
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      background: rgba(10,10,12,0.98);
      border-bottom: 1px solid rgba(184,150,106,0.15);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      z-index: 999;
      flex-direction: column;
      padding: 8px 0 12px;
    }

    .vekke-mobile-drawer.open {
      display: flex;
    }

    .vekke-mobile-nav-item {
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
      appearance: none;
      -webkit-appearance: none;
      outline: none;
    }

    .vekke-mobile-nav-item:hover,
    .vekke-mobile-nav-item.active {
      background: rgba(184,150,106,0.07);
      color: #d4af7a;
    }

    .vekke-mobile-divider {
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
    }

    static get observedAttributes() {
      return ['base-url', 'active-page']
    }

    get baseUrl() {
      return (this.getAttribute('base-url') || 'https://vekke.net').replace(/\/+$/, '')
    }

    get activePage() {
      return this.getAttribute('active-page') || null
    }

    connectedCallback() {
      this._render()
    }

    attributeChangedCallback() {
      if (this.shadowRoot) this._render()
    }

    _go(url) {
      window.location.href = url
    }

    _nav(path) {
      this._go(`${this.baseUrl}${path}`)
    }

    _goRules() {
      this._go(window.location.origin)
    }

    _desktopNavItem(page, label) {
      const active = this.activePage === page ? 'active' : ''
      return `<button class="nav-item ${active}" data-nav="${page}">${label}</button>`
    }

    _mobileNavItem(page, label) {
      const active = this.activePage === page ? 'active' : ''
      return `<button class="vekke-mobile-nav-item ${active}" data-mobile="${page}">${label}</button>`
    }

    _render() {
      this.shadowRoot.innerHTML = `
        <style>${STYLES}</style>

        <header class="vekke-header">
          <div class="vekke-header-inner">
            <div class="vekke-logo" data-logo>
              <img src="${this.baseUrl}/logo.png" alt="Vekke" />
              <div class="vekke-logo-text">
                <div class="vekke-logo-name">VEKKE</div>
                <div class="vekke-logo-sub">the game of routes</div>
              </div>
            </div>

            <nav class="vekke-nav">
              ${this._desktopNavItem('play', 'Play')}
              ${this._desktopNavItem('puzzles', 'Puzzles')}
              ${this._desktopNavItem('leaderboard', 'Leaderboard')}
              ${this._desktopNavItem('orders', 'Orders')}
              ${this._desktopNavItem('rules', 'Rules')}
              ${this._desktopNavItem('tutorial', 'Tutorial')}
            </nav>

            <div class="vekke-header-right">
              <button
                class="vekke-hamburger"
                aria-label="Menu"
                data-hamburger
              >
                <span style="width:100%"></span>
                <span style="width:70%;align-self:flex-end"></span>
                <span style="width:85%"></span>
              </button>

              <button
                class="announcements-btn ${this.activePage === 'announcements' ? 'active' : ''}"
                aria-label="Announcements"
                data-announcements
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 11l19-9-9 19-2-8-8-2z"></path>
                </svg>
              </button>

              <button class="account-btn" data-account>Account</button>
            </div>
          </div>
        </header>

        <div class="vekke-mobile-drawer ${this._mobileOpen ? 'open' : ''}">
          ${this._mobileNavItem('play', 'Play')}
          ${this._mobileNavItem('puzzles', 'Puzzles')}
          ${this._mobileNavItem('leaderboard', 'Leaderboard')}
          ${this._mobileNavItem('orders', 'Orders')}
          <div class="vekke-mobile-divider"></div>
          ${this._mobileNavItem('rules', 'Rules')}
          ${this._mobileNavItem('tutorial', 'Tutorial')}
          ${this._mobileNavItem('announcements', 'Announcements')}
        </div>
      `

      const root = this.shadowRoot

      root.querySelector('[data-logo]')?.addEventListener('click', () => this._nav('/'))

      root.querySelector('[data-nav="play"]')?.addEventListener('click', () => this._nav('/play?openNewGame=1'))
      root.querySelector('[data-nav="puzzles"]')?.addEventListener('click', () => this._nav('/puzzles'))
      root.querySelector('[data-nav="leaderboard"]')?.addEventListener('click', () => this._nav('/leaderboard'))
      root.querySelector('[data-nav="orders"]')?.addEventListener('click', () => this._nav('/orders'))
      root.querySelector('[data-nav="rules"]')?.addEventListener('click', () => this._goRules())
      root.querySelector('[data-nav="tutorial"]')?.addEventListener('click', () => this._nav('/tutorial'))

      root.querySelector('[data-mobile="play"]')?.addEventListener('click', () => {
        this._mobileOpen = false
        this._nav('/play?openNewGame=1')
      })
      root.querySelector('[data-mobile="puzzles"]')?.addEventListener('click', () => {
        this._mobileOpen = false
        this._nav('/puzzles')
      })
      root.querySelector('[data-mobile="leaderboard"]')?.addEventListener('click', () => {
        this._mobileOpen = false
        this._nav('/leaderboard')
      })
      root.querySelector('[data-mobile="orders"]')?.addEventListener('click', () => {
        this._mobileOpen = false
        this._nav('/orders')
      })
      root.querySelector('[data-mobile="rules"]')?.addEventListener('click', () => {
        this._mobileOpen = false
        this._goRules()
      })
      root.querySelector('[data-mobile="tutorial"]')?.addEventListener('click', () => {
        this._mobileOpen = false
        this._nav('/tutorial')
      })
      root.querySelector('[data-mobile="announcements"]')?.addEventListener('click', () => {
        this._mobileOpen = false
        this._nav('/announcements')
      })

      root.querySelector('[data-announcements]')?.addEventListener('click', () => this._nav('/announcements'))
      root.querySelector('[data-account]')?.addEventListener('click', () => this._nav('/'))

      root.querySelector('[data-hamburger]')?.addEventListener('click', () => {
        this._mobileOpen = !this._mobileOpen
        this._render()
      })
    }
  }

  if (!customElements.get('vekke-header')) {
    customElements.define('vekke-header', VekkeHeader)
  }
})()