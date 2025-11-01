import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import getStroke from 'perfect-freehand'
import simplify from 'simplify-js'
import type { InputSample } from '../input'
import { triangulateWithTess2 } from '../geom/tess'
import { triangulateWithTess2Async } from '../geom/tessWorkerClient'

/**
 * Pincel de Contorno (Vectorial Editable)
 * - Feedback tiempo real igual a Pluma
 * - Al soltar: crea un Graphics permanente rellenando el contorno simplificado
 */
export class PincelContornoTool {
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number; pressure?: number }[] = []

  start(layer: Container) {
    // Crear Mesh de preview con geometría vacía
    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = 0xffffff
    mesh.alpha = 1.0
    layer.addChild(mesh)
    this.previewMesh = mesh
    this.points = []
  }

  private _seq = 0
  private _pending = false

  update(samples: InputSample[]) {
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    if (!this.previewMesh) return
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      { size: 10, thinning: 0.0, smoothing: 0.6, streamline: 0.4 }
    )
    const geom = this.previewMesh.geometry
    if (outline.length < 3) {
      // limpiar buffers
      geom.buffers[0].data = new Float32Array(0)
      geom.buffers[0].update()
      geom.buffers[1].data = new Float32Array(0)
      geom.buffers[1].update()
      geom.indexBuffer.data = new Uint32Array(0)
      geom.indexBuffer.update()
      return
    }
    const seq = ++this._seq
    if (this._pending) return
    this._pending = true
    const contour = outline.map(([x, y]) => ({ x, y }))
    triangulateWithTess2Async([contour], 'nonzero').then(({ positions, indices }) => {
      this._pending = false
      if (!this.previewMesh) return
      if (seq !== this._seq) return
      if (!positions || !indices || indices.length === 0) {
        geom.buffers[0].data = new Float32Array(0)
        geom.buffers[0].update()
        geom.buffers[1].data = new Float32Array(0)
        geom.buffers[1].update()
        geom.indexBuffer.data = new Uint32Array(0)
        geom.indexBuffer.update()
        return
      }
      const uvs = new Float32Array((positions.length / 2) * 2)
      geom.buffers[0].data = positions
      geom.buffers[0].update()
      geom.buffers[1].data = uvs
      geom.buffers[1].update()
      geom.indexBuffer.data = indices
      geom.indexBuffer.update()
    }).catch(() => {
      this._pending = false
    })
  }

  async end(layer: Container) {
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      { size: 10, thinning: 0.0, smoothing: 0.6, streamline: 0.4 }
    )

    // Simplifica contorno para puntos de control
    const poly = outline.map(([x, y]) => ({ x, y }))
    const simplified = simplify(poly, 2.0, true)

    // Triangula robusto con tess2 para el trazo final
  const { positions, indices } = await triangulateWithTess2Async([poly], 'nonzero')
    const finalGeom = new MeshGeometry({
      positions,
      uvs: new Float32Array((positions.length / 2) * 2),
      indices,
    })
    const finalMesh = new Mesh({ geometry: finalGeom, texture: Texture.WHITE })
    finalMesh.tint = 0xffffff
    finalMesh.alpha = 1.0
    layer.addChild(finalMesh)

    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    this.points = []

    return { graphic: finalMesh, controlPoints: simplified }
  }
}
