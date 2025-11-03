import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

const container = document.getElementById('root')
if (!container) throw new Error('No se encontró el contenedor #root')
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
;

// PWA: registra Service Worker respetando la base de Vite
(() => {
  if ('serviceWorker' in navigator) {
    const base = (import.meta as any).env?.BASE_URL || '/'
    const swUrl = new URL('sw.js', window.location.origin + base).toString()
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(swUrl)
        .catch((err) => console.debug?.('[PWA] SW register failed', err))
    })
  }
})()
