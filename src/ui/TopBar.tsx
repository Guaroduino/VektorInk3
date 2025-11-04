import React, { useEffect, useRef, useState } from 'react'
import { useEngine } from './EngineContext'
import { Activity, Settings2, SlidersVertical, Palette, Droplet, Maximize2, Zap, Square, Plus, X, Sun, Rocket, Sparkles, Wand2, RotateCcw, MousePointer2 } from 'lucide-react'

/**
 * TopBar: barra superior continua con:
 * - Izquierda: botones de herramientas (por ahora SimpleRope). Click selecciona herramienta; long-press abre menú de parámetros locales.
 * - Derecha: botón para desplegar menú de parámetros globales.
 */
export const TopBar: React.FC = () => {
  const engine = useEngine()
  const barRef = useRef<HTMLDivElement | null>(null)
  const [openGlobal, setOpenGlobal] = useState(false)
  const [openRope, setOpenRope] = useState(false)
  // Center presets
  const [colorPresets, setColorPresets] = useState<number[]>([0xffffff, 0x000000, 0xff4d4d, 0x00c2ff])
  const [sizePresets, setSizePresets] = useState<number[]>([4, 8, 12, 20])
  const colorInputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const [editingSizeIdx, setEditingSizeIdx] = useState<number | null>(null)
  const [editingSizeVal, setEditingSizeVal] = useState<number>(8)

  // Local state (aplica via engine)
  const [size, setSize] = useState(() => engine.getStrokeSize?.() ?? 8)
  const [strokeHex, setStrokeHex] = useState(() => `#${(engine.getStrokeColor?.() ?? 0xffffff).toString(16).padStart(6,'0')}`)
  const [blend, setBlend] = useState(() => engine.getBlendMode?.() ?? 'normal')
  const [opacity, setOpacity] = useState(() => engine.getOpacity?.() ?? 1)
  const [pressure, setPressure] = useState(() => engine.getPressureSensitivity?.() ?? true)

  // Global state
  const [bgHex, setBgHex] = useState(() => `#${(engine.getBackgroundColor?.() ?? 0x111111).toString(16).padStart(6,'0')}`)
  const [previewQ, setPreviewQ] = useState(() => engine.getPreviewQuality?.() ?? 1)
  const [renderScale, setRenderScale] = useState(() => (engine as any).getRendererResolution?.() ?? 1)
  const [lowLatency, setLowLatency] = useState(() => (engine as any).getLowLatencyMode?.() ?? false)

  // Outside click to close popovers
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!barRef.current) return
      if (!barRef.current.contains(e.target as Node)) {
        setOpenGlobal(false); setOpenRope(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Tool: SimpleRope button interactions (long-press)
  const lpTimer = useRef<number | null>(null)
  const lpTriggered = useRef(false)
  const LP_MS = 450
  const onRopeDown = () => {
    lpTriggered.current = false
    if (lpTimer.current) window.clearTimeout(lpTimer.current)
    lpTimer.current = window.setTimeout(() => { lpTriggered.current = true; setOpenRope(true) }, LP_MS)
  }
  const onRopeUp = () => {
    if (lpTimer.current) { window.clearTimeout(lpTimer.current); lpTimer.current = null }
    // Short click => select tool
    if (!lpTriggered.current) {
      engine.setActiveTool?.('rope')
      setOpenRope(false)
    }
  }
  const onRopeLeave = () => { if (lpTimer.current) { window.clearTimeout(lpTimer.current); lpTimer.current = null } }

  // Handlers local
  const onSize = (v:number) => { setSize(v); engine.setStrokeSize?.(v) }
  const onStroke = (hex:string) => { setStrokeHex(hex); const n = parseInt(hex.replace('#',''),16)>>>0; engine.setStrokeColor?.(n) }
  const onBlendChange = (v:string) => { setBlend(v); engine.setBlendMode?.(v) }
  const onOpacity = (v:number) => { setOpacity(v); engine.setOpacity?.(v) }
  const onPressure = (on:boolean) => { setPressure(on); engine.setPressureSensitivity?.(on) }

  // Handlers global
  const onBg = (hex:string) => { setBgHex(hex); const n=parseInt(hex.replace('#',''),16)>>>0; engine.setBackgroundColor?.(n) }
  const onPreview = (v:number) => { setPreviewQ(v); engine.setPreviewQuality?.(v) }
  const onScale = (v:number) => { setRenderScale(v); (engine as any).setRendererResolution?.(v) }
  const onLowLat = (on:boolean) => { setLowLatency(on); (engine as any).setLowLatencyMode?.(on) }

  return (
    <div ref={barRef} className="absolute top-0 left-0 right-0 z-[9999] pointer-events-auto">
      {/* Bar container */}
      <div className="mx-4 mt-3 bg-white text-gray-900 border border-gray-300 rounded-lg shadow-md px-2 h-10 flex items-center">
        {/* Left: tools */}
        <div className="flex items-center gap-1">
          {/* SimpleRope tool */}
          <button
            aria-label="SimpleRope"
            onMouseDown={onRopeDown}
            onMouseUp={onRopeUp}
            onMouseLeave={onRopeLeave}
            onTouchStart={onRopeDown}
            onTouchEnd={onRopeUp}
            className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100"
            title="SimpleRope (click) • Ajustes (mantener)"
          >
            <Activity size={18} />
          </button>
        </div>
        {/* Center: presets */}
        <div className="flex-1 flex items-center justify-center gap-3">
          {/* Color presets */}
          <div className="flex items-center gap-1">
            {colorPresets.map((c, i) => (
              <div key={i} className="relative">
                <button
                  aria-label={`Color ${i+1}`}
                  onClick={() => { engine.setStrokeColor?.(c) }}
                  onDoubleClick={() => { try { colorInputs[i].current?.click() } catch {} }}
                  className="h-6 w-6 rounded-md border border-gray-400"
                  style={{ backgroundColor: `#${(c>>>0).toString(16).padStart(6,'0')}` }}
                  title="Click: usar color • Doble click: editar"
                />
                {/* Hidden color input to edit preset */}
                <input ref={colorInputs[i]} type="color" defaultValue={`#${(c>>>0).toString(16).padStart(6,'0')}`}
                  onChange={(e)=>{
                    const hex = e.target.value
                    const n = parseInt(hex.replace('#',''),16)>>>0
                    setColorPresets(prev => prev.map((v,idx)=> idx===i ? n : v))
                    engine.setStrokeColor?.(n)
                  }}
                  className="absolute opacity-0 pointer-events-none -z-10"
                />
              </div>
            ))}
          </div>
          {/* Size presets */}
          <div className="flex items-center gap-1">
            {sizePresets.map((s, i) => (
              <div key={i} className="relative">
                {editingSizeIdx === i ? (
                  <input type="number" min={1} max={128} step={1} value={editingSizeVal}
                    onChange={(e)=> setEditingSizeVal(Math.max(1, Math.min(128, Number(e.target.value)||1)))}
                    onBlur={()=>{ const v=editingSizeVal|0; setSizePresets(prev=> prev.map((x,idx)=> idx===i? v : x)); engine.setStrokeSize?.(v); setEditingSizeIdx(null) }}
                    onKeyDown={(e)=>{ if(e.key==='Enter'){ (e.target as HTMLInputElement).blur() } else if(e.key==='Escape'){ setEditingSizeIdx(null) } }}
                    className="w-14 h-6 text-xs px-1 border border-gray-300 rounded-md"
                    autoFocus
                  />
                ) : (
                  <button
                    aria-label={`Size ${s}px`}
                    onClick={() => { engine.setStrokeSize?.(s); setSize(s) }}
                    onDoubleClick={() => { setEditingSizeIdx(i); setEditingSizeVal(s) }}
                    className="h-6 px-2 text-xs rounded-md border border-gray-300 hover:bg-gray-100"
                    title="Click: usar tamaño • Doble click: editar"
                  >{s}px</button>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Right: global settings button */}
        <div className="flex items-center gap-1">
          <button
            aria-label="Global settings"
            onClick={() => { setOpenGlobal(v=>!v); setOpenRope(false) }}
            className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100"
            title="Ajustes globales"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      {/* Rope popover (left aligned under bar) */}
      {openRope && (
        <div className="absolute left-4 top-[56px] bg-white text-gray-900 border border-gray-300 rounded-lg shadow-lg p-3 w-[320px]">
          <div className="grid gap-2">
            <div className="flex items-center gap-2" title="Tamaño">
              <SlidersVertical size={16} className="opacity-80" />
              <input type="range" min={1} max={64} step={1} value={size} onChange={e=>onSize(Number(e.target.value))} className="w-48 accent-blue-500" />
            </div>
            <div className="flex items-center gap-2" title="Color de trazo">
              <Palette size={16} className="opacity-80" />
              <input type="color" value={strokeHex} onChange={e=>onStroke(e.target.value)} className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0" />
            </div>
            <div className="flex items-center gap-2" title="Blend mode">
              <button aria-label="Normal" onClick={()=>onBlendChange('normal')} data-active={blend==='normal'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><Square size={16}/></button>
              <button aria-label="Add" onClick={()=>onBlendChange('add')} data-active={blend==='add'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><Plus size={16}/></button>
              <button aria-label="Multiply" onClick={()=>onBlendChange('multiply')} data-active={blend==='multiply'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><X size={16}/></button>
              <button aria-label="Screen" onClick={()=>onBlendChange('screen')} data-active={blend==='screen'} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white"><Sun size={16}/></button>
              <div className="ml-auto flex items-center gap-2" title="Opacidad">
                <Droplet size={16} className="opacity-80" />
                <input type="range" min={0.05} max={1} step={0.01} value={opacity} onChange={e=>onOpacity(Number(e.target.value))} className="w-28 accent-blue-500" />
              </div>
            </div>
            <div className="flex items-center gap-2" title="Presión (tablet)">
              <input type="checkbox" checked={pressure} onChange={e=>onPressure(e.target.checked)} />
              <MousePointer2 size={16} className="opacity-80" />
            </div>
          </div>
        </div>
      )}

      {/* Global popover (right aligned under bar) */}
      {openGlobal && (
        <div className="absolute right-4 top-[56px] bg-white text-gray-900 border border-gray-300 rounded-lg shadow-lg p-3 w-[360px]">
          <div className="grid gap-2">
            <div className="flex items-center gap-2" title="Color de fondo">
              <Droplet size={16} className="opacity-80" />
              <input type="color" value={bgHex} onChange={e=>onBg(e.target.value)} className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0" />
            </div>
            <div className="flex items-center gap-2" title="Preview Quality">
              <SlidersVertical size={16} className="opacity-80" />
              <input type="range" min={0} max={1} step={0.01} value={previewQ} onChange={e=>onPreview(Number(e.target.value))} className="w-52 accent-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2" title="Render Scale">
                <Maximize2 size={16} className="opacity-80" />
                <input type="range" min={0.5} max={2} step={0.1} value={renderScale} onChange={e=>onScale(Number(e.target.value))} className="w-40 accent-blue-500" />
              </div>
              <div className="ml-auto flex items-center gap-2" title="Low latency">
                <input type="checkbox" checked={lowLatency} onChange={e=>onLowLat(e.target.checked)} />
                <Zap size={14} className="opacity-80" />
              </div>
            </div>
            <div className="flex items-center gap-1" title="Presets">
              <button aria-label="Performance" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('performance')}}>
                <Rocket size={16} />
              </button>
              <button aria-label="Quality" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('quality')}}>
                <Sparkles size={16} />
              </button>
              <button aria-label="Auto" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('adaptive')}}>
                <Wand2 size={16} />
              </button>
              <button aria-label="Default" className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100" onClick={()=>{(engine as any).applyPreset?.('default')}}>
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
