import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import simplify from 'simplify-js'
import type { InputSample } from '../input'
import { buildStrokeStrip, buildOuterPolygon, type StrokeBuilderParams, type PressureMode } from '../geom/strokeBuilder'
import { triangulateWithTess2Async } from '../geom/tessWorkerClient'

/**
 * Pluma (Vectorial Editable)
 * - Feedback tiempo real igual a PincelContorno (Mesh asíncrono)
 * - Al soltar: simplifica los PUNTOS DE ENTRADA y crea un Mesh permanente
 */
export class PlumaTool {
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number; pressure?: number; time?: number }[] = []
  private strokeSize = 8
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'normal'
  private pressureSensitivity = true
  private pressureMode: PressureMode = 'width'
  private pressureCurve: 'linear' | 'sqrt' | 'square' | { exponent: number } = 'linear'
  private widthScaleRange: [number, number] = [0.5, 1.0]
  private opacityRange: [number, number] = [0.5, 1.0]
  private thinning: { minSpeedScale?: number; speedRefPxPerMs?: number; window?: number; exponent?: number } | undefined = undefined
  private jitter: { amplitude?: number; frequency?: number; seed?: number; smooth?: number; domain?: 'distance' | 'time' } | undefined = undefined
  private streamline: number = 0

  private _isEnding = false // Bandera de estado
  private _seq = 0
  private _pending = false
  private _strokeToken = 0
  private _lastTessTime = 0
  private _accumDist = 0

  setStyle(styleOrSize: any, color?: number) {
    if (typeof styleOrSize === 'object') {
      const s = styleOrSize as {
        strokeSize?: number; strokeColor?: number; opacity?: number; blendMode?: string;
        pressureSensitivity?: boolean; pressureMode?: PressureMode;
        pressureCurve?: 'linear' | 'sqrt' | 'square' | { exponent: number }
        widthScaleRange?: [number, number]
        opacityRange?: [number, number]
        thinning?: { minSpeedScale?: number; speedRefPxPerMs?: number; window?: number; exponent?: number }
        jitter?: { amplitude?: number; frequency?: number; seed?: number }
      }
      if (typeof s.strokeSize === 'number') this.strokeSize = s.strokeSize
      if (typeof s.strokeColor === 'number') this.strokeColor = s.strokeColor >>> 0
      if (typeof s.opacity === 'number') this.opacity = s.opacity
      if (typeof s.blendMode === 'string') this.blendMode = s.blendMode as any
      if (typeof s.pressureSensitivity === 'boolean') this.pressureSensitivity = s.pressureSensitivity
      if (s.pressureMode) this.pressureMode = s.pressureMode
      if (s.pressureCurve) this.pressureCurve = s.pressureCurve
      if (s.widthScaleRange) this.widthScaleRange = s.widthScaleRange
      if (s.opacityRange) this.opacityRange = s.opacityRange
      if (s.thinning) this.thinning = { ...s.thinning }
  if (s.jitter) this.jitter = { ...s.jitter }
  if (typeof (s as any).streamline === 'number') this.streamline = Math.max(0, Math.min(1, (s as any).streamline))
    } else {
      this.strokeSize = styleOrSize
      this.strokeColor = (color ?? this.strokeColor) >>> 0
    }
  }

  start(layer: Container) {
    this._isEnding = false // Resetea la bandera
    this._seq = 0
    this._pending = false
    this._strokeToken++

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
  }

  // Preview con builder unificado
  update(samples: InputSample[]) {
    if (this._isEnding) return
    // accumulate points and measure added distance to throttle heavy tessellation
    if (samples.length) {
      if (this.points.length) {
        let prev = this.points[this.points.length - 1]
        for (const s of samples) {
          const dx = s.x - prev.x
          const dy = s.y - prev.y
          this._accumDist += Math.hypot(dx, dy)
          prev = { x: s.x, y: s.y }
        }
      }
      for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure, time: s.time })
    }
    if (!this.previewMesh) return
    const now = performance.now ? performance.now() : Date.now()
    // throttle: at most ~60 Hz and only after enough path growth
    if (this._pending) return
    if (now - this._lastTessTime < 16 && this._accumDist < 6) return
    this._lastTessTime = now
    this._accumDist = 0
    const geom = this.previewMesh.geometry
    // Tessellate polygon for preview to avoid self-overlap accumulation
    const { outlines } = buildStrokeStrip(this.points as any, this._builderParams())
    const polyF32 = buildOuterPolygon(outlines.left, outlines.right, true)
    if (polyF32.length < 6) {
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
    const poly: { x: number; y: number }[] = []
    for (let i = 0; i < polyF32.length - 2; i += 2) poly.push({ x: polyF32[i], y: polyF32[i + 1] })
    const seq = ++this._seq
    const token = this._strokeToken
    this._pending = true
    triangulateWithTess2Async([poly], 'nonzero').then(({ positions, indices }) => {
      this._pending = false
      if (!this.previewMesh) return
      if (token !== this._strokeToken) return
      if (seq !== this._seq) return
      if (!positions || !indices || indices.length < 3) {
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
      const uvs = new Float32Array((positions.length / 2) * 2)
      geom.buffers[0].data = positions
      geom.buffers[0].update()
      geom.buffers[1].data = uvs
      geom.buffers[1].update()
      geom.indexBuffer.data = indices
      geom.indexBuffer.update()
      ;(this.previewMesh as any).size = indices.length
      ;(geom as any).vertexCount = positions.length / 2
      this.previewMesh.visible = true
      this.previewMesh.alpha = this.opacity
    }).catch(() => { this._pending = false })
  }

  async end(layer: Container) {
    if (this._isEnding) return { graphic: null as any, controlPoints: [] }
    this._isEnding = true

    if (this.points.length < 2) {
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      this.points = []
      this._isEnding = false
      return { graphic: null as any, controlPoints: [] }
    }

    const { outlines } = buildStrokeStrip(this.points as any, this._builderParams())
    const polyF32 = buildOuterPolygon(outlines.left, outlines.right, true)
    const poly: { x: number; y: number }[] = []
    for (let i = 0; i < polyF32.length - 2; i += 2) poly.push({ x: polyF32[i], y: polyF32[i + 1] })
    const { positions, indices } = await triangulateWithTess2Async([poly], 'nonzero')

    // Crear Mesh final tessellated (no self-overlap accumulation)
    const finalGeom = new MeshGeometry({
      positions,
      uvs: new Float32Array((positions.length / 2) * 2),
      indices,
    })
    const finalMesh = new Mesh({ geometry: finalGeom, texture: Texture.WHITE })
    finalMesh.tint = this.strokeColor
    // Pluma: sin acumulación de opacidad por presión (siempre uniforme)
    finalMesh.alpha = this.opacity
    ;(finalMesh as any).blendMode = this.blendMode

    // Añadir a la escena
    layer.addChild(finalMesh)
  ;(finalMesh as any).size = indices.length
  ;(finalGeom as any).vertexCount = positions.length / 2

    // Datos para edición posterior (centerline editable + settings)
    const simplified = simplify(this.points.map(p => ({ x: p.x, y: p.y })), 1.5, true)
    const editable = {
      type: 'pluma' as const,
      points: this.points.slice(), // conservar presión y tiempo
      width: {
        base: this.strokeSize,
        pressureMode: this.pressureMode,
        pressureCurve: this.pressureCurve,
        widthScaleRange: this.widthScaleRange,
        opacityRange: this.opacityRange,
        thinning: this.thinning,
        jitter: this.jitter,
      },
      style: { color: this.strokeColor, opacity: this.opacity, blendMode: this.blendMode },
    }

    // Limpiar preview
    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    this.points = []
    this._isEnding = false

    return { graphic: finalMesh, controlPoints: simplified, editable }
  }

  private _builderParams(): StrokeBuilderParams {
    return {
      baseWidth: this.strokeSize,
      pressureSensitivity: this.pressureSensitivity,
      pressureMode: this.pressureMode,
      pressureCurve: this.pressureCurve,
      widthScaleRange: this.widthScaleRange,
      opacityRange: this.opacityRange,
      thinning: this.thinning,
      jitter: this.jitter,
      streamline: this.streamline,
    }
  }
}