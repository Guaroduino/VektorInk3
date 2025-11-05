import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import type { InputSample } from '../input'
import { buildStrokeStrip, type StrokeBuilderParams } from '../geom/strokeBuilder'

export class SimpleRopeTool {
  private container: Container | null = null
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number; pressure?: number; time?: number }[] = []
  private externalPreview = false

  // Style
  private widthBase = 8
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'add'
  // Pressure & dynamics
  private pressureSensitivity = true
  private pressureMode: StrokeBuilderParams['pressureMode'] = 'width'
  private pressureCurve: StrokeBuilderParams['pressureCurve'] = 'sqrt'
  private widthScaleRange: [number, number] = [0.3, 1.0]
  private opacityRange: [number, number] = [1, 1]
  private streamline = 0
  private jitter: NonNullable<StrokeBuilderParams['jitter']> = { amplitude: 0, frequency: 0.005, domain: 'distance', smooth: 0 }
  private join: NonNullable<StrokeBuilderParams['join']> = 'round'
  private miterLimit: number = 2.0
  private capStart: NonNullable<StrokeBuilderParams['capStart']> = 'round'
  private capEnd: NonNullable<StrokeBuilderParams['capEnd']> = 'round'

  // Preview cadence / decimation
  private previewCfg: { decimatePx: number; minMs: number } = { decimatePx: 0, minMs: 8 }
  private _lastUpdateTime = 0
  private _accumDist = 0
  private _rafScheduled = false
  private _token = 0
  // No asynchronous tessellation; simple strip-based preview/final

  setStyle(styleOrSize: any, color?: number) {
    if (typeof styleOrSize === 'object') {
      const s = styleOrSize as {
        strokeSize?: number
        strokeColor?: number
        opacity?: number
        blendMode?: string
        preview?: { decimatePx?: number; minMs?: number }
        pressureSensitivity?: boolean
        thinning?: any
        jitter?: StrokeBuilderParams['jitter']
        streamline?: number
        pressureMode?: StrokeBuilderParams['pressureMode']
        pressureCurve?: StrokeBuilderParams['pressureCurve']
        widthScaleRange?: [number, number]
        opacityRange?: [number, number]
        join?: 'miter' | 'bevel' | 'round'
        miterLimit?: number
        capStart?: 'butt' | 'square' | 'round'
        capEnd?: 'butt' | 'square' | 'round'
      }
  if (typeof s.strokeSize === 'number') this.widthBase = Math.max(1, Math.min(10, s.strokeSize))
      if (typeof s.strokeColor === 'number') this.strokeColor = s.strokeColor >>> 0
  // Rapidograph: force opacity 1 and blend 'add'
  this.opacity = 1.0
  this.blendMode = 'add'
      if (typeof s.pressureSensitivity === 'boolean') this.pressureSensitivity = s.pressureSensitivity
      if (typeof s.streamline === 'number') this.streamline = Math.max(0, Math.min(1, s.streamline))
  if (typeof s.pressureMode === 'string') this.pressureMode = s.pressureMode
  if (s.pressureCurve) this.pressureCurve = s.pressureCurve
  if (Array.isArray(s.widthScaleRange)) this.widthScaleRange = [Math.max(0, s.widthScaleRange[0]), Math.max(0, s.widthScaleRange[1])]
  if (Array.isArray(s.opacityRange)) this.opacityRange = [Math.max(0, s.opacityRange[0]), Math.max(0, s.opacityRange[1])]
  if (s.jitter) this.jitter = { ...this.jitter, ...s.jitter }
  // Rapidograph: enforce round joins and round caps
  this.join = 'round'
  if (typeof s.miterLimit === 'number') this.miterLimit = Math.max(1, s.miterLimit)
  this.capStart = 'round'
  this.capEnd = 'round'
      if (s.preview) {
        this.previewCfg = {
          decimatePx: Math.max(0, s.preview.decimatePx ?? this.previewCfg.decimatePx),
          minMs: Math.max(0, s.preview.minMs ?? this.previewCfg.minMs),
        }
      }
      // live-apply to current preview
      if (this.previewMesh) {
        ;(this.previewMesh as any).tint = this.strokeColor
        this.previewMesh.alpha = this.opacity
        ;(this.previewMesh as any).blendMode = this.blendMode
      }
    } else {
      this.widthBase = Math.max(1, Math.min(10, styleOrSize))
      this.strokeColor = (color ?? this.strokeColor) >>> 0
    }
  }

  start(layer: Container) {
    this.container = layer
    this.points = []
    this._lastUpdateTime = 0
    this._accumDist = 0
  // Rope preview Mesh creado vacío; iremos llenando sus buffers
    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE }) as any
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
    mesh.blendMode = this.blendMode
    mesh.cullable = false
    ;(mesh as any).size = 0
    this.container.addChild(mesh)
    this.previewMesh = mesh
  }
  
  update(samples: InputSample[]) {
    if (!samples || samples.length === 0) return

    // Distance accumulation for cadence
    if (this.points.length) {
      let prev = this.points[this.points.length - 1]
      for (const s of samples) {
        const dx = s.x - prev.x
        const dy = s.y - prev.y
        this._accumDist += Math.hypot(dx, dy)
        prev = { x: s.x, y: s.y }
      }
    }

    // Decimate and append points
    const minDist = Math.max(0, this.previewCfg.decimatePx)
    let last = this.points[this.points.length - 1]
    for (const s of samples) {
      if (!last) {
        const p = { x: s.x, y: s.y, pressure: this.pressureSensitivity ? (s.pressure ?? 1) : 1, time: s.time }
        this.points.push(p)
        last = p
        continue
      }
      const dx = s.x - last.x
      const dy = s.y - last.y
      if (Math.hypot(dx, dy) >= minDist) {
        const p = { x: s.x, y: s.y, pressure: this.pressureSensitivity ? (s.pressure ?? 1) : 1, time: s.time }
        this.points.push(p)
        last = p
      }
    }

    if (this.externalPreview) return

    // Throttle geometry updates for performance
    if (!this.previewMesh) return
    if (!this._rafScheduled) {
      this._rafScheduled = true
      requestAnimationFrame(() => {
        this._rafScheduled = false
        const tokenAtSchedule = this._token
        // The stroke could have ended while a frame was queued
        if (!this.previewMesh || tokenAtSchedule !== this._token) return
        const now = performance.now ? performance.now() : Date.now()
        if (now - this._lastUpdateTime < this.previewCfg.minMs && this._accumDist < Math.max(2, this.previewCfg.decimatePx * 2)) return
        this._lastUpdateTime = now
        this._accumDist = 0
        this._updatePreviewGeometry()
      })
    }
  }

  end() {
    let res: any = null
    if (this.externalPreview) {
      // Construir Mesh final a partir de los puntos
      if (this.container && this.points.length >= 2) {
        const { strip } = buildStrokeStrip(this.points as any, this._params())
        const geom = new MeshGeometry({ positions: strip.positions, uvs: strip.uvs, indices: strip.indices })
        const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE }) as any
        mesh.tint = this.strokeColor
        mesh.alpha = this.opacity
        mesh.blendMode = this.blendMode
        mesh.cullable = false
        this.container.addChild(mesh)
        res = { mesh }
      }
    } else {
      // Ensure final geometry includes the last samples and rounded caps
      if (this.previewMesh && this.points.length >= 2) {
        this._updatePreviewGeometry()
        res = { mesh: this.previewMesh }
      } else {
        res = null
      }
    }
    // Keep the mesh in the layer for history; detach internal refs only
    this._token++
    this.previewMesh = null
    this.container = null
    this.points = []
    return res
  }

  private _params(): StrokeBuilderParams {
    return {
      baseWidth: this.widthBase,
      pressureSensitivity: this.pressureSensitivity,
      pressureMode: this.pressureMode,
      pressureCurve: this.pressureCurve,
      widthScaleRange: this.widthScaleRange,
      opacityRange: this.opacityRange,
      thinning: undefined,
      jitter: this.jitter,
      streamline: this.streamline,
      join: this.join,
      miterLimit: this.miterLimit,
      capStart: this.capStart,
      capEnd: this.capEnd,
    }
  }

  private _updatePreviewGeometry() {
    if (!this.previewMesh) return
    // Build strip with enforced round joins and caps
    const { strip } = buildStrokeStrip(this.points as any, this._params())
    this._applyStripToMesh(strip.positions, strip.uvs, strip.indices)
  }

  private _applyLocalGeometry() {
    if (!this.previewMesh) return
    const { strip } = buildStrokeStrip(this.points as any, this._params())
    this._applyStripToMesh(strip.positions, strip.uvs, strip.indices)
  }

  private _applyStripToMesh(positions: Float32Array, uvs: Float32Array, indices: Uint32Array) {
    if (!this.previewMesh) return
    const mesh = this.previewMesh
    const g: any = mesh.geometry
    if (indices.length < 3 || positions.length < 4) {
      try {
        g.buffers[0].data = new Float32Array(0); g.buffers[0].update()
        g.buffers[1].data = new Float32Array(0); g.buffers[1].update()
        g.indexBuffer.data = new Uint32Array(0); g.indexBuffer.update()
        ;(mesh as any).size = 0
        mesh.visible = false
      } catch {}
      return
    }
    // Prefer 16-bit indices when possible to avoid OES_element_index_uint issues
    let idxAny: any = indices
    {
      let max = 0
      for (let i = 0; i < indices.length; i++) if (indices[i] > max) max = indices[i]
      if (max < 65535) idxAny = new Uint16Array(indices)
    }
    // Ensure UVs length matches vertex count (fill zeros if needed)
    const vcount = positions.length / 2
    let uvsData = uvs
    if (!uvs || uvs.length !== vcount * 2) {
      uvsData = new Float32Array(vcount * 2)
    }
    g.buffers[0].data = positions; g.buffers[0].update()
    g.buffers[1].data = uvsData; g.buffers[1].update()
    g.indexBuffer.data = idxAny; g.indexBuffer.update()
    ;(mesh as any).size = (idxAny as Uint16Array | Uint32Array).length
    ;(g as any).vertexCount = positions.length / 2
    mesh.visible = true
  }

  // --- Rope-specific controls ---
  setPressureRange(min: number, max: number) {
    this.widthScaleRange = [Math.max(0, Math.min(1, min)), Math.max(0, Math.min(1, max))]
  }
  getPressureRange(): [number, number] { return this.widthScaleRange }
  setPressureCurve(curve: StrokeBuilderParams['pressureCurve']) {
    this.pressureCurve = curve; this._requestImmediateUpdate()
  }
  getPressureCurve() { return this.pressureCurve }
  setJoin(style: 'miter' | 'bevel' | 'round') {
    this.join = style; this._requestImmediateUpdate()
  }
  getJoin() { return this.join }
  setMiterLimit(limit: number) {
    this.miterLimit = Math.max(1, limit); this._requestImmediateUpdate()
  }
  getMiterLimit() { return this.miterLimit }
  setCaps(start: 'butt'|'square'|'round', end: 'butt'|'square'|'round') {
    this.capStart = start; this.capEnd = end; this._requestImmediateUpdate()
  }
  getCaps(): { start: 'butt'|'square'|'round'; end: 'butt'|'square'|'round' } {
    return { start: this.capStart, end: this.capEnd }
  }

  private _requestImmediateUpdate() {
    // Schedule a near-immediate geometry update to reflect style changes mid-stroke
    if (!this.previewMesh) return
    if (!this._rafScheduled) {
      this._rafScheduled = true
      requestAnimationFrame(() => {
        this._rafScheduled = false
        if (!this.previewMesh) return
        this._updatePreviewGeometry()
      })
    }
  }

  // Permite delegar el preview a un proceso externo (worker)
  setExternalPreviewEnabled(on: boolean) {
    this.externalPreview = !!on
    if (on && this.previewMesh) {
      try { this.previewMesh.visible = false } catch {}
    }
  }
}