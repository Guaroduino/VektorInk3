import React, { useEffect, useState } from 'react'
import { useEngine } from './EngineContext'
import { Activity, PanelLeftClose, PanelLeftOpen, Settings2, SlidersVertical, Palette, Droplet, Zap } from 'lucide-react'

export const MiniToolbar: React.FC = () => {
  const engine = useEngine()
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [activeIsRope, setActiveIsRope] = useState(() => engine.getActiveTool?.() === 'rope')

  // Globals
  const [size, setSize] = useState(() => engine.getStrokeSize?.() ?? 8)
  const [strokeHex, setStrokeHex] = useState(() => `#${(engine.getStrokeColor?.() ?? 0xffffff).toString(16).padStart(6, '0')}`)
  const [bgHex, setBgHex] = useState(() => `#${(engine.getBackgroundColor?.() ?? 0x111111).toString(16).padStart(6, '0')}`)
  const [opacity, setOpacity] = useState(() => engine.getOpacity?.() ?? 1)
  const [blend, setBlend] = useState(() => engine.getBlendMode?.() ?? 'normal')
  const [previewQ, setPreviewQ] = useState(() => engine.getPreviewQuality?.() ?? 1.0)
  const [renderScale, setRenderScale] = useState(() => (engine as any).getRendererResolution?.() ?? 1)
  const [lowLatency, setLowLatency] = useState(() => (engine as any).getLowLatencyMode?.() ?? false)

  // Ensure Rope is the starting tool in UI
  useEffect(() => {
    try {
      engine.setActiveTool?.('rope')
      setActiveIsRope(true)
    } catch {}
  }, [])

  const pickRope = () => {
    engine.setActiveTool?.('rope')
    setActiveIsRope(true)
  }

  // Handlers
  const onSizeChange = (v: number) => { setSize(v); engine.setStrokeSize?.(v) }
  const onStrokeHexChange = (hex: string) => { setStrokeHex(hex); const n = parseInt(hex.replace('#',''),16)>>>0; engine.setStrokeColor?.(n) }
  const onBgHexChange = (hex: string) => { setBgHex(hex); const n = parseInt(hex.replace('#',''),16)>>>0; engine.setBackgroundColor?.(n) }
  const onOpacityChange = (v: number) => { setOpacity(v); engine.setOpacity?.(v) }
  const onBlendChange = (mode: string) => { setBlend(mode); engine.setBlendMode?.(mode) }
  const onPreviewQChange = (v: number) => { setPreviewQ(v); engine.setPreviewQuality?.(v) }

  return (
    <div
      className="absolute top-4 left-4 z-[9999] pointer-events-auto bg-white text-gray-900 border border-gray-300 rounded-lg shadow-md p-2"
      style={{ position: 'absolute', top: 16, left: 16, zIndex: 9999 }}
    >
      {/* Top row: collapse, rope tool, settings toggle */}
  <div className="flex items-center gap-2">
        <button
          aria-label={collapsed ? 'Expandir' : 'Contraer'}
          title={collapsed ? 'Expandir' : 'Contraer'}
          onClick={() => setCollapsed(v => !v)}
          className="p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-300"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <button
          onClick={pickRope}
          data-active={activeIsRope}
          title="SimpleRope"
          className="p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white border border-gray-300"
        >
          <Activity size={18} />
        </button>

        <button
          onClick={() => setSettingsOpen(v => !v)}
          title={settingsOpen ? 'Ocultar ajustes' : 'Mostrar ajustes'}
          className="p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-300"
        >
          <Settings2 size={18} />
        </button>
      </div>

      {/* Settings panel */}
      {!collapsed && settingsOpen && (
        <div className="mt-2 p-3 w-[320px] grid gap-2">
          {/* Tamaño */}
          <label className="flex items-center gap-2">
            <SlidersVertical size={16} className="opacity-80" />
            <input type="range" min={1} max={64} step={1} value={size} onChange={e=>onSizeChange(Number(e.target.value))} className="w-40 accent-blue-500" />
            <span className="text-xs tabular-nums w-8 text-right opacity-80">{size}</span>
          </label>

          {/* Colores */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <Palette size={16} className="opacity-80" />
              <input type="color" value={strokeHex} onChange={e=>onStrokeHexChange(e.target.value)} className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0" />
              <span className="text-xs opacity-80">Trazo</span>
            </label>
            <label className="flex items-center gap-2 ml-auto">
              <Droplet size={16} className="opacity-80" />
              <input type="color" value={bgHex} onChange={e=>onBgHexChange(e.target.value)} className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0" />
              <span className="text-xs opacity-80">Fondo</span>
            </label>
          </div>

          {/* Fusión y opacidad */}
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-80">Fusión</span>
            <select value={blend} onChange={e=>onBlendChange(e.target.value)} className="bg-white text-sm rounded-md px-2 py-1 border border-gray-300">
              <option value="normal">Normal</option>
              <option value="add">Add</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
            </select>
            <span className="text-xs opacity-80 ml-auto">Opacidad</span>
            <input type="range" min={0.05} max={1} step={0.01} value={opacity} onChange={e=>onOpacityChange(Number(e.target.value))} className="w-28 accent-blue-500" />
            <span className="text-xs tabular-nums w-10 text-right opacity-80">{Math.round(opacity*100)}%</span>
          </div>

          {/* Preview quality */}
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-80 w-24">Preview Quality</span>
            <input type="range" min={0} max={1} step={0.01} value={previewQ} onChange={e=>onPreviewQChange(Number(e.target.value))} className="w-40 accent-blue-500" />
            <span className="text-xs tabular-nums w-10 text-right opacity-80">{Math.round(previewQ*100)}%</span>
          </div>

          {/* Renderer scale + Low latency */}
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-80 w-24">Render Scale</span>
            <input type="range" min={0.5} max={2} step={0.1} value={renderScale} onChange={e=>{const v=Number(e.target.value); setRenderScale(v); (engine as any).setRendererResolution?.(v)}} className="w-32 accent-blue-500" />
            <span className="text-xs tabular-nums w-10 text-right opacity-80">{renderScale.toFixed(1)}x</span>
            <label className="ml-auto flex items-center gap-2 text-xs">
              <input type="checkbox" checked={lowLatency} onChange={e=>{const on=e.target.checked; setLowLatency(on); (engine as any).setLowLatencyMode?.(on)}} />
              <Zap size={14} className="opacity-80" /> Low latency
            </label>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-80">Presets</span>
            <button className="px-2 py-1 text-xs rounded-md border border-green-400 bg-green-100 hover:bg-green-200" onClick={()=>{(engine as any).applyPreset?.('performance')}}>
              Performance
            </button>
            <button className="px-2 py-1 text-xs rounded-md border border-blue-400 bg-blue-100 hover:bg-blue-200" onClick={()=>{(engine as any).applyPreset?.('quality')}}>
              Quality
            </button>
            <button className="px-2 py-1 text-xs rounded-md border border-purple-400 bg-purple-100 hover:bg-purple-200" onClick={()=>{(engine as any).applyPreset?.('adaptive')}}>
              Auto
            </button>
            <button className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('default')}}>
              Default
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
