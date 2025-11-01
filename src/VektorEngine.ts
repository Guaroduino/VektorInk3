import { Application, Container } from 'pixi.js'
import { createInputCapture, type InputSample, type PointerPhase } from './input'
import { LayersManager as LayerManager } from './layers'
import { PlumaTool } from './tools/pluma'
import { PincelContornoTool } from './tools/pincelContorno'
import { LapizVectorTool } from './tools/lapizVector'
import { LapizRasterTool } from './tools/lapizRaster'

export type ToolKey = 'pluma' | 'vpen' | 'raster' | 'contorno'

export class VektorEngine {
  private app: Application
  private world: Container
  private layers: LayerManager
  private inputCaptureDispose: (() => void) | null = null
  private removeKeydown?: () => void
  private removeKeyup?: () => void
  private removeWheel?: () => void
  private removeBeforeUnload?: () => void

  private tools: Record<ToolKey, any>
  private activeToolKey: ToolKey = 'pluma'
  private drawing = false
  private panMode = false
  private isPanningDrag = false
  private lastPanX = 0
  private lastPanY = 0
  private zoom = 1
  private isInitialized = false

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
  }

  private getActiveLayerNode() {
    return this.layers.active?.node ?? this.layers.list()[0]?.node ?? this.world
  }

  async init(container: HTMLElement) {
    if (this.isInitialized) return
    this.isInitialized = true

    // Tamaño inicial controlado por el contenedor React (no usar resizeTo)
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight

    await this.app.init({
      width,
      height,
      backgroundColor: 0x111111,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    })

    // Asegurar jerarquía
    if (!this.world.parent) this.app.stage.addChild(this.world)

    // Montar canvas
    container.appendChild(this.app.canvas)

    // Input de alta fidelidad directamente sobre el canvas
    const onSamples = (_id: number, samples: InputSample[], phase: PointerPhase) => {
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
            if (end.length >= 1) end.call(tool, layer)
            else end.call(tool)
          }
          break
      }
    }
    const cap = createInputCapture(this.app.canvas, onSamples, { relativeToTarget: true })
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
  }
}
