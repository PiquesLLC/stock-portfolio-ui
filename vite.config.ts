import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT || '5173'),
    host: '127.0.0.1', // Localhost only - prevents network exposure
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
  // Expose environment variables to the client
  define: {
    // Ensure VITE_API_URL is available
  },
})
