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
        // Router basename is fixed to "/spandan" (see App.jsx), so in dev the browser always
        // requests /spandan/api/... and /spandan/socket.io — but the backend mounts its routes
        // at plain /api and /socket.io (nginx strips the /spandan prefix in production). Proxy
        // both the prefixed and bare paths here and rewrite away the prefix, so dev works the
        // same whether VITE_BASE_PATH is set to "/spandan" or left empty.
        '/spandan/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/spandan/, '')
        },
        '/spandan/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          rewrite: (path) => path.replace(/^\/spandan/, '')
        },
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true
        }
      }
    }
  }
})
