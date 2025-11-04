import React from 'react'
import { EngineProvider } from './ui/EngineContext'
import { CanvasContainer } from './ui/CanvasContainer'
import { TopBar } from './ui/TopBar'

function App() {
  return (
    <EngineProvider>
      {/* Contenedor principal con posicionamiento relativo para paneles flotantes */}
      <main className="relative w-screen h-screen overflow-hidden text-gray-100">
        {/* Capa 1: Canvas a pantalla completa */}
        <CanvasContainer />

  {/* Barra superior unificada */}
  <TopBar />

        {/* Futuro: Panel de capas */}
        {/* <LayerPanel /> */}
      </main>
    </EngineProvider>
  )
}

export default App
