import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = env.VITE_BASE_PATH || ''
  const formattedBasePath = basePath ? '/' + basePath.replace(/^\//, '').replace(/\/+$/, '') : ''

  const apiPath = formattedBasePath ? formattedBasePath + '/api' : '/api'
  const socketPath = formattedBasePath ? formattedBasePath + '/socket.io' : '/socket.io'

  return {
    plugins: [react()],
    root: '.',
    base: formattedBasePath ? formattedBasePath + '/' : './',
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
