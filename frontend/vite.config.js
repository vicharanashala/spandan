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
  const rawBase = ('VITE_BASE_PATH' in process.env) ? process.env.VITE_BASE_PATH : (env.VITE_BASE_PATH || '')
  const formattedBasePath = rawBase ? '/' + rawBase.replace(/^\//, '').replace(/\/+$/, '') : ''

  const base = formattedBasePath ? formattedBasePath + '/' : './'

  const apiPath = formattedBasePath ? formattedBasePath + '/api' : '/api'
  const socketPath = formattedBasePath ? formattedBasePath + '/socket.io' : '/socket.io'

  // Redirect /spandan -> /spandan/ so users don't see the raw Vite base-path warning
  const baseRedirectPlugin = () => ({
    name: 'base-redirect',
    configureServer(server) {
      if (formattedBasePath) {
        server.middlewares.use((req, res, next) => {
          if (req.url === formattedBasePath) {
            res.writeHead(302, { Location: formattedBasePath + '/' });
            res.end();
            return;
          }
          next();
        });
      }
    }
  });

  return {
    plugins: [baseRedirectPlugin(), react()],
    root: '.',
    base,
    build: {
      outDir: '../dist',
      emptyOutDir: true
    },
    server: {
      port: 5173,
      proxy: {
        [apiPath]: {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => formattedBasePath ? path.replace(new RegExp('^' + formattedBasePath + '/api'), '/api') : path
        },
        [socketPath]: {
          target: 'http://localhost:3001',
          ws: true,
          rewrite: (path) => formattedBasePath ? path.replace(new RegExp('^' + formattedBasePath + '/socket.io'), '/socket.io') : path
        }
      }
    }
  }
})
