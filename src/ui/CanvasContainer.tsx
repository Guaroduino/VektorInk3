import React, { useEffect, useRef } from 'react'
import { useEngine } from './EngineContext'

export const CanvasContainer: React.FC = () => {
  const engine = useEngine()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (ref.current) {
      void engine.init(ref.current)
    }
  }, [])

  // Resize con ResizeObserver para ajustar el renderer al tamaño del contenedor
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const app = engine.getEngineApp()
    const doResize = () => {
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      try {
        // Ajusta buffer interno
        ;(app.renderer as any).resize(w, h)
        // Asegura tamaño CSS del canvas acorde al contenedor (sin autoDensity en v8)
        const cvs = app.canvas as HTMLCanvasElement
        cvs.style.width = `${w}px`
        cvs.style.height = `${h}px`
        // Actualiza overlay offscreen si existe
        try { (engine as any).resizeOverlay?.(w, h) } catch {}
      } catch (e) {
        // ignorar si aún no inicializó
      }
    }

    const ro = new ResizeObserver(() => doResize())
    ro.observe(el)
    // Llamada inicial por si el contenedor ya tiene tamaño
    doResize()
    return () => {
      ro.disconnect()
    }
  }, [engine])

  return <div ref={ref} className="w-full h-full flex-1 relative" />
}
