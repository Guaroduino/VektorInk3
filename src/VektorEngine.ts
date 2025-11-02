import { Application, Container, Text } from 'pixi.js'
import { createInputCapture, type InputSample, type PointerPhase } from './input'
import { LayersManager as LayerManager } from './layers'
import { PlumaTool } from './tools/pluma'
import { PincelContornoTool } from './tools/pincelContorno'
import { LapizVectorTool } from './tools/lapizVector'
import { LapizRasterTool } from './tools/lapizRaster'
import { LayerBatch } from './graphics/LayerBatch'
import { HistoryManager } from './history'

export type ToolKey = 'pluma' | 'vpen' | 'raster' | 'contorno'

export class VektorEngine {
  private app: Application
  private world: Container
  private layers: LayerManager
  private inputCaptureDispose: (() => void) | null = null
  private _onSamplesBound?: (id: number, samples: InputSample[], phase: PointerPhase, rawEvent: PointerEvent) => void
  private removeKeydown?: () => void
  private removeKeyup?: () => void
  private removeWheel?: () => void
  private removeBeforeUnload?: () => void
  private mountEl: HTMLElement | null = null

  private tools: Record<ToolKey, any>
  private activeToolKey: ToolKey = 'vpen'
  private drawing = false
  private panMode = false
  private isPanningDrag = false
  private lastPanX = 0
  private lastPanY = 0
  private zoom = 1
  private isInitialized = false
  private layerBatches = new WeakMap<Container, LayerBatch>()
  private supportsUint32Indices: boolean = true
  private history = new HistoryManager(() => this._emitHistoryChange())
  private historyListeners = new Set<() => void>()
  // fps tracking
  private fps = 0
  private fpsListeners = new Set<(fps: number) => void>()
  private _fpsRafId: number | null = null
  private _fpsAccumMs = 0
  private _fpsFrames = 0
  private _fpsLastMs = 0

  // Estilo global configurable
  private strokeColor: number = 0xffffff
  private strokeSize: number = 8
  private backgroundColor: number = 0x111111
  private opacity: number = 1.0
  private blendMode: string = 'normal'
  // Preview quality (0..1): 1 = best (no decimation, fastest cadence), 0 = lowest (more decimation, slower cadence)
  private previewQuality: number = 1.0
  private freehand = {
    thinning: 0.6,
    // Reducir suavizados por defecto para minimizar coste y latencia
    smoothing: 0.3,
    streamline: 0.2,
  }
  // Pressure sensitivity enabled by default
  private pressureSensitivity: boolean = true
  // Jitter (width randomization)
  private jitter = {
    amplitude: 0,       // 0..1 fraction of width
    frequency: 0.005,   // cycles per pixel of arclength or per ms when time-based
    domain: 'distance' as 'distance' | 'time',
  }
  // Latency experiment flags
  private lowLatency: boolean = true
  private previewMinMsOverride: number | null = null
  private currentAA: boolean = false
  private overlayText: Text | null = null

  constructor() {
    // Núcleo Pixi (se termina de inicializar en init())
    this.app = new Application()
    this.world = new Container()
    // Añadimos world cuando stage esté listo; si ya lo está, se agrega ahora
    try {
      this.app.stage.addChild(this.world)
    } catch {}

    // Capas
    this.layers = new LayerManager(this.world)
    this.layers.create('Capa 1')

    // Herramientas
    this.tools = {
      pluma: new PlumaTool(),
      contorno: new PincelContornoTool(),
      vpen: new LapizVectorTool(),
      raster: new LapizRasterTool(),
    }

    // Propagar estilo inicial a todas las herramientas
    this.applyStyleToTools()

    // Limit history to 20 steps
    try { this.history.setLimit?.(20) } catch {}
  }

  private getActiveLayerNode() {
    return this.layers.active?.node ?? this.layers.list()[0]?.node ?? this.world
  }

  private getOrCreateBatch(layer: Container) {
    let b = this.layerBatches.get(layer)
    if (!b) { b = new LayerBatch(layer, this.supportsUint32Indices); this.layerBatches.set(layer, b) }
    return b
  }

