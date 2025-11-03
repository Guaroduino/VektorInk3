import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import type { InputSample } from '../input'
import { buildStrokeStrip, type StrokeBuilderParams } from '../geom/strokeBuilder'

export class SimpleRopeTool {
  private container: Container | null = null
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number }[] = []

  // Style
  private widthBase = 8
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'normal'

  // Preview cadence / decimation
  private previewCfg: { decimatePx: number; minMs: number } = { decimatePx: 0, minMs: 8 }
  private _lastUpdateTime = 0
  private _accumDist = 0
  private _rafScheduled = false
  private _token = 0

  setStyle(styleOrSize: any, color?: number) {
    if (typeof styleOrSize === 'object') {
      const s = styleOrSize as {
        strokeSize?: number
        strokeColor?: number
        opacity?: number
        blendMode?: string
        preview?: { decimatePx?: number; minMs?: number }
      }
      if (typeof s.strokeSize === 'number') this.widthBase = Math.max(1, s.strokeSize)
      if (typeof s.strokeColor === 'number') this.strokeColor = s.strokeColor >>> 0
      if (typeof s.opacity === 'number') this.opacity = Math.max(0.01, Math.min(1, s.opacity))
      if (typeof s.blendMode === 'string') this.blendMode = s.blendMode as any
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
      this.widthBase = Math.max(1, styleOrSize)
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
        const p = { x: s.x, y: s.y }
        this.points.push(p)
        last = p
        continue
      }
      const dx = s.x - last.x
      const dy = s.y - last.y
      if (Math.hypot(dx, dy) >= minDist) {
        const p = { x: s.x, y: s.y }
        this.points.push(p)
        last = p
      }
    }

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
    const res = this.previewMesh && this.points.length >= 2 ? { mesh: this.previewMesh } : null
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
      pressureSensitivity: false,
      pressureMode: 'width',
      pressureCurve: 'linear',
      widthScaleRange: [1, 1],
      opacityRange: [1, 1],
      thinning: undefined,
      jitter: undefined,
      streamline: 0,
    }
  }

  private _updatePreviewGeometry() {
    if (!this.previewMesh) return
    const { strip } = buildStrokeStrip(this.points as any, this._params())
    const mesh = this.previewMesh
    const g: any = mesh.geometry
    if (strip.indices.length < 3) {
      try {
        g.buffers[0].data = new Float32Array(0); g.buffers[0].update()
        g.buffers[1].data = new Float32Array(0); g.buffers[1].update()
        g.indexBuffer.data = new Uint32Array(0); g.indexBuffer.update()
        ;(mesh as any).size = 0
        mesh.visible = false
      } catch {}
      return
    }
    g.buffers[0].data = strip.positions; g.buffers[0].update()
    g.buffers[1].data = strip.uvs; g.buffers[1].update()
    g.indexBuffer.data = strip.indices; g.indexBuffer.update()
    ;(mesh as any).size = strip.indices.length
    mesh.visible = true
  }
}
