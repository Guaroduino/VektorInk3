import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import getStroke from 'perfect-freehand'
import simplify from 'simplify-js'
import type { InputSample } from '../input'
import { triangulateWithTess2Async } from '../geom/tessWorkerClient'
import { cleanOutline } from '../geom/clean'

/**
 * Pincel de Contorno (Vectorial Editable)
 * - Feedback tiempo real igual a Pluma
 * - Al soltar: crea un Graphics permanente rellenando el contorno simplificado
 */
export class PincelContornoTool {
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number; pressure?: number }[] = []
  private strokeSize = 10
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'normal'
  private freehand = { thinning: 0.0, smoothing: 0.6, streamline: 0.4 }
  private _armed = false
  private _seq = 0
  private _pending = false

  setStyle(styleOrSize: any, color?: number) {
    if (typeof styleOrSize === 'object') {
      const s = styleOrSize as {
        strokeSize?: number; strokeColor?: number; opacity?: number; blendMode?: string;
        freehand?: { thinning?: number; smoothing?: number; streamline?: number }
      }
      if (typeof s.strokeSize === 'number') this.strokeSize = s.strokeSize
      if (typeof s.strokeColor === 'number') this.strokeColor = s.strokeColor >>> 0
      if (typeof s.opacity === 'number') this.opacity = s.opacity
      if (typeof s.blendMode === 'string') this.blendMode = s.blendMode as any
      if (s.freehand) {
        this.freehand.thinning = s.freehand.thinning ?? this.freehand.thinning
        this.freehand.smoothing = s.freehand.smoothing ?? this.freehand.smoothing
        this.freehand.streamline = s.freehand.streamline ?? this.freehand.streamline
      }
    } else {
      this.strokeSize = styleOrSize
      this.strokeColor = (color ?? this.strokeColor) >>> 0
    }
  }

  start(layer: Container) {
    // Crear Mesh de preview con geometría vacía
    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
    ;(mesh as any).blendMode = this.blendMode
    ;(mesh as any).size = 0
    ;(geom as any).vertexCount = 0
    mesh.visible = false
    layer.addChild(mesh)
    this.previewMesh = mesh
    this.points = []
    this._armed = false
  }

  // Pipeline con tess2 (worker) para reducir artefactos

  update(samples: InputSample[]) {
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    if (!this.previewMesh) return
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      { size: this.strokeSize, thinning: this.freehand.thinning, smoothing: this.freehand.smoothing, streamline: this.freehand.streamline }
    )
    const geom = this.previewMesh.geometry
    if (outline.length < 6) {
      // limpiar buffers y draw sizes para evitar GL errores
      geom.buffers[0].data = new Float32Array(0)
      geom.buffers[0].update()
      geom.buffers[1].data = new Float32Array(0)
      geom.buffers[1].update()
      geom.indexBuffer.data = new Uint32Array(0)
      geom.indexBuffer.update()
      ;(this.previewMesh as any).size = 0
      ;(geom as any).vertexCount = 0
      this.previewMesh.visible = false
      return
    }

    // Descarta polígonos diminutos que generan triángulos extraños
    {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [x, y] of outline) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
      const w = maxX - minX, h = maxY - minY
      const diag = Math.hypot(w, h)
      if (!isFinite(diag) || diag < Math.max(4, this.strokeSize * 0.8)) {
        geom.buffers[0].data = new Float32Array(0)
        geom.buffers[0].update()
        geom.buffers[1].data = new Float32Array(0)
        geom.buffers[1].update()
        geom.indexBuffer.data = new Uint32Array(0)
        geom.indexBuffer.update()
        ;(this.previewMesh as any).size = 0
        ;(geom as any).vertexCount = 0
        this.previewMesh.visible = false
        return
      }
    }
    const contour = cleanOutline(outline.map(([x, y]) => ({ x, y })), this.strokeSize)
    if (contour.length < 3) {
      geom.buffers[0].data = new Float32Array(0)
      geom.buffers[0].update()
      geom.buffers[1].data = new Float32Array(0)
      geom.buffers[1].update()
      geom.indexBuffer.data = new Uint32Array(0)
      geom.indexBuffer.update()
      ;(this.previewMesh as any).size = 0
      ;(geom as any).vertexCount = 0
      this.previewMesh.visible = false
      this._armed = false
      return
    }
    const seq = ++this._seq
    if (this._pending) return
    this._pending = true
    triangulateWithTess2Async([contour], 'nonzero')
      .then(({ positions, indices }) => {
        this._pending = false
        if (!this.previewMesh) return
        if (seq !== this._seq) return
        if (!positions || !indices || indices.length < 3 || positions.length < 6) {
          geom.buffers[0].data = new Float32Array(0)
          geom.buffers[0].update()
          geom.buffers[1].data = new Float32Array(0)
          geom.buffers[1].update()
          geom.indexBuffer.data = new Uint32Array(0)
          geom.indexBuffer.update()
          ;(this.previewMesh as any).size = 0
          ;(geom as any).vertexCount = 0
          this.previewMesh!.visible = false
          this._armed = false
          return
        }
        const uvs = new Float32Array((positions.length / 2) * 2)
        geom.buffers[0].data = positions
        geom.buffers[0].update()
        geom.buffers[1].data = uvs
        geom.buffers[1].update()
        geom.indexBuffer.data = indices
        geom.indexBuffer.update()
        ;(this.previewMesh as any).size = indices.length
        ;(geom as any).vertexCount = positions.length / 2
        this.previewMesh!.visible = true
        this._armed = true
      })
      .catch(() => {
        this._pending = false
      })
  }

  async end(layer: Container) {
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      { size: this.strokeSize, thinning: this.freehand.thinning, smoothing: this.freehand.smoothing, streamline: this.freehand.streamline }
    )

    // Simplifica contorno para puntos de control
  const poly = cleanOutline(outline.map(([x, y]) => ({ x, y })), this.strokeSize)
    const simplified = simplify(poly, 2.0, true)
    const { positions, indices } = await triangulateWithTess2Async([poly], 'nonzero')
    const finalGeom = new MeshGeometry({
      positions,
      uvs: new Float32Array((positions.length / 2) * 2),
      indices,
    })
  const finalMesh = new Mesh({ geometry: finalGeom, texture: Texture.WHITE })
  finalMesh.tint = this.strokeColor
  finalMesh.alpha = this.opacity
  ;(finalMesh as any).blendMode = this.blendMode
    layer.addChild(finalMesh)
    ;(finalMesh as any).size = indices.length
    ;(finalGeom as any).vertexCount = positions.length / 2

    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    this.points = []

    return { graphic: finalMesh, controlPoints: simplified }
  }
}
