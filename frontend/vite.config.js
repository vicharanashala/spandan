import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Resolve the base path from .env (loadEnv) OR the shell env (process.env, for CI overrides).
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH
  // Normalized base path for `base` (Vite's asset URL prefix). Trailing slash required.
  const base = rawBase
    ? '/' + rawBase.replace(/^\//, '').replace(/\/+$/, '') + '/'
    : '/'

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
        // Proxy keys MUST be basePath-prefixed so requests to /spandan/api/... hit
        // the backend instead of nginx's index.html. The rewrite strips the
        // basePath so the backend sees /api/... as expected. When no basePath is
        // set we fall back to the upstream defaults (/api, /socket.io) without a
        // rewrite, matching pre-subpath behavior.
        ...(rawBase
          ? {
              [base + 'api']: {
                target: 'http://localhost:3001',
                changeOrigin: true,
                rewrite: (p) => p.replace(base, '/')
              },
              [base + 'socket.io']: {
                target: 'http://localhost:3001',
                changeOrigin: true,
                rewrite: (p) => p.replace(base, '/'),
                ws: true
              }
            }
          : {
              '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
              },
              '/socket.io': {
                target: 'http://localhost:3001',
                ws: true
              }
            })
      }
    }
  }
})