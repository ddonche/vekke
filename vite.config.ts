import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
