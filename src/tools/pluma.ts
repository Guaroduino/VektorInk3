import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import getStroke from 'perfect-freehand'
import simplify from 'simplify-js'
import type { InputSample } from '../input'
import { triangulateWithTess2 } from '../geom/tess'
import { triangulateWithTess2Async } from '../geom/tessWorkerClient'

/**
 * Pluma (Vectorial Editable)
 * - En tiempo real: muestra un Mesh de preview triangulado del contorno de perfect-freehand
 * - Al soltar: simplifica puntos y crea un Mesh permanente basado en triangulación robusta
 */
export class PlumaTool {
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number; pressure?: number }[] = []

  start(layer: Container) {
    // Crea un mesh de preview (se actualiza cada frame)
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
    // Acumula puntos
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    if (!this.previewMesh) return

    // 1. Obtener el polígono de perfect-freehand
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      {
        size: 8,
        thinning: 0.6,
        smoothing: 0.6,
        streamline: 0.5,
        easing: (t: number) => t,
      }
    )

    // --- MANEJO TEMPRANO SI NO HAY SUFICIENTES PUNTOS ---
    if (outline.length < 3) {
  const geom = this.previewMesh.geometry
  // Solo actualiza si no está ya vacío
  if (((geom as any).vertexCount ?? 0) > 0) {
        geom.buffers[0].data = new Float32Array(0)
        geom.buffers[0].update()
        geom.buffers[1].data = new Float32Array(0)
        geom.buffers[1].update()
        geom.indexBuffer.data = new Uint32Array(0)
        geom.indexBuffer.update()

        // --- SOLUCIÓN ---
        ;(this.previewMesh as any).size = 0 // 1. Índices a dibujar
        ;(geom as any).vertexCount = 0      // 2. Vértices totales
      }
      return
    }

    const seq = ++this._seq
    if (this._pending) return
    this._pending = true
    const contour = outline.map(([x, y]) => ({ x, y }))
    triangulateWithTess2Async([contour], 'nonzero').then(({ positions, indices, error }) => {
      this._pending = false
      if (!this.previewMesh) return
      if (seq !== this._seq) return // resultado obsoleto
      // Si hubo error en el worker o los datos están vacíos, limpiar geometría
      if (!positions || !indices || indices.length === 0) {
        if (error) console.warn('tess.worker error (preview):', error)
  const geom = this.previewMesh.geometry
  if (((geom as any).vertexCount ?? 0) > 0) { // Solo actualiza si no está ya vacío
          geom.buffers[0].data = new Float32Array(0)
          geom.buffers[0].update()
          geom.buffers[1].data = new Float32Array(0)
          geom.buffers[1].update()
          geom.indexBuffer.data = new Uint32Array(0)
          geom.indexBuffer.update()

          // --- SOLUCIÓN ---
          ;(this.previewMesh as any).size = 0 // 1. Índices a dibujar
          ;(geom as any).vertexCount = 0      // 2. Vértices totales
        }
        return
      }
      const uvs = new Float32Array((positions.length / 2) * 2)
      const geom = this.previewMesh.geometry
      geom.buffers[0].data = positions
      geom.buffers[0].update()
      geom.buffers[1].data = uvs
      geom.buffers[1].update()
      geom.indexBuffer.data = indices
    geom.indexBuffer.update()

    // --- SOLUCIÓN ---
  ;(this.previewMesh as any).size = indices.length  // 1. Índices a dibujar
  ;(geom as any).vertexCount = positions.length / 2 // 2. Vértices totales
    }).catch((err) => {
      // Este catch solo debería activarse si el worker no se carga o muere
      this._pending = false
      console.error('Error catastrófico del worker (preview):', err)
    })
  }

  async end(layer: Container) {
    // 1) Contorno robusto con perfect-freehand
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      {
        size: 8,
        thinning: 0.6,
        smoothing: 0.6,
        streamline: 0.5,
        easing: (t: number) => t,
      }
    )

    // 2) Simplifica puntos de control (para edición)
    const simplified = simplify(
      this.points.map((p) => ({ x: p.x, y: p.y })),
      1.5,
      true
    )

    // 3) Triangula con tess2 -> evita artefactos de auto-intersecciones
    const contour = outline.map(([x, y]) => ({ x, y }))
  const { positions, indices, error } = await triangulateWithTess2Async([contour], 'nonzero')

    // Si falló la triangulación, no creamos mesh permanente
    if (!indices || indices.length === 0) {
      if (error) console.warn('tess.worker error (final):', error)
      // Limpia la vista previa temporal
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      this.points = []
      return { graphic: null as any, controlPoints: simplified }
    }

    // 4) Crea un Mesh sólido con el resultado (sin costuras entre triángulos)
    const geom = new MeshGeometry({
      positions,
      uvs: new Float32Array((positions.length / 2) * 2),
      indices,
    })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = 0xffffff
    mesh.alpha = 1.0
    layer.addChild(mesh)

    // Limpia la vista previa temporal
    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    this.points = []

    return { graphic: mesh, controlPoints: simplified }
  }
}
