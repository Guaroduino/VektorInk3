import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import type { InputSample } from '../input'
import { buildStrokeStrip, type StrokeBuilderParams } from '../geom/strokeBuilder'
import { decimateByDistance } from '../geom/decimate'

/**
 * LapizVectorialOri: versión sencilla del lápiz vectorial
 * - Preview y final usan el mismo generador de strip (buildStrokeStrip)
 * - Sin shader de alpha per-vertex (usa alpha uniforme)
 */
export class LapizVectorialOriTool {
  private previewMesh: Mesh | null = null
  private container: Container | null = null
  private points: { x: number; y: number; pressure?: number; time?: number }[] = []

  // Estilo básico
  private widthBase = 6
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'normal'
  private pressureSensitivity = true
  private pressureMode: StrokeBuilderParams['pressureMode'] = 'width'
  private pressureCurve: StrokeBuilderParams['pressureCurve'] = 'sqrt'
  private widthScaleRange: [number, number] = [0.5, 1.0]
  private opacityRange: [number, number] = [1.0, 1.0]
  private thinning: StrokeBuilderParams['thinning'] = undefined
  private jitter: StrokeBuilderParams['jitter'] = undefined
  private streamline: number = 0

  // Preview cadence / decimation
  private previewCfg: { decimatePx: number; minMs: number } = { decimatePx: 0, minMs: 16 }
  private _rafScheduled = false
  private _lastUpdateTime = 0
  private _accumDist = 0

  setStyle(styleOrSize: any, color?: number) {
    if (typeof styleOrSize === 'object') {
      const s = styleOrSize as {
        strokeSize?: number; strokeColor?: number; opacity?: number; blendMode?: string;
        pressureSensitivity?: boolean; pressureMode?: StrokeBuilderParams['pressureMode'];
        pressureCurve?: StrokeBuilderParams['pressureCurve']
        widthScaleRange?: [number, number]
        opacityRange?: [number, number]
        thinning?: StrokeBuilderParams['thinning']
        jitter?: StrokeBuilderParams['jitter']
        streamline?: number
        preview?: { decimatePx?: number; minMs?: number }
      }
      if (typeof s.strokeSize === 'number') this.widthBase = Math.max(1, s.strokeSize)
      if (typeof s.strokeColor === 'number') this.strokeColor = s.strokeColor >>> 0
      if (typeof s.opacity === 'number') this.opacity = Math.max(0.01, Math.min(1, s.opacity))
      if (typeof s.blendMode === 'string') this.blendMode = s.blendMode as any
      if (typeof s.pressureSensitivity === 'boolean') this.pressureSensitivity = s.pressureSensitivity
      if (s.pressureMode) this.pressureMode = s.pressureMode
      if (s.pressureCurve) this.pressureCurve = s.pressureCurve
      if (s.widthScaleRange) this.widthScaleRange = s.widthScaleRange
      if (s.opacityRange) this.opacityRange = s.opacityRange
      if (s.thinning) this.thinning = { ...s.thinning }
      if (s.jitter) this.jitter = { ...s.jitter }
      if (typeof s.streamline === 'number') this.streamline = Math.max(0, Math.min(1, s.streamline))
      if (s.preview) {
        this.previewCfg = {
          decimatePx: Math.max(0, s.preview.decimatePx ?? this.previewCfg.decimatePx),
          minMs: Math.max(0, s.preview.minMs ?? this.previewCfg.minMs),
        }
      }
      // Aplicar en vivo al preview
      if (this.previewMesh) {
        ;(this.previewMesh as any).tint = this.strokeColor
        this.previewMesh.alpha = this.opacity
        ;(this.previewMesh as any).blendMode = this.blendMode
      }
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

    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    ;(mesh as any).tint = this.strokeColor
    mesh.alpha = this.opacity
    ;(mesh as any).blendMode = this.blendMode
    ;(mesh as any).size = 0
    ;(geom as any).vertexCount = 0
    layer.addChild(mesh)
    this.previewMesh = mesh
  }

  update(samples: InputSample[]) {
    if (!samples || samples.length === 0) return

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
    const pts = this.previewCfg.decimatePx > 0 ? decimateByDistance(this.points as any, this.previewCfg.decimatePx) : this.points
    const { strip } = buildStrokeStrip(pts as any, this._builderParams())
    const idx = strip.indices

    // Preferir 16-bit si es posible
    let indices: Uint32Array | Uint16Array = idx
    {
      let max = 0
      for (let i = 0; i < idx.length; i++) if (idx[i] > max) max = idx[i]
      if (max < 65535) indices = new Uint16Array(idx)
    }

    if (indices.length < 3 || strip.positions.length < 4) {
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

    geom.buffers[0].data = strip.positions
    geom.buffers[0].update()
    geom.buffers[1].data = strip.uvs
    geom.buffers[1].update()
    geom.indexBuffer.data = indices
    geom.indexBuffer.update()
    ;(this.previewMesh as any).size = indices.length
    ;(geom as any).vertexCount = strip.positions.length / 2
    this.previewMesh.alpha = this.opacity
    this.previewMesh.visible = true
  }

  end() {
    if (!this.container || this.points.length < 2) {
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      this.container = null
      this.points = []
      return null
    }

    const { strip } = buildStrokeStrip(this.points as any, this._builderParams())
    const idx = strip.indices
    let indices: Uint32Array | Uint16Array = idx
    {
      let max = 0
      for (let i = 0; i < idx.length; i++) if (idx[i] > max) max = idx[i]
      if (max < 65535) indices = new Uint16Array(idx)
    }

    const geom = new MeshGeometry({ positions: strip.positions, uvs: strip.uvs, indices: indices as any })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE }) as any
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
    mesh.blendMode = this.blendMode
    ;(mesh as any).size = indices.length
    ;(geom as any).vertexCount = strip.positions.length / 2
    this.container.addChild(mesh)

    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    const result = { mesh, points: this.points }
    this.container = null
    this.points = []
    return result
  }
}
