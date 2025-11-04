import React, { useEffect, useState } from 'react'
import { useEngine } from './EngineContext'
import { Settings2, Droplet, Zap, SlidersVertical, Maximize2, Rocket, Sparkles, Wand2, RotateCcw } from 'lucide-react'

export const GlobalPanel: React.FC = () => {
  const engine = useEngine()
  const [collapsed, setCollapsed] = useState(false)
  const [bgHex, setBgHex] = useState(() => `#${(engine.getBackgroundColor?.() ?? 0x111111).toString(16).padStart(6,'0')}`)
  const [previewQ, setPreviewQ] = useState(() => engine.getPreviewQuality?.() ?? 1)
  const [renderScale, setRenderScale] = useState(() => (engine as any).getRendererResolution?.() ?? 1)
  const [lowLatency, setLowLatency] = useState(() => (engine as any).getLowLatencyMode?.() ?? false)
  const [stylusOnly, setStylusOnly] = useState(() => (engine as any).getStylusOnly?.() ?? false)

  const onBg = (hex:string) => { setBgHex(hex); const n = parseInt(hex.replace('#',''),16)>>>0; engine.setBackgroundColor?.(n) }
  const onPreviewQ = (v:number) => { setPreviewQ(v); engine.setPreviewQuality?.(v) }
  const onRenderScale = (v:number) => { setRenderScale(v); (engine as any).setRendererResolution?.(v) }
  const onLowLat = (on:boolean) => { setLowLatency(on); (engine as any).setLowLatencyMode?.(on) }
  const onStylusOnly = (on:boolean) => { setStylusOnly(on); (engine as any).setStylusOnly?.(on) }

  return (
  <div className="absolute top-4 right-4 z-[9999] pointer-events-auto bg-white text-gray-900 border border-gray-300 rounded-lg shadow-md p-2 w-[340px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1">
        <button
          aria-label={collapsed ? 'Expandir' : 'Contraer'}
          onClick={() => setCollapsed(v=>!v)}
          className="p-1.5 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-300"
        >
          <Settings2 size={18} />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-2 grid gap-2">
          {/* Fondo */}
          <div className="flex items-center gap-2" title="Color de fondo">
            <Droplet size={16} className="opacity-80" />
            <span className="text-xs text-gray-700">Fondo</span>
            <input type="color" value={bgHex} onChange={e=>onBg(e.target.value)} className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0" />
          </div>

          {/* Preview quality */}
          <div className="flex items-center gap-2" title="Calidad de preview">
            <SlidersVertical size={16} className="opacity-80" />
            <span className="text-xs text-gray-700">Preview</span>
            <input type="range" min={0} max={1} step={0.01} value={previewQ} onChange={e=>onPreviewQ(Number(e.target.value))} className="w-44 accent-blue-500" />
          </div>

          {/* Render scale y low latency */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2" title="Escala de render">
              <Maximize2 size={16} className="opacity-80" />
              <span className="text-xs text-gray-700">Escala</span>
              <input type="range" min={0.5} max={2} step={0.1} value={renderScale} onChange={e=>onRenderScale(Number(e.target.value))} className="w-40 accent-blue-500" />
            </div>
            <div className="ml-auto flex items-center gap-2" title="Baja latencia">
              <input type="checkbox" checked={lowLatency} onChange={e=>onLowLat(e.target.checked)} />
              <span className="text-xs text-gray-700">Latencia</span>
              <Zap size={14} className="opacity-80" />
            </div>
          </div>

          {/* Stylus-only drawing (palm rejection) */}
          <div className="flex items-center gap-2" title="Solo Stylus (rechazo de palma)">
            <label className="flex items-center gap-2 text-sm select-none">
              <input type="checkbox" checked={stylusOnly} onChange={e=>onStylusOnly(e.target.checked)} />
              <span className="text-xs text-gray-700">Solo Stylus</span>
            </label>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-1" title="Presets">
            <span className="text-xs text-gray-700 mr-1">Presets</span>
            <button aria-label="Performance" title="Performance" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('performance')}}>
              <Rocket size={16} />
            </button>
            <button aria-label="Quality" title="Quality" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('quality')}}>
              <Sparkles size={16} />
            </button>
            <button aria-label="Auto" title="Auto" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('adaptive')}}>
              <Wand2 size={16} />
            </button>
            <button aria-label="Default" title="Default" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('default')}}>
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
