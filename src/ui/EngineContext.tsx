import React, { createContext, useContext, useEffect } from 'react'
import { VektorEngine } from '../VektorEngine'

const engineSingleton = new VektorEngine()

// Exponer para debugging en desarrollo
if (import.meta.env.DEV) {
  (window as any).engine = engineSingleton
  // eslint-disable-next-line no-console
  console.info('[VektorEngine] Expuesto en window.engine (solo DEV)')
}

export const EngineContext = createContext<VektorEngine>(engineSingleton)

export const EngineProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  // Auto-enable low-latency when installed as PWA (standalone)
  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)')
    const isStandalone = () => (mq && mq.matches) || (navigator as any).standalone === true
    const apply = () => {
      try { (engineSingleton as any).setLowLatencyMode?.(!!isStandalone()) } catch {}
    }
    apply()
    try { mq?.addEventListener('change', apply) } catch {}
    return () => { try { mq?.removeEventListener('change', apply) } catch {} }
  }, [])

  return (
    <EngineContext.Provider value={engineSingleton}>
      {children}
    </EngineContext.Provider>
  )
}

export const useEngine = () => useContext(EngineContext)
