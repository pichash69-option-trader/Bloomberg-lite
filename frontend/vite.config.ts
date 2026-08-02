import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend calls the backend via VITE_API_URL (default http://localhost:8000).
// Backend enables CORS for the Vite dev origin (see backend/app/main.py).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Docker-on-Windows: host FS events don't reach the container, so poll for
    // changes to keep HMR working.
    watch: { usePolling: true, interval: 300 },
  },
})
