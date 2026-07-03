import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: process.env.VITE_BASE_PATH ? '/' + process.env.VITE_BASE_PATH.replace(/^\//, '').replace(/\/+$/, '') + '/' : './',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
  '/api': {
    target: 'http://127.0.0.1:3001', // Changed from localhost to 127.0.0.1
    changeOrigin: true
  },
  '/socket.io': {
    target: 'http://127.0.0.1:3001', // Changed from localhost to 127.0.0.1
    ws: true
  }
}
  }
})
