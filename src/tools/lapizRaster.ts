import { Container, Sprite, Texture } from 'pixi.js'
import type { InputSample } from '../input'

/**
 * Lápiz Raster (No Editable):
 * - Producción: dibuja en OffscreenCanvas en worker y devuelve un ImageBitmap/OffscreenCanvas para Texture.
 * - Aquí: stub mínimo que no hace trabajo en worker aún.
 */
export class LapizRasterTool {
  private container: Container | null = null
  private points: { x: number; y: number; pressure?: number }[] = []
  private previewContainer: Container | null = null
  private dabTexture: Texture | null = null
  private lastDab: { x: number; y: number; pressure?: number } | null = null

  // Configuración visual
  private baseAlpha = 0.08 // igual que el final
  private spacing = 2.0    // px entre dabs

  private getDabTexture(): Texture {
    if (this.dabTexture) return this.dabTexture
    const size = 16
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const g = c.getContext('2d')!
    g.clearRect(0, 0, size, size)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    g.fill()
    this.dabTexture = Texture.from(c)
    return this.dabTexture
  }

  start(layer: Container) {
    this.container = layer
    this.points = []
    // Contenedor de preview (sprites temporales)
    const preview = new Container()
    preview.zIndex = 9999
    layer.addChild(preview)
    this.previewContainer = preview
    this.lastDab = null
  }

  update(samples: InputSample[]) {
    // Acumula puntos crudos
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    // Dibuja preview como dabs a distancia fija
    if (!this.previewContainer) return
    const tex = this.getDabTexture()
    const placeDab = (x: number, y: number, pressure?: number) => {
      const r = 2 + (pressure ?? 0.5) * 3 // mismo radio que el final
      const spr = new Sprite({ texture: tex })
      spr.anchor.set(0.5)
      spr.x = x
      spr.y = y
      const scale = (r * 2) / tex.width
      spr.scale.set(scale)
      spr.alpha = this.baseAlpha
      spr.tint = 0xffffff
      spr.blendMode = 'add' as any
      this.previewContainer!.addChild(spr)
    }

    for (const s of samples) {
      const prev = this.lastDab ?? s
      const dx = s.x - prev.x
      const dy = s.y - prev.y
      const dist = Math.hypot(dx, dy)
      if (dist <= this.spacing) {
        // muy cerca, coloca solo uno y acumula
        placeDab(s.x, s.y, s.pressure)
        this.lastDab = s
        continue
      }
      const steps = Math.max(1, Math.floor(dist / this.spacing))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const x = prev.x + dx * t
        const y = prev.y + dy * t
        const p0 = prev.pressure ?? 0.5
        const p1 = s.pressure ?? 0.5
        const pr = p0 + (p1 - p0) * t
        placeDab(x, y, pr)
      }
      this.lastDab = s
    }
  }

  async end() {
    if (!this.container || this.points.length < 2) {
      // Limpia preview
      this.previewContainer?.destroy({ children: true })
      this.previewContainer = null
      this.lastDab = null
      return null
    }

    // Resamplea puntos en dabs a distancia fija para evitar huecos
    const dabs: { x: number; y: number; pressure?: number; r: number }[] = []
    const pushDab = (x: number, y: number, pressure?: number) => {
      const r = 2 + (pressure ?? 0.5) * 3
      dabs.push({ x, y, pressure, r })
    }
    let prev = this.points[0]
    pushDab(prev.x, prev.y, prev.pressure)
    for (let i = 1; i < this.points.length; i++) {
      const cur = this.points[i]
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      const dist = Math.hypot(dx, dy)
      if (dist <= this.spacing) {
        pushDab(cur.x, cur.y, cur.pressure)
        prev = cur
        continue
      }
      const steps = Math.max(1, Math.floor(dist / this.spacing))
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const x = prev.x + dx * t
        const y = prev.y + dy * t
        const p0 = prev.pressure ?? 0.5
        const p1 = cur.pressure ?? 0.5
        const pr = p0 + (p1 - p0) * t
        pushDab(x, y, pr)
      }
      prev = cur
    }

    // Calcula bounds con radio de cada dab
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const d of dabs) {
      minX = Math.min(minX, d.x - d.r)
      minY = Math.min(minY, d.y - d.r)
      maxX = Math.max(maxX, d.x + d.r)
      maxY = Math.max(maxY, d.y + d.r)
    }

    const w = Math.max(1, Math.ceil(maxX - minX + 16))
    const h = Math.max(1, Math.ceil(maxY - minY + 16))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.globalAlpha = this.baseAlpha
    ctx.fillStyle = '#ffffff'

    // Renderiza dabs resampleados como discos
    for (const d of dabs) {
      ctx.beginPath()
      ctx.arc(d.x - minX + 8, d.y - minY + 8, d.r, 0, Math.PI * 2)
      ctx.fill()
    }

    const tex = Texture.from(canvas)
    const sprite = new Sprite(tex)
    sprite.x = minX - 8
    sprite.y = minY - 8
    sprite.blendMode = 'add' // efecto tinta acumulada

    this.container.addChild(sprite)

    const result = { sprite, points: this.points }
    // Limpia preview
    this.previewContainer?.destroy({ children: true })
    this.previewContainer = null
    this.lastDab = null
    this.container = null
    this.points = []
    return result
  }
}
