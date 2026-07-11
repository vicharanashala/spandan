import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BASE_PATH = (process.env.VITE_BASE_PATH || '')
  .replace(/^\//, '')
  .replace(/\/+$/, '')
const PREFIX = BASE_PATH ? '/' + BASE_PATH : ''

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: BASE_PATH ? PREFIX + '/' : './',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api':        { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', changeOrigin: true, ws: true }
    }
  }
})