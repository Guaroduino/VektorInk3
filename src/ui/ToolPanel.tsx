import React, { useState } from 'react'
import { useEngine } from './EngineContext'
import { PanelLeftClose, PanelLeftOpen, Palette, SlidersVertical, Droplet, MousePointer2, Square, Plus, X, Sun } from 'lucide-react'

export const ToolPanel: React.FC = () => {
  const engine = useEngine()
  const [collapsed, setCollapsed] = useState(false)

  // Local-ish controls (aplican vía engine de forma global, pero pensadas para la herramienta activa)
  const [size, setSize] = useState(() => engine.getStrokeSize?.() ?? 8)
  const [strokeHex, setStrokeHex] = useState(() => `#${(engine.getStrokeColor?.() ?? 0xffffff).toString(16).padStart(6,'0')}`)
  const [opacity, setOpacity] = useState(() => engine.getOpacity?.() ?? 1)
  const [blend, setBlend] = useState(() => engine.getBlendMode?.() ?? 'normal')
  const [pressure, setPressure] = useState(() => engine.getPressureSensitivity?.() ?? true)


  const onSize = (v:number) => { setSize(v); engine.setStrokeSize?.(v) }
  const onStroke = (hex:string) => { setStrokeHex(hex); const n = parseInt(hex.replace('#',''),16)>>>0; engine.setStrokeColor?.(n) }
  const onOpacity = (v:number) => { setOpacity(v); engine.setOpacity?.(v) }
  const onBlend = (v:string) => { setBlend(v); engine.setBlendMode?.(v) }
  const onPressure = (v:boolean) => { setPressure(v); engine.setPressureSensitivity?.(v) }

  return (
    <div className="absolute top-4 left-4 z-[9999] pointer-events-auto bg-white text-gray-900 border border-gray-300 rounded-lg shadow-md p-2 w-[300px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1">
        <button
          aria-label={collapsed ? 'Expandir' : 'Contraer'}
          onClick={() => setCollapsed(v=>!v)}
          className="p-1.5 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-300"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-2 grid gap-2">
          {/* Tamaño */}
          <div className="flex items-center gap-2" title="Tamaño">
            <SlidersVertical size={16} className="opacity-80" />
            <input type="range" min={1} max={64} step={1} value={size} onChange={e=>onSize(Number(e.target.value))} className="w-44 accent-blue-500" title={`Tamaño ${size}px`} />
          </div>
          {/* Color de trazo */}
          <div className="flex items-center gap-2" title="Color de trazo">
            <Palette size={16} className="opacity-80" />
            <input type="color" value={strokeHex} onChange={e=>onStroke(e.target.value)} className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0" title="Color de trazo" />
          </div>
          {/* Fusión y opacidad */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" title="Blend mode">
              <button aria-label="Normal" title="Normal" onClick={()=>onBlend('normal')} data-active={blend==='normal'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><Square size={16}/></button>
              <button aria-label="Add" title="Add" onClick={()=>onBlend('add')} data-active={blend==='add'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><Plus size={16}/></button>
              <button aria-label="Multiply" title="Multiply" onClick={()=>onBlend('multiply')} data-active={blend==='multiply'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><X size={16}/></button>
              <button aria-label="Screen" title="Screen" onClick={()=>onBlend('screen')} data-active={blend==='screen'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><Sun size={16}/></button>
            </div>
            <div className="ml-auto flex items-center gap-2" title="Opacidad">
              <Droplet size={16} className="opacity-80" />
              <input type="range" min={0.05} max={1} step={0.01} value={opacity} onChange={e=>onOpacity(Number(e.target.value))} className="w-28 accent-blue-500" />
            </div>
          </div>
          {/* Presión */}
          <div className="flex items-center gap-2" title="Presión (tablet)">
            <input type="checkbox" checked={pressure} onChange={e=>onPressure(e.target.checked)} title="Presión" />
            <MousePointer2 size={16} className="opacity-80" />
          </div>
        </div>
      )}
    </div>
  )
}
