import React, { useState } from 'react'
import { useEngine } from './EngineContext'
import { Pen, MousePointer2, Brush, Eraser } from 'lucide-react'
import type { ToolKey } from '../VektorEngine'

// Mantener los nombres de herramienta en línea con VektorEngine
type ToolName = ToolKey // 'pluma' | 'vpen' | 'raster' | 'contorno'

// Configuración visual de la barra
const tools: { name: ToolName; icon: React.ReactNode; label: string }[] = [
  { name: 'pluma', icon: <Pen size={20} />, label: 'Pluma' },
  { name: 'vpen', icon: <MousePointer2 size={20} />, label: 'Vector' },
  { name: 'raster', icon: <Brush size={20} />, label: 'Raster' },
  { name: 'contorno', icon: <Eraser size={20} />, label: 'Contorno' },
]

export const Toolbar: React.FC = () => {
  const engine = useEngine()
  const [activeTool, setActiveTool] = useState<ToolName>(() => engine.getActiveTool() as ToolName)

  const handleToolClick = (toolName: ToolName) => {
    engine.setActiveTool(toolName)
    setActiveTool(toolName)
  }

  return (
    <div
      className="
        absolute top-4 left-4 z-10
        flex flex-col gap-1 p-1.5
        bg-gray-800 text-white
        border border-gray-700/50
        rounded-lg shadow-md
      "
    >
      {tools.map((tool) => (
        <button
          key={tool.name}
          onClick={() => handleToolClick(tool.name)}
          data-active={activeTool === tool.name}
          className="
            p-2 rounded-md text-white/70
            transition-colors duration-100 ease-in-out
            hover:bg-gray-700/60 hover:text-white
            data-[active=true]:bg-blue-600 data-[active=true]:text-white
          "
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  )
}
