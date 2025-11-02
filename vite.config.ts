import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration for React + TypeScript + Web Workers
// - Enables React fast refresh
// - Keeps worker bundles in ES module format (default)
// - You can tweak server settings here if needed
export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    port: 5173,
  },
  preview: {
    port: 5173,
  },
  // Worker options are fine by default for Vite; left here for clarity
  worker: {
    format: 'es',
  },
})