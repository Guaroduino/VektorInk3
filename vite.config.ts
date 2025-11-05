import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration for React + TypeScript + Web Workers
// - Enables React fast refresh
// - Keeps worker bundles in ES module format (default)
// - You can tweak server settings here if needed
export default defineConfig({
  base: '/VektorInk3/',
  plugins: [react()],
  server: {
    // Abre directamente la ruta base para evitar "Not Found" al abrir / en dev
    open: '/VektorInk3/',
    port: 5173,
  },
  preview: {
    port: 5173,
    // Consistencia al hacer vite preview
    open: '/VektorInk3/',
  },
  // Worker options are fine by default for Vite; left here for clarity
  worker: {
    format: 'es',
  },
})