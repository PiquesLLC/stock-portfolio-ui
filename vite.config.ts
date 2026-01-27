import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT || '5173'),
    host: '127.0.0.1',
  },
  // Expose environment variables to the client
  define: {
    // Ensure VITE_API_URL is available
  },
})
