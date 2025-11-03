import { Container, Mesh, Texture, Point, RopeGeometry, type MeshGeometry } from 'pixi.js'

export class SimpleRopeTool {
  private container: Container | null = null
  private rope: Mesh | null = null
  private points: Point[] = []

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
      // live-apply to current rope
      if (this.rope) {
        ;(this.rope as any).tint = this.strokeColor
        this.rope.alpha = this.opacity
        ;(this.rope as any).blendMode = this.blendMode
        const g: any = this.rope.geometry as MeshGeometry
        if (g && typeof g === 'object') {
          if ('width' in g) (g as any).width = this.widthBase
          if (typeof g.updateVertices === 'function') g.updateVertices()
          else if (typeof g.update === 'function') g.update()
        }
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
    // Rope will be created lazily on first input point
  }

  private _ensureRopeInitialized(p: Point) {
    if (this.rope || !this.container) return
    // Seed with a duplicated first point so geometry has length
    this.points.push(new Point(p.x, p.y))
    this.points.push(new Point(p.x, p.y))

  // Mesh + RopeGeometry
  const geom: any = new RopeGeometry({ points: this.points, width: this.widthBase })
  const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
  ;(mesh as any).tint = this.strokeColor
  mesh.alpha = this.opacity
  ;(mesh as any).blendMode = this.blendMode
  mesh.cullable = false

  this.container.addChild(mesh)
  this.rope = mesh
    // Force a first update so it becomes renderable immediately
    try {
      const g: any = (this.rope as any).geometry
      if (typeof g?.updateVertices === 'function') g.updateVertices()
      else if (typeof g?.update === 'function') g.update()
    } catch {}
  }

  update(samples: { x: number; y: number }[]) {
    if (!samples || samples.length === 0) return

    // Distance accumulation for cadence
    if (this.points.length) {
      let prev = this.points[this.points.length - 1]
      for (const s of samples) {
        const dx = s.x - prev.x
        const dy = s.y - prev.y
        this._accumDist += Math.hypot(dx, dy)
        prev = new Point(s.x, s.y)
      }
    }

    // Lazily create rope on first point
    let initializedNow = false
    if (!this.rope) {
      const first = samples[0]
      this._ensureRopeInitialized(new Point(first.x, first.y))
      initializedNow = !!this.rope
    }

    // Decimate and append points
    const minDist = Math.max(0, this.previewCfg.decimatePx)
    let last = this.points[this.points.length - 1]
    for (const s of samples) {
      if (!last) {
        const p = new Point(s.x, s.y)
        this.points.push(p)
        last = p
        continue
      }
      const dx = s.x - last.x
      const dy = s.y - last.y
      if (Math.hypot(dx, dy) >= minDist) {
        const p = new Point(s.x, s.y)
        this.points.push(p)
        last = p
      }
    }

    // If created this tick, force one immediate update so it shows without waiting for cadence
    if (initializedNow && this.rope) {
      try {
        const g: any = (this.rope as any).geometry
        if (typeof g?.updateVertices === 'function') g.updateVertices()
        else if (typeof g?.update === 'function') g.update()
      } catch {}
    }

    // Throttle geometry updates for performance
    if (!this.rope) return
    if (!this._rafScheduled) {
      this._rafScheduled = true
      requestAnimationFrame(() => {
        this._rafScheduled = false
        const tokenAtSchedule = this._token
        // The stroke could have ended while a frame was queued
        if (!this.rope || tokenAtSchedule !== this._token) return
        const now = performance.now ? performance.now() : Date.now()
        if (now - this._lastUpdateTime < this.previewCfg.minMs && this._accumDist < Math.max(2, this.previewCfg.decimatePx * 2)) return
        this._lastUpdateTime = now
        this._accumDist = 0
        const g: any = (this.rope as any).geometry
        if (g) {
          try { if ('points' in g) (g as any).points = this.points } catch {}
          // Many Pixi versions expose updateVertices; some expose update()
          if (typeof g.updateVertices === 'function') g.updateVertices()
          else if (typeof g.update === 'function') g.update()
          // Some builds need size/vertexCount hints; best-effort no-ops otherwise
          try { (this.rope as any).size = (g.indices?.length ?? 0) } catch {}
          try { (g as any).vertexCount = (g.positions?.length ?? 0) / 2 } catch {}
        }
      })
    }
  }

  end() {
  const res = this.rope && this.points.length >= 2 ? { mesh: this.rope } : null
    // Keep the mesh in the layer for history; detach internal refs only
    this._token++
    this.rope = null
    this.container = null
    this.points = []
    return res
  }
}
