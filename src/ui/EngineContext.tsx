import React, { createContext, useContext } from 'react'
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
  return (
    <EngineContext.Provider value={engineSingleton}>
      {children}
    </EngineContext.Provider>
  )
}

export const useEngine = () => useContext(EngineContext)
