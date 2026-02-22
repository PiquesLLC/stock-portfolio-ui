import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'
// PWA disabled — service worker was caching stale JS bundles and breaking the app.
// Re-enable after stabilizing by uncommenting VitePWA below.
// import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: parseInt(process.env.VITE_PORT || '5173'),
    host: '0.0.0.0', // Listen on all interfaces for LAN access
    allowedHosts: ['.loca.lt', '.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/hls': {
        target: 'https://stream.livenewsplay.com:9443',
        changeOrigin: true,
        secure: false,
        headers: {
          'Origin': '',
          'Referer': '',
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'framer': ['framer-motion'],
        },
      },
    },
  },
})
