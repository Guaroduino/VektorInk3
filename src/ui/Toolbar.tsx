import React, { useEffect, useState } from 'react'
import { useEngine } from './EngineContext'
import { Pen, MousePointer2, PenTool, Brush } from 'lucide-react'

type ToolName = 'pluma' | 'vpen' | 'raster' | 'contorno'

const tools: { key: ToolName; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'pluma', label: 'Pluma', Icon: Pen },
  { key: 'vpen', label: 'Vector Pen', Icon: PenTool },
  { key: 'raster', label: 'Raster', Icon: Brush },
  { key: 'contorno', label: 'Contorno', Icon: MousePointer2 },
]

export const Toolbar: React.FC = () => {
  const engine = useEngine()
  const [active, setActive] = useState<ToolName>('pluma')

  useEffect(() => {
    const current = engine.getActiveTool() as ToolName
    if (current) setActive(current)
  }, [engine])

  const onSelect = (t: ToolName) => {
    engine.setActiveTool(t)
    setActive(t)
  }

  return (
    <div className="flex flex-col gap-2 p-2 bg-gray-900/60 rounded-md">
      {tools.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors border border-white/10 hover:bg-white/10 ${active === key ? 'bg-white/15' : 'bg-black/20'}`}
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
