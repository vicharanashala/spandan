import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Prevent Node 26 TCP ECONNRESET when client browser tabs close abruptly from crashing Vite
process.on('uncaughtException', (err) => {
  if (err?.code === 'ECONNRESET' || err?.message?.includes('ECONNRESET')) return
  console.error('Unhandled server error:', err)
})

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
          configure: (proxy) => {
            proxy.on('error', (err, _req, _res) => {
              // suppress ECONNRESET so dev server doesn't crash on reconnect
            })
          }
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          configure: (proxy) => {
            proxy.on('error', (err, _req, _res) => {
              // suppress ECONNRESET so dev server doesn't crash on reconnect
            })
          }
        },
        '/spandan/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          rewrite: (path) => path.replace(/^\/spandan/, ''),
          configure: (proxy) => {
            proxy.on('error', (err, _req, _res) => {
              // suppress ECONNRESET so dev server doesn't crash on reconnect
            })
          }
        }
      }
    }
  }
})
