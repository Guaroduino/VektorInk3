import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import type { InputSample } from '../input'
import { buildStrokeStrip, type StrokeBuilderParams, type PressureMode } from '../geom/strokeBuilder'
import { createAlphaStripShader, updateAlphaStripShader } from '../graphics/alphaStripShader'
import { decimateByDistance } from '../geom/decimate'

/**
 * Lápiz Vectorial (No Editable):
 * - Calcula geometría en worker (pendiente). Aquí dejamos un stub que crea un Mesh básico.
 * - En producción: pipeline: input -> stroke.worker.ts (geometría + alpha) -> Mesh en hilo principal.
 */
export class LapizVectorTool {
  private previewMesh: Mesh | null = null
  private container: Container | null = null
  private points: { x: number; y: number; pressure?: number; time?: number }[] = []
  private widthBase = 6
  private strokeColor = 0xffffff
  private opacity = 0.12
  private blendMode: any = 'add'
  private pressureSensitivity = true
  private pressureMode: PressureMode = 'width'
  private pressureCurve: 'linear' | 'sqrt' | 'square' | { exponent: number } = 'linear'
  private widthScaleRange: [number, number] = [0.5, 1.0]
  private opacityRange: [number, number] = [0.5, 1.0]
  private thinning: { minSpeedScale?: number; speedRefPxPerMs?: number; window?: number; exponent?: number } | undefined = undefined
  private jitter: { amplitude?: number; frequency?: number; seed?: number; smooth?: number; domain?: 'distance' | 'time' } | undefined = undefined
  private streamline: number = 0
  private usingPerVertexAlpha = false
  private previewCfg: { decimatePx: number; minMs: number } = { decimatePx: 0, minMs: 16 }
  private _rafScheduled = false
  private _lastUpdateTime = 0
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
      if (typeof s.strokeSize === 'number') this.widthBase = Math.max(1, s.strokeSize)
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
  if ((s as any).preview) this.previewCfg = { ...((s as any).preview) }
    } else {
      this.widthBase = Math.max(1, styleOrSize)
      this.strokeColor = (color ?? this.strokeColor) >>> 0
    }
  }

  private _builderParams(): StrokeBuilderParams {
    return {
      baseWidth: this.widthBase,
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

  start(layer: Container) {
    this.container = layer
    this.points = []
    this._lastUpdateTime = 0
    this._accumDist = 0

    // Crea un mesh de preview vacío que iremos actualizando en tiempo real
    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = this.strokeColor
    // Igualar estilo al trazo final
  mesh.alpha = this.opacity
  ;(mesh as any).blendMode = this.blendMode
    ;(mesh as any).size = 0
    ;(geom as any).vertexCount = 0
    layer.addChild(mesh)
    this.previewMesh = mesh
    this.usingPerVertexAlpha = false
  }

  update(samples: InputSample[]) {
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
    if (!this._rafScheduled) {
      this._rafScheduled = true
      requestAnimationFrame(() => {
        this._rafScheduled = false
        this._previewStep()
      })
    }
  }

  private _previewStep() {
    if (!this.previewMesh) return
    const now = performance.now ? performance.now() : Date.now()
    const minMs = Math.max(0, this.previewCfg.minMs | 0)
    if (now - this._lastUpdateTime < minMs && this._accumDist < Math.max(2, this.previewCfg.decimatePx * 2)) return
    this._lastUpdateTime = now
    this._accumDist = 0
    const geom = this.previewMesh.geometry
    const decPts = this.previewCfg.decimatePx > 0 ? decimateByDistance(this.points as any, this.previewCfg.decimatePx) : this.points
    const { strip, factors } = buildStrokeStrip(decPts as any, this._builderParams())
    if (strip.indices.length < 3) {
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
    const wantPerVertex = (this.pressureMode === 'opacity' || this.pressureMode === 'both') && !!factors.opacityFactor
    if (wantPerVertex) {
      // Build per-vertex alpha attribute (duplicate per centerline point into its two vertices)
      const fa = factors.opacityFactor as Float32Array
      const n = fa.length
      const aAlpha = new Float32Array(n * 2)
      for (let i = 0; i < n; i++) { aAlpha[2 * i] = fa[i]; aAlpha[2 * i + 1] = fa[i] }
      const g: any = this.previewMesh.geometry
      // Ensure we have the attribute; calling addAttribute again should replace the buffer in Pixi v8
      if (typeof g.addAttribute === 'function') {
        g.addAttribute('aAlpha', aAlpha, 1)
      }
      // Update built-in buffers in place
      g.buffers[0].data = strip.positions
      g.buffers[0].update()
      g.buffers[1].data = strip.uvs
      g.buffers[1].update()
      g.indexBuffer.data = strip.indices
      g.indexBuffer.update()
      ;(this.previewMesh as any).size = strip.indices.length
      ;(g as any).vertexCount = strip.positions.length / 2
      // attach or update shader
      if (!this.usingPerVertexAlpha || !(this.previewMesh as any).shader || !(this.previewMesh as any).shader.resources?.uTint) {
        ;(this.previewMesh as any).shader = createAlphaStripShader(this.strokeColor, this.opacity)
      } else {
        updateAlphaStripShader((this.previewMesh as any).shader, this.strokeColor, this.opacity)
      }
      // Avoid double alpha: keep mesh alpha at 1.0 and use shader's global alpha
      this.previewMesh.alpha = 1.0
      this.usingPerVertexAlpha = true
    } else {
      // default shader path (no per-vertex alpha)
      geom.buffers[0].data = strip.positions
      geom.buffers[0].update()
      geom.buffers[1].data = strip.uvs
      geom.buffers[1].update()
      geom.indexBuffer.data = strip.indices
      geom.indexBuffer.update()
      ;(this.previewMesh as any).size = strip.indices.length
      ;(geom as any).vertexCount = strip.positions.length / 2
      // Ensure default alpha in mesh (uniform)
      this.previewMesh.alpha = this.opacity
      // remove custom shader if previously assigned
      if ((this.previewMesh as any).shader && (this.previewMesh as any).shader.resources?.uTint) {
        ;(this.previewMesh as any).shader = undefined
      }
      this.usingPerVertexAlpha = false
    }
    this.previewMesh.visible = true
  }

  end() {
    if (!this.container || this.points.length < 2) {
      // Limpia preview si existe
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      this.container = null
      this.points = []
      return null
    }
    const { strip, factors } = buildStrokeStrip(this.points as any, this._builderParams())
    let geom: MeshGeometry
    let usePerVertex = (this.pressureMode === 'opacity' || this.pressureMode === 'both') && !!factors.opacityFactor
    if (usePerVertex && factors.opacityFactor) {
      const fa = factors.opacityFactor
      const n = fa.length
      const aAlpha = new Float32Array(n * 2)
      for (let i = 0; i < n; i++) { aAlpha[2 * i] = fa[i]; aAlpha[2 * i + 1] = fa[i] }
      geom = new MeshGeometry({ positions: strip.positions, uvs: strip.uvs, indices: strip.indices })
      if (typeof (geom as any).addAttribute === 'function') {
        ;(geom as any).addAttribute('aAlpha', aAlpha, 1)
      }
    } else {
      geom = new MeshGeometry({ positions: strip.positions, uvs: strip.uvs, indices: strip.indices })
    }

    // Usamos el shader por defecto de Pixi para que respete transformaciones (pan/zoom)
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
  // assign shader/material depending on per-vertex alpha usage
  if (usePerVertex) {
    ;(mesh as any).shader = createAlphaStripShader(this.strokeColor, this.opacity)
    mesh.alpha = 1.0
  } else {
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
  }
  ;(mesh as any).blendMode = this.blendMode

    this.container.addChild(mesh)
  ;(mesh as any).size = strip.indices.length
  ;(geom as any).vertexCount = strip.positions.length / 2

    // Elimina la vista previa temporal
    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null

    const result = { mesh, points: this.points }
    this.container = null
    this.points = []
    return result
  }
}
