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
      '/spandan/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/spandan\/api/, '/api')
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/spandan/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        rewrite: (path) => path.replace(/^\/spandan\/socket\.io/, '/socket.io')
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
})
