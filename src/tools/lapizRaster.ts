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
  // Acumuladores para espaciado por distancia (continuo)
  private lastSample: { x: number; y: number; pressure?: number } | null = null
  private residualToNext = 0 // distancia restante hasta el próximo dab

  // Configuración visual
  private baseAlpha = 0.08 // igual que el final
  private spacing = 2.0    // px entre dabs (espaciado por distancia)

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
    this.lastSample = null
    this.residualToNext = 0
  }

  update(samples: InputSample[]) {
    // Acumula puntos crudos
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    // Dibuja preview con espaciado constante por distancia (acumulado entre segmentos)
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
      if (!this.lastSample) {
        // Primer dab
        placeDab(s.x, s.y, s.pressure)
        this.lastSample = { ...s }
        this.residualToNext = this.spacing
        continue
      }
      // Recorre el segmento desde el último sample hacia s, colocando dabs cada 'spacing'
      let prev = this.lastSample
      let dx = s.x - prev.x
      let dy = s.y - prev.y
      let segLen = Math.hypot(dx, dy)
      if (segLen < 1e-6) {
        // casi sin movimiento: solo acumula
        // no modifies residual
        this.lastSample = { ...s }
        continue
      }
      const ux = dx / segLen
      const uy = dy / segLen
      let distToNext = this.residualToNext > 0 ? this.residualToNext : this.spacing
      let traveled = 0
      while (segLen - traveled >= distToNext - 1e-6) {
        const tAbs = (traveled + distToNext) / segLen
        const x = prev.x + ux * (traveled + distToNext)
        const y = prev.y + uy * (traveled + distToNext)
        const p0 = prev.pressure ?? 0.5
        const p1 = s.pressure ?? 0.5
        const pr = p0 + (p1 - p0) * tAbs
        placeDab(x, y, pr)
        traveled += distToNext
        distToNext = this.spacing
      }
      // Actualiza residual para el siguiente segmento
      this.residualToNext = distToNext - (segLen - traveled)
      this.lastSample = { ...s }
    }
  }

  async end() {
    if (!this.container || this.points.length < 2) {
      // Limpia preview
      this.previewContainer?.destroy({ children: true })
      this.previewContainer = null
      this.lastSample = null
      this.residualToNext = 0
      return null
    }

    // Resamplea puntos en dabs a distancia fija para evitar huecos
    // Resampleo por distancia continuo (incluye residual entre segmentos)
    const dabs: { x: number; y: number; pressure?: number; r: number }[] = []
    const pushDab = (x: number, y: number, pressure?: number) => {
      const r = 2 + (pressure ?? 0.5) * 3
      dabs.push({ x, y, pressure, r })
    }
    let residual = 0
    let prev = this.points[0]
    pushDab(prev.x, prev.y, prev.pressure)
    residual = this.spacing
    for (let i = 1; i < this.points.length; i++) {
      const cur = this.points[i]
      let dx = cur.x - prev.x
      let dy = cur.y - prev.y
      let segLen = Math.hypot(dx, dy)
      if (segLen < 1e-6) {
        prev = cur
        continue
      }
      const ux = dx / segLen
      const uy = dy / segLen
      let distToNext = residual > 0 ? residual : this.spacing
      let traveled = 0
      while (segLen - traveled >= distToNext - 1e-6) {
        const tAbs = (traveled + distToNext) / segLen
        const x = prev.x + ux * (traveled + distToNext)
        const y = prev.y + uy * (traveled + distToNext)
        const p0 = prev.pressure ?? 0.5
        const p1 = cur.pressure ?? 0.5
        const pr = p0 + (p1 - p0) * tAbs
        pushDab(x, y, pr)
        traveled += distToNext
        distToNext = this.spacing
      }
      residual = distToNext - (segLen - traveled)
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
  this.lastSample = null
  this.residualToNext = 0
    this.container = null
    this.points = []
    return result
  }
}
