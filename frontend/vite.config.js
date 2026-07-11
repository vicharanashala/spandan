import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: process.env.VITE_BASE_PATH ? '/' + process.env.VITE_BASE_PATH.replace(/^\//, '').replace(/\/+$/, '') + '/' : '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true
    },
    // Match the sub-path path prefix shown in your error logs
    '/spandan/socket.io': {
      target: 'http://127.0.0.1:3001',
      ws: true,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/spandan/, '') // Strips /spandan before hitting backend if backend doesn't expect it
    }
  }
}
})
