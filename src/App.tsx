import React from 'react'
import { EngineProvider } from './ui/EngineContext'
import { CanvasContainer } from './ui/CanvasContainer'
import { ToolPanel } from './ui/ToolPanel'
import { GlobalPanel } from './ui/GlobalPanel'

function App() {
  return (
    <EngineProvider>
      {/* Contenedor principal con posicionamiento relativo para paneles flotantes */}
      <main className="relative w-screen h-screen overflow-hidden text-gray-100">
        {/* Capa 1: Canvas a pantalla completa */}
        <CanvasContainer />

  {/* Panel izquierdo: herramienta y opciones locales */}
  <ToolPanel />

  {/* Panel derecho: ajustes globales */}
  <GlobalPanel />

        {/* Futuro: Panel de capas */}
        {/* <LayerPanel /> */}
      </main>
    </EngineProvider>
  )
}

export default App
