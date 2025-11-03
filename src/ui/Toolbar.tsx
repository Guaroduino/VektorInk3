import React, { useEffect, useState } from 'react'
import { useEngine } from './EngineContext'
import { Pen, MousePointer2, Brush, Eraser, PanelLeftClose, PanelLeftOpen, Palette, Droplet, SlidersVertical, RotateCcw, RotateCw, Trash2, Zap } from 'lucide-react'
import type { ToolKey } from '../VektorEngine'

// Mantener los nombres de herramienta en línea con VektorEngine
type ToolName = ToolKey // 'pluma' | 'vpen' | 'raster' | 'contorno'

// Configuración visual de la barra
const tools: { name: ToolName; icon: React.ReactNode; label: string }[] = [
  { name: 'pluma', icon: <Pen size={20} />, label: 'Pluma' },
  { name: 'vpen', icon: <MousePointer2 size={20} />, label: 'Vector' },
  { name: 'raster', icon: <Brush size={20} />, label: 'Raster' },
  { name: 'contorno', icon: <Eraser size={20} />, label: 'Contorno' },
  { name: 'ultra', icon: <Zap size={20} />, label: 'Ultra' },
]

export const Toolbar: React.FC = () => {
  const engine = useEngine()
  const [activeTool, setActiveTool] = useState<ToolName>(() => engine.getActiveTool() as ToolName)
  const [collapsed, setCollapsed] = useState(false)
  const [size, setSize] = useState(() => engine.getStrokeSize?.() ?? 8)
  const [strokeHex, setStrokeHex] = useState(() => `#${(engine.getStrokeColor?.() ?? 0xffffff).toString(16).padStart(6, '0')}`)
  const [bgHex, setBgHex] = useState(() => `#${(engine.getBackgroundColor?.() ?? 0x111111).toString(16).padStart(6, '0')}`)
  const [opacity, setOpacity] = useState(() => engine.getOpacity?.() ?? 1)
  const [blend, setBlend] = useState(() => engine.getBlendMode?.() ?? 'normal')
  const [fh, setFh] = useState(() => engine.getFreehandParams?.() ?? { thinning: 0.6, smoothing: 0.6, streamline: 0.5 })
  const [pressureEnabled, setPressureEnabled] = useState(() => engine.getPressureSensitivity?.() ?? true)
  const [jitter, setJitter] = useState(() => engine.getJitterParams?.() ?? { amplitude: 0, frequency: 0.005, domain: 'distance' as 'distance' | 'time' })
  const [previewQ, setPreviewQ] = useState(() => engine.getPreviewQuality?.() ?? 0.8)
  const [canUndo, setCanUndo] = useState(() => (engine as any).canUndo?.() ?? false)
  const [canRedo, setCanRedo] = useState(() => (engine as any).canRedo?.() ?? false)
  const [lowLatency, setLowLatency] = useState(() => (engine as any).getLowLatencyMode?.() ?? false)
  const [fps, setFps] = useState<number>(() => (engine as any).getFps?.() ?? 0)
  const [renderScale, setRenderScale] = useState<number>(() => (engine as any).getRendererResolution?.() ?? 1)
  const [aaPref, setAaPref] = useState<boolean>(() => {
    try { return localStorage.getItem('vi.renderer.antialias') === 'true' } catch { return false }
  })

  const refreshFromEngine = () => {
    setActiveTool(engine.getActiveTool() as ToolName)
    setSize(engine.getStrokeSize?.() ?? 8)
    setStrokeHex(`#${(engine.getStrokeColor?.() ?? 0xffffff).toString(16).padStart(6, '0')}`)
    setBgHex(`#${(engine.getBackgroundColor?.() ?? 0x111111).toString(16).padStart(6, '0')}`)
    setOpacity(engine.getOpacity?.() ?? 1)
    setBlend(engine.getBlendMode?.() ?? 'normal')
    setFh(engine.getFreehandParams?.() ?? { thinning: 0.6, smoothing: 0.6, streamline: 0.5 })
    setPressureEnabled(engine.getPressureSensitivity?.() ?? true)
    setJitter(engine.getJitterParams?.() ?? { amplitude: 0, frequency: 0.005, domain: 'distance' })
    setPreviewQ(engine.getPreviewQuality?.() ?? 1.0)
    setLowLatency((engine as any).getLowLatencyMode?.() ?? false)
    setRenderScale((engine as any).getRendererResolution?.() ?? 1)
    setCanUndo((engine as any).canUndo?.() ?? false)
    setCanRedo((engine as any).canRedo?.() ?? false)
  }

  const handleToolClick = (toolName: ToolName) => {
    engine.setActiveTool(toolName)
    setActiveTool(toolName)
  }

  const onSizeChange = (v: number) => {
    setSize(v)
    engine.setStrokeSize?.(v)
  }
  const onStrokeHexChange = (hex: string) => {
    setStrokeHex(hex)
    const n = parseInt(hex.replace('#', ''), 16) >>> 0
    engine.setStrokeColor?.(n)
  }
  const onBgHexChange = (hex: string) => {
    setBgHex(hex)
    const n = parseInt(hex.replace('#', ''), 16) >>> 0
    engine.setBackgroundColor?.(n)
  }
  const onOpacityChange = (v: number) => {
    setOpacity(v)
    engine.setOpacity?.(v)
  }
  const onBlendChange = (mode: string) => {
    setBlend(mode)
    engine.setBlendMode?.(mode)
  }
  const onFhChange = (key: 'thinning' | 'smoothing' | 'streamline', v: number) => {
    const next = { ...fh, [key]: v }
    setFh(next)
    engine.setFreehandParams?.(next)
  }

  const onPressureToggle = (v: boolean) => {
    setPressureEnabled(v)
    engine.setPressureSensitivity?.(v)
  }

  const onJitterChange = (key: 'amplitude' | 'frequency', v: number) => {
    const next = { ...jitter, [key]: v }
    setJitter(next)
    engine.setJitterParams?.(next)
  }
  const onJitterDomainToggle = (distanceBased: boolean) => {
    const domain: 'distance' | 'time' = distanceBased ? 'distance' : 'time'
    const next = { ...jitter, domain }
    setJitter(next)
    engine.setJitterParams?.(next)
  }

  const onPreviewQChange = (v: number) => {
    setPreviewQ(v)
    engine.setPreviewQuality?.(v)
  }

  // Mantener la UI en sync cuando se usa el teclado (1-4)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5') {
        setActiveTool(engine.getActiveTool() as ToolName)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const off = (engine as any).onHistoryChange?.(() => {
      setCanUndo((engine as any).canUndo?.() ?? false)
      setCanRedo((engine as any).canRedo?.() ?? false)
    })
    const offFps = (engine as any).onFps?.((val: number) => setFps(val))
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      try { off?.() } catch {}
      try { offFps?.() } catch {}
    }
  }, [engine])

  return (
    <div
      className="
        absolute top-4 left-4 z-[9999]
        flex flex-col gap-1 p-2 select-none
        bg-white text-gray-900
        border border-gray-300
        rounded-lg shadow-md
        pointer-events-auto
      "
      style={{ position: 'absolute', top: 16, left: 16, zIndex: 9999, pointerEvents: 'auto', backgroundColor: '#fff' }}
    >
      {/* Toggle de colapso */}
      <button
        aria-label={collapsed ? 'Expandir barra de herramientas' : 'Contraer barra de herramientas'}
        title={collapsed ? 'Expandir' : 'Contraer'}
        onClick={() => setCollapsed((v) => !v)}
        className="p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors border border-gray-300"
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      {/* Botones de herramientas (solo visibles cuando no está colapsado) */}
      {!collapsed && tools.map((tool) => (
        <button
          key={tool.name}
          onClick={() => handleToolClick(tool.name)}
          data-active={activeTool === tool.name}
          className="
            p-2 rounded-md text-gray-700
            transition-colors duration-100 ease-in-out
            hover:bg-gray-100 hover:text-gray-900
            data-[active=true]:bg-blue-600 data-[active=true]:text-white
          "
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}

      {/* Undo / Redo / Clear */}
      {!collapsed && (
        <div className="mt-1 flex gap-1">
          {/* FPS Indicator */}
          <div
            className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-gray-50 text-gray-700"
            title="Estimated frames per second"
          >
            FPS {Math.round(fps).toString().padStart(2, ' ')}
          </div>
          <button
            onClick={() => (engine as any).undo?.()}
            disabled={!canUndo}
            className="p-2 rounded-md border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
            title="Deshacer (Ctrl+Z)"
          >
            <RotateCcw size={18} />
          </button>
          <button
            onClick={() => (engine as any).redo?.()}
            disabled={!canRedo}
            className="p-2 rounded-md border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
            title="Rehacer (Ctrl+Y o Ctrl+Shift+Z)"
          >
            <RotateCw size={18} />
          </button>
          <button
            onClick={() => (engine as any).clearCanvas?.()}
            className="p-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
            title="Limpiar lienzo (Ctrl+K)"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}

      {/* Controles de tamaño y color */}
      {!collapsed && (
        <div className="mt-1 grid gap-1.5">
          {/* Tamaño */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-md p-2 border border-gray-200">
            <SlidersVertical size={16} className="shrink-0 opacity-80" />
            <input
              type="range"
              min={1}
              max={64}
              step={1}
              value={size}
              onChange={(e) => onSizeChange(Number(e.target.value))}
              className="w-28 accent-blue-500"
              title={`Tamaño: ${size}px`}
            />
            <span className="text-xs tabular-nums w-8 text-right opacity-80">{size}</span>
          </div>

          {/* Color de trazo */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-md p-2 border border-gray-200">
            <Palette size={16} className="shrink-0 opacity-80" />
            <input
              type="color"
              value={strokeHex}
              onChange={(e) => onStrokeHexChange(e.target.value)}
              className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0"
              title="Color de trazo"
            />
            <span className="text-xs opacity-80">Trazo</span>
          </div>

          {/* Color de fondo */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-md p-2 border border-gray-200">
            <Droplet size={16} className="shrink-0 opacity-80" />
            <input
              type="color"
              value={bgHex}
              onChange={(e) => onBgHexChange(e.target.value)}
              className="h-7 w-7 rounded-md border border-gray-300 bg-transparent p-0"
              title="Color de fondo"
            />
            <span className="text-xs opacity-80">Fondo</span>
          </div>

          {/* Fusión y opacidad */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-md p-2 border border-gray-200">
            <span className="text-xs opacity-80 w-16">Fusión</span>
            <select
              value={blend}
              onChange={(e) => onBlendChange(e.target.value)}
              className="bg-white text-sm rounded-md px-2 py-1 border border-gray-300"
              title="Modo de fusión"
            >
              <option value="normal">Normal</option>
              <option value="add">Add</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
            </select>
            <span className="text-xs opacity-80 w-16 text-right">Opacidad</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="w-24 accent-blue-500"
              title={`Opacidad: ${(opacity * 100) | 0}%`}
            />
            <span className="text-xs tabular-nums w-10 text-right opacity-80">{Math.round(opacity * 100)}%</span>
          </div>

          {/* Parámetros Freehand */}
          <div className="flex flex-col gap-1.5 bg-gray-50 rounded-md p-2 border border-gray-200">
            <span className="text-xs opacity-80">Freehand</span>
            {/* Pressure sensitivity toggle */}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={pressureEnabled} onChange={(e) => onPressureToggle(e.target.checked)} />
              <span className="text-xs opacity-80">Presión (tablet)</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs w-16 opacity-80">Thinning</span>
              <input type="range" min={-1} max={1} step={0.01} value={fh.thinning}
                onChange={(e) => onFhChange('thinning', Number(e.target.value))}
                className="w-36 accent-blue-500" />
              <span className="text-xs tabular-nums w-12 text-right opacity-80">{fh.thinning.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs w-16 opacity-80">Smoothing</span>
              <input type="range" min={0} max={1} step={0.01} value={fh.smoothing}
                onChange={(e) => onFhChange('smoothing', Number(e.target.value))}
                className="w-36 accent-blue-500" />
              <span className="text-xs tabular-nums w-12 text-right opacity-80">{fh.smoothing.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs w-16 opacity-80">Streamline</span>
              <input type="range" min={0} max={1} step={0.01} value={fh.streamline}
                onChange={(e) => onFhChange('streamline', Number(e.target.value))}
                className="w-36 accent-blue-500" />
              <span className="text-xs tabular-nums w-12 text-right opacity-80">{fh.streamline.toFixed(2)}</span>
            </label>
            {/* Clarificación de efectos */}
            <div className="text-[10px] text-gray-500 leading-tight mt-1">
              <div><strong>Smoothing</strong>: suaviza cambios de grosor por velocidad y el jitter.</div>
              <div><strong>Streamline</strong>: suaviza la trayectoria (menos vibración) antes de generar el grosor.</div>
            </div>
          </div>

          {/* Jitter (ancho aleatorio) */}
          <div className="flex flex-col gap-1.5 bg-gray-50 rounded-md p-2 border border-gray-200">
            <span className="text-xs opacity-80">Width Jitter</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={jitter.domain === 'distance'} onChange={(e) => onJitterDomainToggle(e.target.checked)} />
              <span className="text-xs opacity-80" title="Distance: varía a lo largo del trazo. Time: varía con el tiempo.">Distance-based</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs w-16 opacity-80">Amount</span>
              <input type="range" min={0} max={0.8} step={0.01} value={jitter.amplitude}
                onChange={(e) => onJitterChange('amplitude', Number(e.target.value))}
                className="w-36 accent-blue-500" />
              <span className="text-xs tabular-nums w-12 text-right opacity-80">{jitter.amplitude.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs w-16 opacity-80">Freq</span>
              <input type="range" min={0} max={0.02} step={0.0005} value={jitter.frequency}
                onChange={(e) => onJitterChange('frequency', Number(e.target.value))}
                className="w-36 accent-blue-500" />
              <span className="text-xs tabular-nums w-28 text-right opacity-80">{jitter.frequency.toFixed(4)} {jitter.domain === 'distance' ? 'cyc/px' : 'cyc/ms'}</span>
            </label>
            <div className="text-[10px] text-gray-500 leading-tight mt-1">
              <div>El <strong>suavizado del jitter</strong> usa el control Freehand → Smoothing.</div>
            </div>
          </div>

          {/* Preview quality */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-md p-2 border border-gray-200">
            <span className="text-xs w-24 opacity-80" title="Afecta solo al preview: decimación del trazo y cadencia de teselado">Preview Quality</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={previewQ}
              onChange={(e) => onPreviewQChange(Number(e.target.value))}
              className="w-36 accent-blue-500"
            />
            <span className="text-xs tabular-nums w-10 text-right opacity-80">{Math.round(previewQ * 100)}%</span>
          </div>

          {/* Renderer scale (resolution) */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-md p-2 border border-gray-200">
            <span className="text-xs w-24 opacity-80" title="Escala interna del renderer. 1.0 = más rápido, 2.0 = más nítido.">Render Scale</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={renderScale}
              onChange={(e) => {
                const v = Number(e.target.value)
                setRenderScale(v)
                ;(engine as any).setRendererResolution?.(v)
                try { localStorage.setItem('vi.renderer.resolution', String(v)) } catch {}
              }}
              className="w-36 accent-blue-500"
            />
            <span className="text-xs tabular-nums w-10 text-right opacity-80">{renderScale.toFixed(1)}x</span>
          </div>

          {/* Latency Lab */}
          <div className="flex items-center gap-2 bg-yellow-50 rounded-md p-2 border border-yellow-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lowLatency}
                onChange={(e) => {
                  const on = e.target.checked
                  setLowLatency(on)
                  ;(engine as any).setLowLatencyMode?.(on)
                }}
              />
              <span className="text-xs opacity-80" title="Usa pointerrawupdate y acelera la cadencia del preview. Mejora la latencia percibida (consumo mayor).">Low latency (pen)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={aaPref}
                onChange={(e) => {
                  const v = e.target.checked
                  setAaPref(v)
                  try { localStorage.setItem('vi.renderer.antialias', v ? 'true' : 'false') } catch {}
                }}
              />
              <span className="text-xs opacity-80" title="MSAA del canvas (requiere reiniciar/recargar)">MSAA (restart)</span>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-gray-700">Scale {renderScale.toFixed(1)}x • MSAA {aaPref ? 'On' : 'Off'}</span>
              <button
                className="px-2 py-1 text-xs rounded-md border border-yellow-400 bg-yellow-100 hover:bg-yellow-200"
                onClick={() => { (engine as any).reloadRenderer?.({ antialias: aaPref, resolution: renderScale }); refreshFromEngine() }}
                title="Reinicia el renderer para aplicar MSAA y resolución actual"
              >Restart renderer now</button>
            </div>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-2 bg-green-50 rounded-md p-2 border border-green-300">
            <span className="text-xs opacity-80">Presets</span>
            <button
              className="px-2 py-1 text-xs rounded-md border border-green-400 bg-green-100 hover:bg-green-200"
              onClick={() => { (engine as any).applyPreset?.('performance'); refreshFromEngine() }}
              title="Optimiza para la menor latencia (resolución interna baja, preview rápido, suavizado reducido)"
            >Performance</button>
            <button
              className="px-2 py-1 text-xs rounded-md border border-blue-400 bg-blue-100 hover:bg-blue-200"
              onClick={() => { (engine as any).applyPreset?.('quality'); refreshFromEngine() }}
              title="Prioriza nitidez en desktop (sube resolución interna y suavizados moderados)"
            >Quality</button>
            <button
              className="px-2 py-1 text-xs rounded-md border border-purple-400 bg-purple-100 hover:bg-purple-200"
              onClick={() => { (engine as any).applyPreset?.('adaptive'); refreshFromEngine() }}
              title="Elige automáticamente según el dispositivo (móvil/táctil ⇒ Performance, desktop ⇒ Quality)"
            >Auto</button>
            <button
              className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-100"
              onClick={() => { (engine as any).applyPreset?.('default'); refreshFromEngine() }}
              title="Vuelve a los valores por defecto/balanceados"
            >Default</button>
          </div>
        </div>
      )}
    </div>
  )
}
