import React, { useEffect, useRef, useState } from 'react'
import { useEngine } from './EngineContext'
import { PencilLine, Settings2, SlidersVertical, Palette, Droplet, Maximize2, Zap, Square, Plus, X, Sun, Rocket, Sparkles, Wand2, RotateCcw, MousePointer2, Download, Upload, History, Trash2, RefreshCcw } from 'lucide-react'

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
  // Center presets (4 columnas: color arriba, tamaño abajo)
  const [colorPresets, setColorPresets] = useState<number[]>([0xffffff, 0x000000, 0xff4d4d, 0x00c2ff])
  const [sizePresets, setSizePresets] = useState<number[]>([4, 8, 12, 20])
  const colorInputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const [editingSizeIdx, setEditingSizeIdx] = useState<number | null>(null)
  const [editingSizeVal, setEditingSizeVal] = useState<number>(8)
  const sizeTimers = useRef<Record<number, number | null>>({})
  const sizeLPTrig = useRef<Record<number, boolean>>({})
  const colorTimers = useRef<Record<number, number | null>>({})
  const colorLPTrig = useRef<Record<number, boolean>>({})
  const sizeBtnRefs = useRef<Array<HTMLButtonElement | null>>([])
  const sizePopoverRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [autosaveEnabled, setAutosaveEnabled] = useState<boolean>(() => (engine as any).getAutosaveEnabled?.() ?? true)
  const [lastAutosaveAt, setLastAutosaveAt] = useState<string>(() => {
    try { const t = localStorage.getItem('vi.autosave.at'); return t ? new Date(parseInt(t,10)).toLocaleString() : '—' } catch { return '—' }
  })

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
    const onDoc = (e: PointerEvent) => {
      const target = e.target as Node
      if (!barRef.current) return
      // Click fuera de toda la barra: cierra todo
      if (!barRef.current.contains(target)) {
        setOpenGlobal(false); setOpenRope(false); setEditingSizeIdx(null)
        return
      }
      // Dentro de la barra: si hay slider abierto y el click no es en el botón activo ni en el popover, ciérralo
      if (editingSizeIdx !== null) {
        const btnEl = sizeBtnRefs.current[editingSizeIdx] || null
        const popEl = sizePopoverRef.current
        if (btnEl && btnEl.contains(target)) return
        if (popEl && popEl.contains(target)) return
        setEditingSizeIdx(null)
      }
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [editingSizeIdx])

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
  const onAutosaveToggle = (on: boolean) => { setAutosaveEnabled(on); (engine as any).setAutosaveEnabled?.(on) }
  const onRestoreAutosave = () => {
    const ok = (engine as any).restoreAutosave?.()
    // Refresh some local UI states that may have changed
    try {
      setBgHex(`#${((engine.getBackgroundColor?.() ?? 0x111111)>>>0).toString(16).padStart(6,'0')}`)
      const t = localStorage.getItem('vi.autosave.at'); if (t) setLastAutosaveAt(new Date(parseInt(t,10)).toLocaleString())
    } catch {}
    if (!ok) console.warn('[TopBar] restoreAutosave returned false')
  }

  // Update last autosave timestamp whenever the menu opens
  useEffect(() => {
    if (openGlobal) {
      try { const t = localStorage.getItem('vi.autosave.at'); setLastAutosaveAt(t ? new Date(parseInt(t,10)).toLocaleString() : '—') } catch {}
    }
  }, [openGlobal])

  // Export/Import handlers
  const onExport = () => {
    try {
      const data = (engine as any).exportProject?.()
      if (!data) return
      const json = JSON.stringify(data)
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')
      const defName = `vektorink-${ts}`
      let name = (window as any).prompt?.('Nombre del archivo (.json)', defName) as string | null
      if (!name || !name.trim()) name = defName
      // Sanear nombre para sistemas Windows/macOS
      name = name.replace(/[\\/:*?"<>|]+/g, '-').trim()
      if (!name.toLowerCase().endsWith('.json')) name = `${name}.json`
      a.download = name
      document.body.appendChild(a)
      a.click()
      setTimeout(()=>{ URL.revokeObjectURL(url); document.body.removeChild(a) }, 0)
    } catch (e) { console.warn('[Export] failed', e) }
  }
  const onImportClick = () => { try { importInputRef.current?.click() } catch {} }
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0]
      if (!file) return
      const text = await file.text()
      const data = JSON.parse(text)
      const ok = (engine as any).importProject?.(data)
      if (!ok) console.warn('[Import] engine rejected file')
    } catch (err) {
      console.warn('[Import] failed', err)
    } finally {
      try { e.target.value = '' } catch {}
    }
  }
  const onClearCanvas = () => {
    try {
      const yes = (window as any).confirm?.('¿Borrar todo el lienzo? Esta acción se puede deshacer con Undo.')
      if (!yes) return
      ;(engine as any).clearCanvas?.()
    } catch (e) { console.warn('[ClearCanvas] failed', e) }
  }
  const onResetApp = () => {
    const yes = (window as any).confirm?.('¿Reiniciar la app desde cero? Se borrará el autosave y se recargará la página.')
    if (!yes) return
    try {
      // Borrar autosave para arrancar en blanco (conserva la preferencia de autosave enabled)
      localStorage.removeItem('vi.autosave')
      localStorage.removeItem('vi.autosave.at')
    } catch {}
    try { window.location.reload() } catch {}
  }

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
            onDoubleClick={() => { if (lpTimer.current) { window.clearTimeout(lpTimer.current); lpTimer.current = null }; lpTriggered.current = true; setOpenRope(v=>!v); setOpenGlobal(false) }}
            className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100"
            title="SimpleRope (click) • Ajustes (mantener o doble click)"
          >
            <PencilLine size={18} />
          </button>
        </div>
        {/* Center: presets (dos grupos, alineados verticalmente) */}
        <div className="flex-1 flex items-center justify-center gap-4">
          {/* Grupo colores */}
          <div className="flex items-center gap-1">
            {colorPresets.map((c, i) => (
              <div key={`c-${i}`} className="relative inline-block">
                <button
                  aria-label={`Color ${i+1}`}
                  onClick={() => { engine.setStrokeColor?.(c); setStrokeHex(`#${(c>>>0).toString(16).padStart(6,'0')}`) }}
                  onDoubleClick={() => { try { colorInputs[i].current?.click() } catch {} }}
                  onMouseDown={() => { colorLPTrig.current[i]=false; if(colorTimers.current[i]) window.clearTimeout(colorTimers.current[i]!); colorTimers.current[i]=window.setTimeout(()=>{ colorLPTrig.current[i]=true; try { colorInputs[i].current?.click() } catch {} }, LP_MS) }}
                  onMouseUp={() => { if(colorTimers.current[i]){ window.clearTimeout(colorTimers.current[i]!); colorTimers.current[i]=null } }}
                  onMouseLeave={() => { if(colorTimers.current[i]){ window.clearTimeout(colorTimers.current[i]!); colorTimers.current[i]=null } }}
                  onTouchStart={() => { colorLPTrig.current[i]=false; if(colorTimers.current[i]) window.clearTimeout(colorTimers.current[i]!); colorTimers.current[i]=window.setTimeout(()=>{ colorLPTrig.current[i]=true; try { colorInputs[i].current?.click() } catch {} }, LP_MS) }}
                  onTouchEnd={() => { if(colorTimers.current[i]){ window.clearTimeout(colorTimers.current[i]!); colorTimers.current[i]=null } }}
                  className="h-6 w-6 rounded-md border border-gray-400"
                  style={{ backgroundColor: `#${(c>>>0).toString(16).padStart(6,'0')}` }}
                  title="Click: usar color • Doble click/long-press: editar"
                />
                <input ref={colorInputs[i]} type="color" defaultValue={`#${(c>>>0).toString(16).padStart(6,'0')}`}
                  onChange={(e)=>{
                    const hex = e.target.value
                    const n = parseInt(hex.replace('#',''),16)>>>0
                    setColorPresets(prev => prev.map((v,idx)=> idx===i ? n : v))
                    setStrokeHex(hex)
                    engine.setStrokeColor?.(n)
                  }}
                  className="absolute opacity-0 pointer-events-none -z-10"
                />
              </div>
            ))}
          </div>

          {/* Grupo tamaños */}
          <div className="flex items-center gap-1">
            {sizePresets.map((s, i) => (
              <div key={`s-${i}`} className="relative inline-block">
                <button
                  aria-label={`Size ${s}px`}
                  onClick={() => { engine.setStrokeSize?.(s); setSize(s); if (editingSizeIdx === i) setEditingSizeIdx(null) }}
                  onDoubleClick={() => { setEditingSizeIdx(i); setEditingSizeVal(s) }}
                  onMouseDown={() => { sizeLPTrig.current[i]=false; if(sizeTimers.current[i]) window.clearTimeout(sizeTimers.current[i]!); sizeTimers.current[i]=window.setTimeout(()=>{ sizeLPTrig.current[i]=true; setEditingSizeIdx(i); setEditingSizeVal(s) }, LP_MS) }}
                  onMouseUp={() => { if(sizeTimers.current[i]){ window.clearTimeout(sizeTimers.current[i]!); sizeTimers.current[i]=null } }}
                  onMouseLeave={() => { if(sizeTimers.current[i]){ window.clearTimeout(sizeTimers.current[i]!); sizeTimers.current[i]=null } }}
                  onTouchStart={() => { sizeLPTrig.current[i]=false; if(sizeTimers.current[i]) window.clearTimeout(sizeTimers.current[i]!); sizeTimers.current[i]=window.setTimeout(()=>{ sizeLPTrig.current[i]=true; setEditingSizeIdx(i); setEditingSizeVal(s) }, LP_MS) }}
                  onTouchEnd={() => { if(sizeTimers.current[i]){ window.clearTimeout(sizeTimers.current[i]!); sizeTimers.current[i]=null } }}
                  className="h-6 min-w-12 px-2 text-xs leading-none rounded-md border border-gray-300 hover:bg-gray-100 flex items-center justify-center"
                  title="Click: usar tamaño • Doble click/long-press: editar"
                  ref={(el)=>{ sizeBtnRefs.current[i]=el }}
                >{s}px</button>

                {editingSizeIdx === i && (
                  <div ref={sizePopoverRef} className="absolute top-9 left-1/2 -translate-x-1/2 bg-white border border-gray-300 rounded-md shadow-lg p-2 w-44 z-[10000]">
                    <div className="text-[11px] text-gray-700 mb-1">Tamaño: {editingSizeVal}px</div>
                    <input type="range" min={1} max={128} step={1} value={editingSizeVal}
                      onChange={(e)=>{ const v = Number(e.target.value)||1; setEditingSizeVal(v); engine.setStrokeSize?.(v) }}
                      className="w-full accent-blue-500"
                    />
                    {/* Cierra con click fuera o tocando el botón de tamaño nuevamente */}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
  {/* Right: guardar/cargar • fondo • botón ajustes globales */}
        <div className="flex items-center gap-1">
          <button
            aria-label="Guardar (.json)"
            onClick={onExport}
            className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100"
            title="Guardar (.json)"
          >
            <Download size={18} />
          </button>
          <div className="relative">
            <button
              aria-label="Cargar (.json)"
              onClick={onImportClick}
              className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100"
              title="Cargar (.json)"
            >
              <Upload size={18} />
            </button>
            <input ref={importInputRef} type="file" accept="application/json,.json" onChange={onImportFile} className="absolute opacity-0 pointer-events-none -z-10" />
          </div>
          <input
            type="color"
            value={bgHex}
            onChange={(e)=>onBg(e.target.value)}
            className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0"
            title="Color de fondo"
            aria-label="Color de fondo"
          />
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
            <div className="flex items-center gap-2" title="Autosave">
              <input type="checkbox" checked={autosaveEnabled} onChange={e=>onAutosaveToggle(e.target.checked)} />
              <span className="text-sm">Autosave</span>
              <div className="ml-auto flex items-center gap-2 text-[11px] text-gray-600">
                <History size={14} className="opacity-80" />
                <span>Último: {lastAutosaveAt}</span>
                <button className="ml-2 px-2 py-0.5 text-xs border border-gray-300 rounded-md hover:bg-gray-100" onClick={onRestoreAutosave}>Restaurar</button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1" title="Canvas">
              <span className="text-sm">Canvas</span>
              <div className="ml-auto flex items-center gap-2">
                <button className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-100 flex items-center gap-1" onClick={onClearCanvas}>
                  <Trash2 size={14} />
                  Limpiar
                </button>
                <button className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-100 flex items-center gap-1" onClick={onResetApp}>
                  <RefreshCcw size={14} />
                  Reiniciar
                </button>
              </div>
              
            </div>
            <div className="pl-6 pr-2 -mt-1 mb-1 text-[11px] text-gray-600">
              Reiniciar borra el autosave y recarga la app para empezar en blanco.
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
