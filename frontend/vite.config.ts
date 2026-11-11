import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the frontend calls /api on its own origin and Vite
    // forwards the request to the Go backend, so no CORS setup is needed.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
