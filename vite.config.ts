import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // IMPORTANT: Set base to repository name for GitHub Pages project sites
  // e.g. https://<user>.github.io/VektorInk3/
  // This ensures built asset paths resolve correctly in production.
  base: '/VektorInk3/',
  plugins: [react()],
  server: {
    port: 5173,
    open: false
  }
})
