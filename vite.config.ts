import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',

      manifest: {
        name: 'Vekke',
        short_name: 'Vekke',
        description: 'A competitive abstract strategy board game',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rules/],
      },
    }),

    {
      name: 'serve-rules-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/rules')) return next()

          const url = req.url.split('?')[0]
          const filePath = join(__dirname, 'public', url)

          if (existsSync(filePath) && !filePath.endsWith('/')) {
            const ext = url.split('.').pop()
            const contentType =
              ext === 'css' ? 'text/css' :
              ext === 'js'  ? 'text/javascript' :
              ext === 'png' ? 'image/png' :
              ext === 'ico' ? 'image/x-icon' :
              'text/html'
            res.setHeader('Content-Type', contentType)
            res.end(readFileSync(filePath))
          } else {
            const indexPath = join(__dirname, 'public/rules/index.html')
            res.setHeader('Content-Type', 'text/html')
            res.end(readFileSync(indexPath))
          }
        })
      }
    }
  ],
})