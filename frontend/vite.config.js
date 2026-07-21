import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const basePath = process.env.VITE_BASE_PATH ? '/' + process.env.VITE_BASE_PATH.replace(/^\//, '').replace(/\/+$/, '') : ''

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: basePath ? basePath + '/' : './',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      [`${basePath || ''}/api`]: {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => basePath ? path.replace(new RegExp(`^${basePath}`), '') : path
      },
      [`${basePath || ''}/socket.io`]: {
        target: 'http://localhost:3001',
        ws: true,
        rewrite: (path) => basePath ? path.replace(new RegExp(`^${basePath}`), '') : path
      }
    }
  }
})