  async init(container: HTMLElement) {
    if (this.isInitialized) return
    this.isInitialized = true
    this.mountEl = container

    // Tamaño inicial controlado por el contenedor React (no usar resizeTo)
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight

    // Read renderer preferences
    let prefAA = false
    try { const s = localStorage.getItem('vi.renderer.antialias'); if (s != null) prefAA = s === 'true' } catch {}
    let prefRes: number | null = null
    try { const s = localStorage.getItem('vi.renderer.resolution'); if (s != null) prefRes = Math.max(0.5, Math.min(4, parseFloat(s))) } catch {}

    await this.app.init({
      width,
      height,
      backgroundColor: this.backgroundColor as any,
      // MSAA toggleable via preference (requires renderer re-init to change later)
      antialias: prefAA,
      // Resolution: use preference if present, otherwise 1 (presets may change it after init)
      resolution: prefRes ?? 1,
      // Sugerir hacer uso de la GPU de alto rendimiento cuando sea posible
      powerPreference: 'high-performance' as any,
      // Evitar costos extra de preservación de buffer si el renderer lo respeta
      preserveDrawingBuffer: false as any,
    })
    this.currentAA = !!prefAA

    // Detect 32-bit index support (avoid geometry glitches on some mobile GPUs)
    try {
      const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = (this.app.renderer as any).gl
      this.supportsUint32Indices = !!(gl && ('OES_element_index_uint' in (gl as any).extensions || gl.getExtension('OES_element_index_uint')))
    } catch {
      this.supportsUint32Indices = true
    }

    // Asegurar jerarquía
    if (!this.world.parent) this.app.stage.addChild(this.world)

    // Montar canvas
    container.appendChild(this.app.canvas)
    // Create overlay watermark (Scale/MSAA) and start FPS loop
    try {
      if (!this.overlayText) {
        this.overlayText = new Text({
          text: '',
          style: { fill: 0xffffff as any, fontFamily: 'ui-sans-serif, system-ui, Arial', fontSize: 12 },
        })
        this.overlayText.alpha = 0.55
      }
      if (this.overlayText.parent !== this.app.stage) this.app.stage.addChild(this.overlayText)
      this._updateOverlay()
    } catch {}
    // Start FPS loop
    this._startFpsLoop()

    // Asegurar fondo también por CSS por compatibilidad
    try {
      ;(this.app.renderer as any).background.color = this.backgroundColor
    } catch {}
    ;(this.app.canvas as HTMLCanvasElement).style.backgroundColor = `#${this.backgroundColor
      .toString(16)
      .padStart(6, '0')}`

    // Aplicar preset adaptativo antes de configurar el input (override resolution only if no explicit preference)
    try {
      this.applyPreset('adaptive')
      if (prefRes != null) this.setRendererResolution(prefRes)
    } catch {}

  // Input de alta fidelidad directamente sobre el canvas
    this._onSamplesBound = this._onSamples.bind(this)
    const onSamples = this._onSamplesBound
    const cap = createInputCapture(this.app.canvas, onSamples as any, { relativeToTarget: true, usePointerRawUpdate: this.lowLatency })
    this.inputCaptureDispose = () => cap.dispose()
    // Zoom helpers
    // Inicializar helpers de zoom expuestos también como API pública
    // (Se implementan como métodos de instancia)
    
    // Atajos de teclado
    const onKeyDown = (e: KeyboardEvent) => {
  if ((e as any).repeat) return
  if (e.code === 'Digit1') this.activeToolKey = 'pluma'
      else if (e.code === 'Digit2') this.activeToolKey = 'vpen'
      else if (e.code === 'Digit3') this.activeToolKey = 'raster'
      else if (e.code === 'Digit4') this.activeToolKey = 'contorno'
      else if (e.code === 'KeyN') this.layers.create(`Capa ${this.layers.list().length + 1}`)
      else if (e.code === 'Delete') {
        const a = this.layers.active
        if (a) this.layers.remove(a.id)
      }
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoomIn()
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoomOut()
  else if (e.code === 'Digit0') this.zoomReset()
      // Undo / Redo
      else if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); this.undo() }
      else if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) { e.preventDefault(); this.redo() }
      // Clear canvas (Ctrl+K)
      else if (e.ctrlKey && !e.shiftKey && e.code === 'KeyK') { e.preventDefault(); this.clearCanvas() }
      else if (e.code === 'Space') {
        this.panMode = true
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.panMode = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    this.removeKeydown = () => window.removeEventListener('keydown', onKeyDown)
    this.removeKeyup = () => window.removeEventListener('keyup', onKeyUp)

    // Rueda (zoom focal)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = this.app.canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const delta = e.deltaY < 0 ? 1.1 : 0.9
      this.setZoom(this.zoom * delta, cx, cy)
    }
    this.app.canvas.addEventListener('wheel', onWheel, { passive: false })
    this.removeWheel = () => this.app.canvas.removeEventListener('wheel', onWheel)

    // Cleanup
    const onUnload = () => {
      this.dispose()
    }
    window.addEventListener('beforeunload', onUnload)
    this.removeBeforeUnload = () => window.removeEventListener('beforeunload', onUnload)
  }

  // Handler de muestras separado para poder reusar al reconfigurar input
  private _onSamples(_id: number, samples: InputSample[], phase: PointerPhase) {
      // Modo pan: usar drag para desplazar world
      if (this.panMode || this.isPanningDrag) {
        if (phase === 'start') {
          this.isPanningDrag = true
          this.lastPanX = samples[samples.length - 1]?.x ?? this.lastPanX
          this.lastPanY = samples[samples.length - 1]?.y ?? this.lastPanY
        } else if (phase === 'move' && this.isPanningDrag) {
          const s = samples[samples.length - 1]
          if (s) {
            const dx = s.x - this.lastPanX
            const dy = s.y - this.lastPanY
            this.world.position.x += dx
            this.world.position.y += dy
            this.lastPanX = s.x
            this.lastPanY = s.y
          }
        } else if (phase === 'end' || phase === 'cancel') {
          this.isPanningDrag = false
        }
        return
      }

      const layer = this.getActiveLayerNode()
      const tool = this.tools[this.activeToolKey]
      if (!tool) return

      // Remapear coords a espacio de mundo para respetar pan/zoom
      const remapped = samples.map((s) => {
        const p = this.world.toLocal({ x: s.x, y: s.y }) as { x: number; y: number }
        return { ...s, x: p.x, y: p.y }
      })

      switch (phase) {
        case 'start':
          this.drawing = true
          tool.start(layer)
          tool.update(remapped)
          break
        case 'move':
          if (!this.drawing) return
          tool.update(remapped)
          break
        default:
          if (!this.drawing) return
          this.drawing = false
          const end = (tool as any).end
          if (typeof end === 'function') {
            // Algunas herramientas esperan layer en end, otras no
            const result = end.length >= 1 ? end.call(tool, layer) : end.call(tool)
            // Si la herramienta devuelve una promesa (pluma/contorno), manejar async
            Promise.resolve(result).then((res: any) => {
              // Registrar en historial según herramienta
              try {
                if (this.activeToolKey === 'vpen' && res && res.mesh) {
                  const usingPV = !!res.usingPerVertexAlpha
                  if (!usingPV) {
                    const mesh = res.mesh
                    const geom: any = mesh.geometry
                    const positions = geom.buffers?.[0]?.data as Float32Array
                    const uvs = (geom.buffers?.[1]?.data as Float32Array) ?? new Float32Array((positions?.length ?? 0))
                    const indices = geom.indexBuffer?.data as Uint32Array | Uint16Array
                    if (positions && indices) {
                      const style = res.style ?? { color: (mesh as any).tint ?? 0xffffff, opacity: mesh.alpha ?? 1.0, blendMode: (mesh as any).blendMode ?? 'normal' }
                      const batch = this.getOrCreateBatch(layer)
                      const token = batch.appendStroke({ positions, uvs, indices }, style)
                      // Remove original mesh to reduce draw calls
                      try { layer.removeChild(mesh) } catch {}
                      try { mesh.destroy({ children: true }) } catch {}
                      // history action for batch append
                      this.history.push(this.history.makeBatchAppendAction(batch, token))
                    }
                  } else {
                    // using per-vertex alpha: keep mesh as child and track add/remove
                    const parent = layer
                    const child = res.mesh
                    const idx = parent.getChildIndex(child)
                    this.history.push(this.history.makeAddChildAction(parent, child, idx))
                  }
                } else if (res && (res.graphic || res.sprite)) {
                  const child = res.graphic ?? res.sprite
                  if (child && child.parent === layer) {
                    const idx = layer.getChildIndex(child)
                    this.history.push(this.history.makeAddChildAction(layer, child, idx))
                  }
                }
              } catch {}
            })
          }
          break
      }
  }

  setActiveTool(toolName: string) {
    const name = (['pluma', 'vpen', 'raster', 'contorno'] as string[]).includes(toolName) ? (toolName as ToolKey) : 'pluma'
    this.activeToolKey = name
  }

  getActiveTool() {
    return this.activeToolKey
  }

  getEngineApp() {
    return this.app
  }

  setPanMode(on: boolean) { this.panMode = on }
  getPanMode() { return this.panMode }

  // --- API de Zoom pública ---
  setZoom(next: number, centerX?: number, centerY?: number) {
    const minZ = 0.2
    const maxZ = 8
    const target = Math.max(minZ, Math.min(maxZ, next))
    const cx = centerX ?? this.app.renderer.width / 2
    const cy = centerY ?? this.app.renderer.height / 2
    const worldBeforeX = (cx - this.world.position.x) / this.zoom
    const worldBeforeY = (cy - this.world.position.y) / this.zoom
    this.zoom = target
    this.world.scale.set(this.zoom)
    this.world.position.x = cx - worldBeforeX * this.zoom
    this.world.position.y = cy - worldBeforeY * this.zoom
  }

  zoomIn() { this.setZoom(this.zoom * 1.2) }
  zoomOut() { this.setZoom(this.zoom / 1.2) }
  zoomReset() { this.zoom = 1; this.world.scale.set(this.zoom); this.world.position.set(0, 0) }
  getZoom() { return this.zoom }

  dispose() {
    try { this.inputCaptureDispose?.() } catch {}
    try { this.removeKeydown?.() } catch {}
    try { this.removeKeyup?.() } catch {}
    try { this.removeWheel?.() } catch {}
    try { this.removeBeforeUnload?.() } catch {}
    // stop FPS loop
    if (this._fpsRafId !== null) { try { cancelAnimationFrame(this._fpsRafId) } catch {}; this._fpsRafId = null }
  }

  // --- Renderer & presets ---
  setRendererResolution(resolution: number) {
    try {
      const r: any = this.app.renderer as any
      const cvs = this.app.canvas as HTMLCanvasElement
      const cssW = cvs.clientWidth || r.width || 1
      const cssH = cvs.clientHeight || r.height || 1
      // Apply new resolution if supported
      if (typeof r === 'object') {
        try { r.resolution = Math.max(0.5, Math.min(4, resolution)) } catch {}
        try { r.resize(cssW, cssH) } catch {}
      }
      // Ensure CSS size remains unchanged (handled also by CanvasContainer)
      try { cvs.style.width = `${cssW}px`; cvs.style.height = `${cssH}px` } catch {}
    } catch {}
  }

  async reloadRenderer(opts?: { antialias?: boolean; resolution?: number }) {
    const container = this.mountEl
    if (!container) return
    // snapshot size
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    // remove input and wheel listeners
    try { this.inputCaptureDispose?.() } catch {}
    try { this.removeWheel?.() } catch {}
    // remove canvas from DOM
    try { container.removeChild(this.app.canvas) } catch {}
    // destroy renderer/context
    try { (this.app.renderer as any).destroy?.(true) } catch {}
    // re-init with requested options
    const aa = opts?.antialias ?? this.currentAA
    const res = Math.max(0.5, Math.min(4, opts?.resolution ?? this.getRendererResolution()))
    await this.app.init({
      width,
      height,
      backgroundColor: this.backgroundColor as any,
      antialias: aa,
      resolution: res,
      powerPreference: 'high-performance' as any,
      preserveDrawingBuffer: false as any,
    })
    this.currentAA = !!aa
  // re-add world
  try { if (!this.world.parent) this.app.stage.addChild(this.world) } catch {}
  // re-add overlay
  try { if (this.overlayText) this.app.stage.addChild(this.overlayText) } catch {}
    // mount canvas
    container.appendChild(this.app.canvas)
    // restore background styles
    try { ;(this.app.renderer as any).background.color = this.backgroundColor } catch {}
    try { ;(this.app.canvas as HTMLCanvasElement).style.backgroundColor = `#${this.backgroundColor.toString(16).padStart(6, '0')}` } catch {}
    // recreate input capture
    if (this._onSamplesBound) {
      const cap = createInputCapture(this.app.canvas, this._onSamplesBound as any, { relativeToTarget: true, usePointerRawUpdate: this.lowLatency })
      this.inputCaptureDispose = () => cap.dispose()
    }
    // wheel handler
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = this.app.canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const delta = e.deltaY < 0 ? 1.1 : 0.9
      this.setZoom(this.zoom * delta, cx, cy)
    }
    this.app.canvas.addEventListener('wheel', onWheel, { passive: false })
    this.removeWheel = () => this.app.canvas.removeEventListener('wheel', onWheel)
    // detect index support again
    try {
      const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = (this.app.renderer as any).gl
      this.supportsUint32Indices = !!(gl && ('OES_element_index_uint' in (gl as any).extensions || gl.getExtension('OES_element_index_uint')))
    } catch {}
    this._updateOverlay()
  }

  applyPreset(name: 'performance' | 'default' | 'quality' | 'adaptive') {
    if (name === 'performance') {
      // Prioritize latency and throughput
      this.setLowLatencyMode(true)
      this.setPreviewQuality(1.0)
      this.setFreehandParams({ smoothing: 0.2, streamline: 0.1 })
      this.setJitterParams({ amplitude: 0 })
      // Lower internal resolution for speed on mobile/high-DPI
      this.setRendererResolution(1)
    } else if (name === 'quality') {
      // Favor visual crispness (mostly for desktop). MSAA remains off; we use higher resolution.
      this.setLowLatencyMode(true)
      this.setPreviewQuality(1.0)
      this.setFreehandParams({ thinning: 0.6, smoothing: 0.45, streamline: 0.35 })
      this.setJitterParams({ amplitude: 0.05, frequency: 0.005 })
      const dpr = (window as any)?.devicePixelRatio || 1
      this.setRendererResolution(Math.min(2, Math.max(1, dpr)))
    } else if (name === 'adaptive') {
      // Heuristics: touch-heavy/mobile => performance; otherwise quality
      const nav: any = (typeof navigator !== 'undefined') ? navigator : {}
      const ua = (nav.userAgent || '').toLowerCase()
      const isAndroid = ua.includes('android')
      const isiOS = /iphone|ipad|ipod/.test(ua)
      const hasTouch = (nav.maxTouchPoints ?? 0) > 0
      if (isAndroid || isiOS || hasTouch) this.applyPreset('performance')
      else this.applyPreset('quality')
    } else {
      // Default/balanced settings
      this.setLowLatencyMode(true)
      this.setPreviewQuality(1.0)
      this.setFreehandParams({ thinning: 0.6, smoothing: 0.3, streamline: 0.2 })
      this.setJitterParams({ amplitude: 0, frequency: 0.005 })
      // Keep current resolution (no change)
    }
  }

  getRendererResolution() {
    try { return (this.app.renderer as any).resolution ?? 1 } catch { return 1 }
  }
  getAntialias() { return this.currentAA }
  
  private _updateOverlay() {
    try {
      if (!this.overlayText) return
      const res = this.getRendererResolution()
      const fps = Math.max(0, Math.round(this.fps || 0))
      const text = `FPS ${fps} • Scale ${res.toFixed(1)}x • MSAA ${this.currentAA ? 'On' : 'Off'}`
      if (this.overlayText.text !== text) this.overlayText.text = text
      const rw = (this.app.renderer as any)?.width ?? 0
      const rh = (this.app.renderer as any)?.height ?? 0
      const margin = 8
      this.overlayText.x = margin
      this.overlayText.y = Math.max(margin, rh - margin - (this.overlayText.height || 12))
    } catch {}
  }

  // --- API de estilo ---
  private applyStyleToTools() {
    for (const key of Object.keys(this.tools) as ToolKey[]) {
      const t = this.tools[key]
      if (t && typeof t.setStyle === 'function') {
        // Map legacy freehand.thinning [-1..1] to speed-based thinning config
  const thinVal = this.freehand.thinning
  const strength = Math.max(0, Math.min(1, Math.abs(thinVal)))
  const invert = thinVal < 0
  const minSpeedScale = 1 - 0.75 * strength // 1 -> no thinning, 0.25 at max
  const exponent = 1 + 2 * strength // 1..3
  const speedRefPxPerMs = 0.3 // lower ref -> more visible effect
  // Map smoothing (0..1) to a small window and EMA smoothing
  const smooth = Math.max(0, Math.min(1, this.freehand.smoothing))
  const window = 1 + Math.round(smooth * 2) // 1..3 samples to avoid over-smoothing speed
  const thinningCfg = { minSpeedScale, exponent, speedRefPxPerMs, window, smooth, invert }

        // Map preview quality to decimation and cadence
        const q = Math.max(0, Math.min(1, this.previewQuality))
        const previewDecimatePx = (1 - q) * 3.0 // 0..3 px
        const previewMinMs = 33 - Math.round(q * 25) // 8..33 ms

        t.setStyle({
          strokeSize: this.strokeSize,
          strokeColor: this.strokeColor,
          opacity: this.opacity,
          blendMode: this.blendMode,
          pressureSensitivity: this.pressureSensitivity,
          thinning: thinningCfg,
          jitter: { amplitude: this.jitter.amplitude, frequency: this.jitter.frequency, domain: this.jitter.domain, smooth, seed: (Date.now() & 0xffffffff) >>> 0 },
          streamline: this.freehand.streamline,
          preview: { decimatePx: previewDecimatePx, minMs: this.previewMinMsOverride ?? previewMinMs },
        })
      }
    }
  }

  setStrokeSize(size: number) {
    this.strokeSize = Math.max(1, Math.min(128, Math.floor(size)))
    this.applyStyleToTools()
  }
  getStrokeSize() { return this.strokeSize }

  setStrokeColor(color: number) {
    this.strokeColor = color >>> 0
    this.applyStyleToTools()
  }
  getStrokeColor() { return this.strokeColor }

  setOpacity(alpha: number) {
    this.opacity = Math.max(0.01, Math.min(1, alpha))
    this.applyStyleToTools()
  }
  getOpacity() { return this.opacity }

  setBlendMode(mode: string) {
    // Aceptamos subset seguro: normal, add, multiply, screen
    const allowed = new Set(['normal', 'add', 'multiply', 'screen'])
    this.blendMode = allowed.has(mode) ? mode : 'normal'
    this.applyStyleToTools()
  }
  getBlendMode() { return this.blendMode }

  // --- Preview quality API ---
  setPreviewQuality(q: number) {
    this.previewQuality = Math.max(0, Math.min(1, q))
    this.applyStyleToTools()
  }
  getPreviewQuality() { return this.previewQuality }
  // --- Latency experiment API ---
  setLowLatencyMode(on: boolean) {
    const next = !!on
    if (this.lowLatency === next && (this.previewMinMsOverride !== null) === next) return
    this.lowLatency = next
    // Faster preview cadence when on
    this.previewMinMsOverride = this.lowLatency ? 8 : null
    // Recreate input capture with rawupdate when toggled
    try { this.inputCaptureDispose?.() } catch {}
    if (this._onSamplesBound) {
      const cap = createInputCapture(this.app.canvas, this._onSamplesBound as any, { relativeToTarget: true, usePointerRawUpdate: this.lowLatency })
      this.inputCaptureDispose = () => cap.dispose()
    }
    // Re-apply styles to update preview cadence
    this.applyStyleToTools()
  }
  getLowLatencyMode() { return this.lowLatency }

  setFreehandParams(params: { thinning?: number; smoothing?: number; streamline?: number }) {
    if (typeof params.thinning === 'number') this.freehand.thinning = Math.max(-1, Math.min(1, params.thinning))
    if (typeof params.smoothing === 'number') this.freehand.smoothing = Math.max(0, Math.min(1, params.smoothing))
    if (typeof params.streamline === 'number') this.freehand.streamline = Math.max(0, Math.min(1, params.streamline))
    this.applyStyleToTools()
  }
  getFreehandParams() { return { ...this.freehand } }

  // --- Pressure sensitivity API ---
  setPressureSensitivity(on: boolean) {
    this.pressureSensitivity = !!on
    this.applyStyleToTools()
  }
  getPressureSensitivity() { return this.pressureSensitivity }

  // --- Jitter API ---
  setJitterParams(params: { amplitude?: number; frequency?: number; domain?: 'distance' | 'time' }) {
    if (typeof params.amplitude === 'number') this.jitter.amplitude = Math.max(0, Math.min(1, params.amplitude))
    if (typeof params.frequency === 'number') this.jitter.frequency = Math.max(0, params.frequency)
    if (params.domain === 'distance' || params.domain === 'time') this.jitter.domain = params.domain
    this.applyStyleToTools()
  }
  getJitterParams() { return { ...this.jitter } }

  setBackgroundColor(color: number) {
    this.backgroundColor = color >>> 0
    try { (this.app.renderer as any).background.color = this.backgroundColor } catch {}
    try {
      (this.app.canvas as HTMLCanvasElement).style.backgroundColor = `#${this.backgroundColor
        .toString(16)
        .padStart(6, '0')}`
    } catch {}
  }
  getBackgroundColor() { return this.backgroundColor }

  // --- History API ---
  private _emitHistoryChange() { for (const fn of this.historyListeners) { try { fn() } catch {} } }
  private _emitFps() { for (const fn of this.fpsListeners) { try { fn(this.fps) } catch {} } }

  onHistoryChange(cb: () => void) {
    this.historyListeners.add(cb)
    return () => { this.historyListeners.delete(cb) }
  }

  // --- FPS API ---
  private _startFpsLoop() {
    if (this._fpsRafId !== null) return
    this._fpsAccumMs = 0
    this._fpsFrames = 0
    this._fpsLastMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    const tick = () => {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      const dt = Math.max(0, now - this._fpsLastMs)
      this._fpsLastMs = now
      this._fpsAccumMs += dt
      this._fpsFrames += 1
      // Update roughly every 250ms for stability
      if (this._fpsAccumMs >= 250) {
        const fpsNow = (this._fpsFrames * 1000) / this._fpsAccumMs
        // simple smoothing
        this.fps = this.fps > 0 ? this.fps * 0.6 + fpsNow * 0.4 : fpsNow
        this._emitFps()
        this._updateOverlay()
        this._fpsAccumMs = 0
        this._fpsFrames = 0
      }
      this._fpsRafId = requestAnimationFrame(tick)
    }
    this._fpsRafId = requestAnimationFrame(tick)
  }
  onFps(cb: (fps: number) => void) {
    this.fpsListeners.add(cb)
    // immediate push of current value for convenience
    try { cb(this.fps) } catch {}
    return () => { this.fpsListeners.delete(cb) }
  }
  getFps() { return this.fps }

  undo() { this.history.undo() }
  redo() { this.history.redo() }
  canUndo() { return this.history.canUndo() }
  canRedo() { return this.history.canRedo() }

  clearCanvas() {
    // Group all removals to make a single undo step
    this.history.beginGroup()
    try {
      const layers = this.layers.list()
      for (const l of layers) {
        const parent = l.node
        // Snapshot children and their indices
        const items = parent.children.map((c, i) => ({ c, i }))
        for (const { c, i } of items) {
          try { parent.removeChild(c) } catch {}
          this.history.push(this.history.makeRemoveChildAction(parent, c, i))
        }
      }
    } finally {
      this.history.endGroup('clearCanvas')
    }
  }
}
