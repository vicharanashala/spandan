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
      allowedHosts: ['.trycloudflare.com'],
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          timeout: 300000,
          proxyTimeout: 300000,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, res) => {
              if (err.code === 'ECONNREFUSED') {
                if (res && !res.headersSent && typeof res.writeHead === 'function') {
                  res.writeHead(502, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Backend server unavailable' }));
                }
              } else {
                console.error('[vite] http proxy error:', err.message);
              }
            });
          }
        },
        '/spandan/socket.io': {
          target: 'http://127.0.0.1:3001',
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              if (err.code !== 'ECONNREFUSED') {
                console.error('[vite] ws proxy error:', err.message);
              }
            });
          }
        }
      }
    }
  }
})
