import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import getStroke from 'perfect-freehand'
import simplify from 'simplify-js'
import type { InputSample } from '../input'
import { triangulateWithTess2Async } from '../geom/tessWorkerClient'
import { cleanOutline } from '../geom/clean'

/**
 * Pluma (Vectorial Editable)
 * - Feedback tiempo real igual a PincelContorno (Mesh asíncrono)
 * - Al soltar: simplifica los PUNTOS DE ENTRADA y crea un Mesh permanente
 */
export class PlumaTool {
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number; pressure?: number }[] = []
  private strokeSize = 8
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'normal'
  private freehand = { thinning: 0.6, smoothing: 0.6, streamline: 0.5 } 
  private _armed = false
  private _seq = 0
  private _pending = false
  private _isEnding = false // Bandera de estado

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
    this._isEnding = false // Resetea la bandera

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

  // (Esta función 'update' es la que funciona para ti, la dejamos igual)
  update(samples: InputSample[]) {
    if (this._isEnding) return 
    
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    if (!this.previewMesh) return
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      { 
        size: this.strokeSize, 
        thinning: this.freehand.thinning, 
        smoothing: this.freehand.smoothing, 
        streamline: this.freehand.streamline 
      }
    )
    const geom = this.previewMesh.geometry
    if (outline.length < 6) {
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
    if (this._pending || this._isEnding) return
    this._pending = true
    triangulateWithTess2Async([contour], 'nonzero')
      .then(({ positions, indices }) => {
        this._pending = false
        if (!this.previewMesh || this._isEnding) return
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
    if (this._isEnding) return { graphic: null as any, controlPoints: [] }
    this._isEnding = true

    // --- NO OCULTAR EL PREVIEW AQUÍ ---
    // if (this.previewMesh) {
    //   this.previewMesh.visible = false; // <-- ESTO CAUSA EL FLICK
    // }

    if (!this._armed || this.points.length < 8) {
        this.previewMesh?.destroy({ children: true });
        this.previewMesh = null;
        this.points = [];
        this._isEnding = false; // DESBLOQUEAR
        return { graphic: null as any, controlPoints: [] };
    }

    // Copia los puntos ahora, antes del await
    const pointsToProcess = [...this.points];

    // 1) Simplifica los PUNTOS DE ENTRADA (para edición)
    const simplified = simplify(
      pointsToProcess.map((p) => ({ x: p.x, y: p.y })),
      1.5,
      true
    )
    
    // 2) Obtener contorno final de perfect-freehand
    const outline = getStroke(
      pointsToProcess.map((p) => [p.x, p.y]) as [number, number][],
      { 
        size: this.strokeSize, 
        thinning: this.freehand.thinning, 
        smoothing: this.freehand.smoothing, 
        streamline: this.freehand.streamline 
      }
    )

    // 3) Limpiar y triangular (Asíncrono)
    const poly = cleanOutline(outline.map(([x, y]) => ({ x, y })), this.strokeSize)
    
    let positions: Float32Array;
    let indices: Uint32Array;

    try {
        const result = await triangulateWithTess2Async([poly], 'nonzero'); // <-- PUNTO DE PAUSA
        if (!result.indices || result.indices.length === 0 || !result.positions || result.positions.length < 6) {
            throw new Error("Triangulación asíncrona fallida o vacía");
        }
        positions = result.positions;
        indices = result.indices;
    } catch (e) {
        console.error("Fallo de teselación en end():", e);
        this.previewMesh?.destroy();
        this.previewMesh = null;
        this.points = [];
        this._isEnding = false; // DESBLOQUEAR
        return { graphic: null as any, controlPoints: simplified };
    }

    // --- EL AWAIT HA TERMINADO ---

    // 4) Crear Mesh final
    const finalGeom = new MeshGeometry({
      positions,
      uvs: new Float32Array((positions.length / 2) * 2),
      indices,
    })
    const finalMesh = new Mesh({ geometry: finalGeom, texture: Texture.WHITE })
    finalMesh.tint = this.strokeColor
    finalMesh.alpha = this.opacity
    ;(finalMesh as any).blendMode = this.blendMode
    
    // 5) AÑADIR EL MESH FINAL A LA ESCENA
    layer.addChild(finalMesh)
    ;(finalMesh as any).size = indices.length
    ;(finalMesh as any).vertexCount = positions.length / 2

    // 6) DESTRUIR EL PREVIEW *DESPUÉS* DE AÑADIR EL FINAL
    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    this.points = []

    this._isEnding = false // ¡DESBLOQUEAR!

    return { graphic: finalMesh, controlPoints: simplified }
  }
}