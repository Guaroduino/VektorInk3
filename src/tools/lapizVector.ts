import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import type { InputSample } from '../input'

/**
 * Lápiz Vectorial (No Editable):
 * - Calcula geometría en worker (pendiente). Aquí dejamos un stub que crea un Mesh básico.
 * - En producción: pipeline: input -> stroke.worker.ts (geometría + alpha) -> Mesh en hilo principal.
 */
export class LapizVectorTool {
  private previewMesh: Mesh | null = null
  private container: Container | null = null
  private points: { x: number; y: number; pressure?: number }[] = []
  private widthBase = 6

  // Calcula media anchura (half-width) consistente para preview y trazo final
  private _halfWidth(pressure?: number) {
    // Normaliza presión ~[0,1], si no hay presión usa 0.5
    const p = pressure ?? 0.5
    // Mapear a [0.5, 1.0] para que no sea demasiado fino en baja presión
    const scale = (p + 0.5) * 0.5 // 0.25..0.75 si p=0..0.5; 0.5..0.75.. también razonable
    return this.widthBase * scale * 0.5 // half-width
  }

  start(layer: Container) {
    this.container = layer
    this.points = []

    // Crea un mesh de preview vacío que iremos actualizando en tiempo real
    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = 0xffffff
    // Igualar estilo al trazo final
    mesh.alpha = 0.12
    mesh.blendMode = 'add' as any
    layer.addChild(mesh)
    this.previewMesh = mesh
  }

  update(samples: InputSample[]) {
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    // Actualiza preview en tiempo real
    if (!this.previewMesh) return
    const n = this.points.length
    const geom = this.previewMesh.geometry
    if (n < 2) {
      // limpiar buffers cuando no hay suficientes puntos
      if (((geom as any).vertexCount ?? 0) > 0) {
        geom.buffers[0].data = new Float32Array(0)
        geom.buffers[0].update()
        geom.buffers[1].data = new Float32Array(0)
        geom.buffers[1].update()
        geom.indexBuffer.data = new Uint32Array(0)
        geom.indexBuffer.update()
        ;(this.previewMesh as any).size = 0
        ;(geom as any).vertexCount = 0
      }
      return
    }

    // Recalcula la tira (listón) como en end(), pero solo para vista previa
    const pts = this.points
  const widthBase = this.widthBase
    const left: number[] = []
    const right: number[] = []
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[Math.min(n - 1, i + 1)]
      const dx = p1.x - p0.x
      const dy = p1.y - p0.y
      const len = Math.hypot(dx, dy) || 1
      let nx = -dy / len
      let ny = dx / len
      const w = this._halfWidth(p.pressure)
      left.push(p.x + nx * w, p.y + ny * w)
      right.push(p.x - nx * w, p.y - ny * w)
    }

    const positions: number[] = []
    for (let i = 0; i < n; i++) {
      positions.push(left[2 * i], left[2 * i + 1], right[2 * i], right[2 * i + 1])
    }

    const indices: number[] = []
    for (let i = 0; i < n - 1; i++) {
      const i0 = i * 2
      const i1 = i * 2 + 1
      const i2 = (i + 1) * 2
      const i3 = (i + 1) * 2 + 1
      indices.push(i0, i1, i2, i1, i3, i2)
    }

    const uvs = new Float32Array(n * 4)
    geom.buffers[0].data = new Float32Array(positions)
    geom.buffers[0].update()
    geom.buffers[1].data = uvs
    geom.buffers[1].update()
    geom.indexBuffer.data = new Uint32Array(indices)
    geom.indexBuffer.update()
    ;(this.previewMesh as any).size = indices.length
    ;(geom as any).vertexCount = positions.length / 2
  }

  end() {
    if (!this.container || this.points.length < 2) {
      // Limpia preview si existe
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      return null
    }

    // Construye una tira (listón) con grosor dependiente de presión (muy básico)
    const pts = this.points
    const n = pts.length
  const widthBase = this.widthBase

    const left: number[] = []
    const right: number[] = []

    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[Math.min(n - 1, i + 1)]
      const dx = p1.x - p0.x
      const dy = p1.y - p0.y
      const len = Math.hypot(dx, dy) || 1
      // normal perpendicular
      let nx = -dy / len
      let ny = dx / len
      // ancho local
      const w = this._halfWidth(p.pressure)
      left.push(p.x + nx * w, p.y + ny * w)
      right.push(p.x - nx * w, p.y - ny * w)
    }

    // Interleaving: [L0, R0, L1, R1, ...]
    const positions: number[] = []
    for (let i = 0; i < n; i++) {
      positions.push(left[2 * i], left[2 * i + 1], right[2 * i], right[2 * i + 1])
    }

    // Triángulos para strip de pares (dos triángulos por segmento)
    const indices: number[] = []
    for (let i = 0; i < n - 1; i++) {
      const i0 = i * 2
      const i1 = i * 2 + 1
      const i2 = (i + 1) * 2
      const i3 = (i + 1) * 2 + 1
      // triángulos (i0, i1, i2) y (i1, i3, i2)
      indices.push(i0, i1, i2, i1, i3, i2)
    }

    // UVs dummy
    const uvs: number[] = new Array((n) * 4).fill(0)

    const geom = new MeshGeometry({
      positions: new Float32Array(positions),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
    })

    // Usamos el shader por defecto de Pixi para que respete transformaciones (pan/zoom)
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
  mesh.tint = 0xffffff
  mesh.alpha = 0.12
  mesh.blendMode = 'add' as any

    this.container.addChild(mesh)

    // Elimina la vista previa temporal
    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null

    const result = { mesh, points: this.points }
    this.container = null
    this.points = []
    return result
  }
}
