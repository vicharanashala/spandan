import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = (env.VITE_BASE_PATH || '').replace(/^\//, '').replace(/\/+$/, '')
  const base = basePath ? `/${basePath}/` : './'

  const proxy = {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true
    },
    '/socket.io': {
      target: 'http://localhost:3001',
      ws: true
    }
  }

  // When VITE_BASE_PATH=/spandan, frontend calls /spandan/api — proxy to backend /api
  if (basePath) {
    proxy[`/${basePath}/api`] = {
      target: 'http://localhost:3001',
      changeOrigin: true,
      rewrite: (path) => path.replace(`/${basePath}`, '')
    }
    proxy[`/${basePath}/socket.io`] = {
      target: 'http://localhost:3001',
      ws: true,
      rewrite: (path) => path.replace(`/${basePath}`, '')
    }
  }

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
      proxy
    }
  }
})
