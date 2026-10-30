import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Resolve the base path from .env (loadEnv) OR the shell env (process.env, for CI overrides).
  // NOTE: the config previously read only `process.env.VITE_BASE_PATH`, but Vite does NOT load
  // .env files into process.env for the config — only into import.meta.env for the app. So the
  // base silently fell back to './' (relative), and deep-link hard-refresh (e.g.
  // /spandan/student/session/XXXX) broke with a "MIME type text/html" error because relative
  // asset URLs resolved to a nested path nginx served index.html for. loadEnv fixes it.
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH
  const base = rawBase
    ? '/' + rawBase.replace(/^\//, '').replace(/\/+$/, '') + '/'
    : './'

  return {
    plugins: [react()],
    root: '.',
    base,
    build: {
      outDir: '../dist',
      emptyOutDir: true
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          // While the API restarts (node --watch) the proxy's default error response is an EMPTY 500,
          // so the client's response.json() throws "Unexpected end of JSON input". Send real JSON
          // instead so the UI shows a useful "API unavailable" message. Vite registers its own error
          // handler AFTER this one, and its handler skips responses we've already written.
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              if (!res || res.headersSent || res.writableEnded || typeof res.writeHead !== 'function') return
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'API server is unavailable. Please retry in a moment.' }))
            })
          }
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true
        }
      }
    }
  }
})
