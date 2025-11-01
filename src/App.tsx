import React from 'react'
import { EngineProvider } from './ui/EngineContext'
import { Toolbar } from './ui/Toolbar'
import { CanvasContainer } from './ui/CanvasContainer'

const App: React.FC = () => {
  return (
    <EngineProvider>
      <div className="flex h-screen w-screen bg-[#0e1116] text-gray-100">
        <div className="w-52 border-r border-white/10 bg-black/20 p-2">
          <Toolbar />
        </div>
        <div className="flex-1">
          <CanvasContainer />
        </div>
      </div>
    </EngineProvider>
  )
}

export default App
