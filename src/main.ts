import { Application, Container } from 'pixi.js'
import { createInputCapture, type InputSample, type PointerPhase } from './input'
import { LayersManager } from './layers'
import { PlumaTool } from './tools/pluma'
import { PincelContornoTool } from './tools/pincelContorno'
import { LapizVectorTool } from './tools/lapizVector'
import { LapizRasterTool } from './tools/lapizRaster'

async function boot() {
  const app = new Application()
  await app.init({
    background: '#0e1116',
    resizeTo: window,
    antialias: true
  })

  const mount = document.getElementById('app')
  if (!mount) throw new Error('No se encontró el contenedor #app')
  mount.appendChild(app.canvas)

  // Mundo (para poder hacer pan/zoom sin afectar HUD)
  const world = new Container()
  app.stage.addChild(world)

  // Capas
  const layers = new LayersManager(world)
  const defaultLayer = layers.create('Capa 1')

  // Herramientas
  const tools = {
    pluma: new PlumaTool(),
    contorno: new PincelContornoTool(),
    vpen: new LapizVectorTool(),
    raster: new LapizRasterTool(),
  }

  type ToolKey = keyof typeof tools
  let activeToolKey: ToolKey = 'pluma'
  let drawing = false
  let panMode = false
  let isPanningDrag = false
  let lastPanX = 0
  let lastPanY = 0
  let zoom = 1

  const getActiveLayerNode = () => layers.active?.node ?? defaultLayer.node

  const onSamples = (_id: number, samples: InputSample[], phase: PointerPhase) => {
    // Si estamos en modo pan (o Space presionado), no dibujar y usar drag para pan
    if (panMode || isPanningDrag) {
      if (phase === 'start') {
        isPanningDrag = true
        lastPanX = samples[samples.length - 1]?.x ?? lastPanX
        lastPanY = samples[samples.length - 1]?.y ?? lastPanY
      } else if (phase === 'move' && isPanningDrag) {
        const s = samples[samples.length - 1]
        if (s) {
          const dx = s.x - lastPanX
          const dy = s.y - lastPanY
          world.position.x += dx
          world.position.y += dy
          lastPanX = s.x
          lastPanY = s.y
        }
      } else if (phase === 'end' || phase === 'cancel') {
        isPanningDrag = false
      }
      return
    }
    const layer = getActiveLayerNode()
    const tool = tools[activeToolKey]
    // Remapear coordenadas de pantalla a mundo para respetar pan/zoom
    const remapped = samples.map((s) => {
      const p = world.toLocal({ x: s.x, y: s.y }) as { x: number; y: number }
      return { ...s, x: p.x, y: p.y }
    })
    switch (phase) {
      case 'start':
        drawing = true
  tool.start(layer as any)
        tool.update(remapped)
        break
      case 'move':
        if (!drawing) return
        tool.update(remapped)
        break
      default:
        if (!drawing) return
        drawing = false
  ;(tool as any).end(layer)
        break
    }
  }

  // Input de alta fidelidad directamente sobre el canvas
  const cap = createInputCapture(app.canvas, onSamples, { relativeToTarget: true })

  // Helpers zoom
  const setZoom = (next: number, centerX?: number, centerY?: number) => {
    const minZ = 0.2
    const maxZ = 8
    const target = Math.max(minZ, Math.min(maxZ, next))
    const cx = centerX ?? app.renderer.width / 2
    const cy = centerY ?? app.renderer.height / 2
    // convertir el centro de pantalla a coords de mundo para zoom focal
    const worldBeforeX = (cx - world.position.x) / zoom
    const worldBeforeY = (cy - world.position.y) / zoom
    zoom = target
    world.scale.set(zoom)
    // Mantener el punto bajo el cursor estable
    world.position.x = cx - worldBeforeX * zoom
    world.position.y = cy - worldBeforeY * zoom
  }

  const zoomIn = () => setZoom(zoom * 1.2)
  const zoomOut = () => setZoom(zoom / 1.2)
  const zoomReset = () => {
    zoom = 1
    world.scale.set(zoom)
    world.position.set(0, 0)
  }

  // Atajos rápidos
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (e.code === 'Digit1') activeToolKey = 'pluma'
    else if (e.code === 'Digit2') activeToolKey = 'vpen'
    else if (e.code === 'Digit3') activeToolKey = 'raster'
    else if (e.code === 'Digit4') activeToolKey = 'contorno'
    else if (e.code === 'KeyN') layers.create(`Capa ${layers.list().length + 1}`)
    else if (e.code === 'Delete') {
      const a = layers.active
      if (a) layers.remove(a.id)
    }
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomIn()
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomOut()
    else if (e.code === 'Digit0') zoomReset()
    else if (e.code === 'Space') {
      panMode = true
    }
    updateHUD()
  })

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') panMode = false
  })

  // Rueda para zoom (Ctrl o simple)
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const rect = app.canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const delta = e.deltaY < 0 ? 1.1 : 0.9
    setZoom(zoom * delta, cx, cy)
  }, { passive: false })

  // HUD wiring
  const elActive = document.getElementById('active-tool') as HTMLSpanElement
  const btnIn = document.getElementById('zoom-in') as HTMLButtonElement
  const btnOut = document.getElementById('zoom-out') as HTMLButtonElement
  const btnReset = document.getElementById('zoom-reset') as HTMLButtonElement
  const btnPan = document.getElementById('pan-toggle') as HTMLButtonElement

  const updateHUD = () => {
    if (elActive) {
      const map: Record<string, string> = { pluma: 'Pluma', vpen: 'Lápiz Vector', raster: 'Lápiz Raster', contorno: 'Pincel Contorno' }
      elActive.textContent = map[activeToolKey] ?? String(activeToolKey)
    }
    if (btnPan) btnPan.textContent = panMode ? 'Pan (ON)' : 'Pan'
  }

  btnIn?.addEventListener('click', zoomIn)
  btnOut?.addEventListener('click', zoomOut)
  btnReset?.addEventListener('click', zoomReset)
  btnPan?.addEventListener('click', () => { panMode = !panMode; updateHUD() })

  updateHUD()

  // Cleanup al cerrar
  window.addEventListener('beforeunload', () => {
    cap.dispose()
  })
}

boot().catch((err) => {
  console.error('Error iniciando PixiJS:', err)
})
