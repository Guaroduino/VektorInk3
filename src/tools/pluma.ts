import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import getStroke from 'perfect-freehand'
import simplify from 'simplify-js'
import type { InputSample } from '../input'
import { triangulateWithTess2Async } from '../geom/tessWorkerClient'
import { cleanOutline } from '../geom/clean'

// Constante para una geometría vacía, para no crearla repetidamente
// y para comprobaciones de tipo seguras.
const EMPTY_GEOMETRY = new MeshGeometry({
  positions: new Float32Array(),
  uvs: new Float32Array(),
  indices: new Uint32Array(),
})

/**
 * Pluma (Vectorial Editable)
 * - En tiempo real: muestra un Mesh de preview triangulado del contorno de perfect-freehand
 * - Al soltar: simplifica puntos y crea un Mesh permanente basado en triangulación robusta
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
  
  // Bandera de estado para prevenir race conditions entre update() y end()
  private _isEnding = false 

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

  /**
   * Limpia y oculta el mesh de vista previa asignando una geometría vacía.
   * Esta es la forma más segura de evitar condiciones de carrera.
   */
  private _clearPreviewMesh() {
    if (!this.previewMesh) return
    
    // Si la geometría ya está vacía, no hacer nada más que ocultar
    if (this.previewMesh.geometry === EMPTY_GEOMETRY) {
        this.previewMesh.visible = false;
        this._armed = false;
        return;
    }

    // Guarda la geometría antigua para destruirla
    const oldGeom = this.previewMesh.geometry;

    // Reemplaza la geometría por una vacía y estática (atómico)
    this.previewMesh.geometry = EMPTY_GEOMETRY
    this.previewMesh.visible = false
    this._armed = false

    // Destruye la geometría antigua
    oldGeom.destroy(true);
  }

  start(layer: Container) {
    // Resetea la bandera al iniciar un nuevo trazo
    this._isEnding = false 
    
    // Si el previewMesh de un trazo anterior (fallido) aún existe, destrúyelo
    if (this.previewMesh) {
        this.previewMesh.destroy({ children: true, texture: false });
        this.previewMesh = null;
    }

    // Crea un mesh de preview
    const mesh = new Mesh({ geometry: EMPTY_GEOMETRY, texture: Texture.WHITE })
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
    ;(mesh as any).blendMode = this.blendMode
    
    layer.addChild(mesh)
    this.previewMesh = mesh
    this.points = []
    
    // Asegurar un estado limpio al inicio
    this._clearPreviewMesh() 
  }

  // Pipeline con tess2 (worker) para robustez en auto-intersecciones
  update(samples: InputSample[]) {
    // Si estamos finalizando, ignora cualquier evento 'update' fantasma.
    if (this._isEnding) return

    // Acumula puntos
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure })

    if (!this.previewMesh) return

    // Guarda de estabilidad
    if (this.points.length < 8) { 
      this._clearPreviewMesh() // Limpia y oculta el mesh
      return
    }

    // 1. Obtener el polígono de perfect-freehand
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      {
        size: this.strokeSize,
        thinning: this.freehand.thinning,
        smoothing: this.freehand.smoothing,
        streamline: this.freehand.streamline,
        easing: (t: number) => t,
      }
    )

    // Guardas de estabilidad
    if (outline.length < 6) {
      this._clearPreviewMesh()
      return
    }

    {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < outline.length; i++) {
        const [x, y] = outline[i];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const w = maxX - minX, h = maxY - minY
      const diag = Math.hypot(w, h)
      if (!isFinite(diag) || diag < Math.max(4, this.strokeSize * 0.8)) {
        this._clearPreviewMesh()
        return
      }
    }

    const contour = cleanOutline(outline.map(([x, y]) => ({ x, y })), this.strokeSize)
    if (contour.length < 3) {
      this._clearPreviewMesh()
      return
    }
    
    const seq = ++this._seq
    // Añadir chequeo _isEnding aquí también
    if (this._pending || this._isEnding) return 
    
    this._pending = true

    triangulateWithTess2Async([contour], 'nonzero')
      .then(({ positions, indices }) => {
        this._pending = false
        // ¡GUARDA CRÍTICA! Si estamos finalizando, no tocar el previewMesh
        if (!this.previewMesh || this._isEnding) return 
        if (seq !== this._seq) return // Resultado obsoleto, descartar

        if (!positions || !indices || indices.length < 3 || positions.length < 6) {
          this._clearPreviewMesh() // El teselador falló
          return
        }

        // --- SOLUCIÓN A LA RACE CONDITION DE RENDERIZADO ---
        // Crear una NUEVA geometría en lugar de mutar la existente.
        const newGeom = new MeshGeometry({
            positions,
            uvs: new Float32Array((positions.length / 2) * 2), // UVs vacíos
            indices,
        });

        // Guarda la geometría antigua
        const oldGeom = this.previewMesh.geometry;

        // Reemplaza la geometría del mesh (atómico)
        this.previewMesh.geometry = newGeom; 
        this.previewMesh.visible = true
        this._armed = true

        // Destruye la geometría antigua si no es la vacía
        if (oldGeom && oldGeom !== EMPTY_GEOMETRY) {
            oldGeom.destroy(true); 
        }
      })
      .catch(() => {
        this._pending = false
      })
  }

  async end(layer: Container) {
    // Previene que 'end' se llame múltiples veces y activa la bandera
    if (this._isEnding) return { graphic: null as any, controlPoints: [] }
    this._isEnding = true // ¡Marcar estado INMEDIATAMENTE!

    // Si no está armado O los puntos son insuficientes, no crear trazo final.
    if (!this._armed || this.points.length < 8) { 
      this.previewMesh?.destroy({ children: true }) // Destruye el mesh
      this.previewMesh = null
      this.points = []
      this._isEnding = false // ¡DESBLOQUEO EN CASO DE FALLO!
      return { graphic: null as any, controlPoints: [] }
    }

    // 1) Contorno robusto con perfect-freehand
    const outline = getStroke(
      this.points.map((p) => [p.x, p.y]) as [number, number][],
      {
        size: this.strokeSize,
        thinning: this.freehand.thinning,
        smoothing: this.freehand.smoothing,
        streamline: this.freehand.streamline,
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
    const contour = cleanOutline(outline.map(([x, y]) => ({ x, y })), this.strokeSize)
    const { positions, indices } = await triangulateWithTess2Async([contour], 'nonzero')
    
    if (!indices || indices.length === 0 || !positions || positions.length < 6) {
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      this.points = []
      this._isEnding = false // ¡DESBLOQUEO EN CASO DE FALLO!
      return { graphic: null as any, controlPoints: simplified }
    }

    // 4) Crea un Mesh sólido con el resultado (sin costuras entre triángulos)
    const geom = new MeshGeometry({
      positions,
      uvs: new Float32Array((positions.length / 2) * 2), // UVs vacíos, ya que usamos Texture.WHITE
      indices,
    })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
    ;(mesh as any).blendMode = this.blendMode
    layer.addChild(mesh)

    // Limpia la vista previa temporal
    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    this.points = []
    
    // ¡¡¡DESBLOQUEO EN CASO DE ÉXITO!!!
    // (Esto se omite, ya que 'start' lo reseteará. 
    // Dejarlo aquí podría causar que 'update' se cuele si el usuario
    // empieza un nuevo trazo ANTES de que 'end' haya terminado el 'await'.)
    // ¡NO! Mi lógica anterior estaba mal. 'start' lo resetea.
    // El problema es si 'end' se llama dos veces.
    // El 'this._isEnding = true' al principio previene eso.
    // El 'this._isEnding = false' en 'start' es lo que permite el siguiente trazo.
    // ESTE CÓDIGO ES CORRECTO.
    
    return { graphic: mesh, controlPoints: simplified }
  }
}