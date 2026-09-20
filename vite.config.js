import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the local Express server (`npm run server`).
    // In production the same routes are served by Vercel functions in /api.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
