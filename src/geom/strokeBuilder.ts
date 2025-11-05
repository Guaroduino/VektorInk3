// Shared stroke builder: centerline -> strip expansion with pressure, speed-based thinning, and jitter
// Designed to be fast for preview and reusable for final rendering.

export type PressureMode = 'none' | 'width' | 'opacity' | 'both'

export interface StrokePoint {
  x: number
  y: number
  pressure?: number
  time?: number // ms from PointerEvent.timeStamp
}

export interface ThinningConfig {
  // Minimum scale for width at very high speed (0..1). 1 means no thinning.
  minSpeedScale?: number
  // Reference speed (pixels per millisecond) where thinning reaches near minSpeedScale.
  speedRefPxPerMs?: number
  // Optional smoothing window (number of samples) for speed estimation.
  window?: number
  // Exponent to shape the curve (>= 1). Higher => stronger thinning at high speeds.
  exponent?: number
  // Additional EMA smoothing strength (0..1) applied to the computed speed-based width factor across the stroke.
  smooth?: number
  // If true, invert the mapping: fast strokes become thicker (instead of thinner).
  invert?: boolean
}

export interface JitterConfig {
  // Fraction of width variation (0..1). 0 disables jitter.
  amplitude?: number
  // Frequency of noise along the path, measured in cycles per pixel of arclength.
  frequency?: number
  // Seed for deterministic jitter per stroke.
  seed?: number
  // Domain to drive jitter progression: 'distance' (arclength) or 'time' (elapsed ms)
  domain?: 'distance' | 'time'
  // EMA smoothing strength (0..1) applied to the jitter factor progression (higher -> smoother, slower changes)
  smooth?: number
}

export interface StrokeBuilderParams {
  baseWidth: number // full width in pixels
  pressureMode?: PressureMode
  pressureSensitivity?: boolean // if false, ignore pressure
  // Width mapping from pressure
  widthScaleRange?: [number, number] // e.g. [0.3, 1.0]
  pressureCurve?: 'linear' | 'sqrt' | 'square' | { exponent: number }
  // Opacity mapping from pressure
  opacityRange?: [number, number] // e.g. [0.3, 1.0]
  // Thinning by speed
  thinning?: ThinningConfig
  // Random width variation
  jitter?: JitterConfig
  // Streamline: input point smoothing (0..1). 0 = raw, 1 = heavily smoothed.
  streamline?: number
  // Join style at sharp corners
  join?: 'miter' | 'bevel' | 'round'
  // Max allowed miter scale; above this threshold we can fallback to bevel
  miterLimit?: number
  // End caps
  capStart?: 'butt' | 'square' | 'round'
  capEnd?: 'butt' | 'square' | 'round'
}

export interface StripGeometry {
  positions: Float32Array
  indices: Uint32Array
  uvs: Float32Array
}

export interface StrokeOutlines {
  left: Float32Array // [x0, y0, x1, y1, ...]
  right: Float32Array
}

export interface StrokeFactors {
  widthFactor: Float32Array // multiplicative factor applied to baseWidth (per-point)
  opacityFactor?: Float32Array // optional per-point opacity factor
}

export interface StrokeBuildResult {
  strip: StripGeometry
  outlines: StrokeOutlines
  factors: StrokeFactors
}

// Utility: clamp
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// Utility: linear interpolation
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Simple deterministic hash -> [-1, 1]
function noise1D(seed: number, x: number): number {
  // Based on a simple hash+sin method; not high quality but deterministic and fast
  const n = Math.sin((x + seed * 0.1234567) * 12.9898) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

function mapPressureToScale(p: number, curve: StrokeBuilderParams['pressureCurve'], range: [number, number]) {
  let t = clamp(p, 0, 1)
  if (!curve || curve === 'linear') {
    // no-op
  } else if (curve === 'sqrt') {
    t = Math.sqrt(t)
  } else if (curve === 'square') {
    t = t * t
  } else if (typeof curve === 'object' && typeof curve.exponent === 'number') {
    const k = curve.exponent
    t = Math.pow(t, k)
  }
  return lerp(range[0], range[1], t)
}

function computeArclength(points: StrokePoint[]): Float32Array {
  const n = points.length
  const s = new Float32Array(n)
  let acc = 0
  s[0] = 0
  for (let i = 1; i < n; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    acc += Math.hypot(dx, dy)
    s[i] = acc
  }
  return s
}

function computeCumTime(points: StrokePoint[]): Float32Array {
  const n = points.length
  const tArr = new Float32Array(n)
  let t0 = typeof points[0]?.time === 'number' ? (points[0].time as number) : 0
  tArr[0] = 0
  for (let i = 1; i < n; i++) {
    const ti = typeof points[i].time === 'number' ? (points[i].time as number) : i
    const tPrev = typeof points[i - 1].time === 'number' ? (points[i - 1].time as number) : (i - 1)
    const dt = Math.max(0, ti - tPrev)
    tArr[i] = tArr[i - 1] + dt
  }
  return tArr
}

function computeSpeedNorm(points: StrokePoint[], arclength: Float32Array, cfg?: ThinningConfig): Float32Array {
  const n = points.length
  const out = new Float32Array(n)
  if (!cfg) return out // zeros -> speedFactor ~ 1 later

  const ref = cfg.speedRefPxPerMs && cfg.speedRefPxPerMs > 0 ? cfg.speedRefPxPerMs : 0.5 // px/ms
  const window = Math.max(1, Math.floor(cfg.window ?? 1))

  // Estimate instantaneous speed (px/ms) using time when possible; otherwise use spatial progression as proxy
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - window)
    const i1 = Math.min(n - 1, i + window)
    const ds = arclength[i1] - arclength[i0]
    const t0 = points[i0].time
    const t1 = points[i1].time
    let dt = 0
    if (typeof t0 === 'number' && typeof t1 === 'number') {
      dt = Math.max(0.0001, (t1 - t0))
    } else {
      // Fallback: use index distance as a rough proxy (assumes a fixed sampling rate)
      // This yields ds / di which is proportional to speed.
      const di = i1 - i0 || 1
      dt = di // arbitrary units; normalized below by ref
    }
    const speed = ds / dt // px per ms (or arbitrary units)
    out[i] = ref > 0 ? clamp(speed / ref, 0, 1) : 0
  }
  return out
}

function computeWidthAndOpacityFactors(
  points: StrokePoint[],
  params: StrokeBuilderParams,
  arclength: Float32Array
): { widthFactor: Float32Array; opacityFactor?: Float32Array } {
  const n = points.length
  const widthFactor = new Float32Array(n)
  let opacityFactor: Float32Array | undefined

  const pressMode = params.pressureSensitivity === false ? 'none' : (params.pressureMode ?? 'width')
  const widthRange: [number, number] = params.widthScaleRange ?? [0.5, 1.0]
  const opacityRange: [number, number] = params.opacityRange ?? [0.5, 1.0]
  const thinning = params.thinning
  const jitter = params.jitter

  const speedNorm = computeSpeedNorm(points, arclength, thinning)
  const minSpeedScale = clamp(thinning?.minSpeedScale ?? 1.0, 0, 1)
  const exp = Math.max(1, thinning?.exponent ?? 1)

  if (pressMode === 'opacity' || pressMode === 'both') {
    opacityFactor = new Float32Array(n)
  }

  const seed = (jitter?.seed ?? 0) >>> 0
  const amp = clamp(jitter?.amplitude ?? 0, 0, 1)
  const freq = Math.max(0, jitter?.frequency ?? 0)
  const domain = jitter?.domain ?? 'distance'
  const tCum = domain === 'time' ? computeCumTime(points) : undefined

  // Pre-calc jitter smoothing coefficient (EMA alpha)
  const jitterSmooth = clamp(jitter?.smooth ?? 0, 0, 1)
  const jitterAlpha = 1 - 0.85 * jitterSmooth // more smoothing -> smaller alpha

  // Pre-calc thinning EMA on width factor if requested
  const thinSmooth = clamp(thinning?.smooth ?? 0, 0, 1)
  const thinAlpha = 1 - 0.85 * thinSmooth

  let prevJitterFactor = 1.0
  let prevSpeedWidth = 1.0

  for (let i = 0; i < n; i++) {
    const p = clamp(points[i].pressure ?? 0.5, 0, 1)

    // Pressure width factor
    const pressWidth = (pressMode === 'width' || pressMode === 'both')
      ? mapPressureToScale(p, params.pressureCurve, widthRange)
      : 1.0

    // Speed thinning factor (1 at slow, approaches minSpeedScale at very fast)
    const sN = clamp(speedNorm[i], 0, 1)
    const t = Math.pow(sN, exp)
  // Map speed to width scale; invert if requested
  let speedWidth = thinning?.invert ? lerp(minSpeedScale, 1.0, t) : lerp(1.0, minSpeedScale, t)
  // EMA smooth for speed-based width factor
  if (thinSmooth > 0 && i > 0) speedWidth = prevSpeedWidth + (speedWidth - prevSpeedWidth) * thinAlpha
  prevSpeedWidth = speedWidth

    // Jitter factor based on arclength
    let jitterFactor = 1.0
    if (amp > 0 && freq > 0) {
      const param = domain === 'time' ? (tCum as Float32Array)[i] : arclength[i]
      const cyc = param * freq // cycles
      const j = noise1D(seed, cyc) // [-1,1]
      const raw = 1 + amp * j
      if (jitterSmooth > 0 && i > 0) {
        jitterFactor = prevJitterFactor + (raw - prevJitterFactor) * jitterAlpha
      } else {
        jitterFactor = raw
      }
    }

    widthFactor[i] = pressWidth * speedWidth * jitterFactor

    if (opacityFactor) {
      // Pressure opacity factor only (no speed/jitter for opacity unless desired later)
      const op = mapPressureToScale(p, params.pressureCurve, opacityRange)
      opacityFactor[i] = op
    }
  }

  return { widthFactor, opacityFactor }
}

function buildOffsets(points: StrokePoint[], halfWidthPx: Float32Array, params: StrokeBuilderParams): { left: Float32Array; right: Float32Array } {
  const n = points.length
  const left = new Float32Array(n * 2)
  const right = new Float32Array(n * 2)
  const joinStyle = params.join ?? 'miter'
  const mLimit = Math.max(1, params.miterLimit ?? 2.0)
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const pPrev = points[Math.max(0, i - 1)]
    const pNext = points[Math.min(n - 1, i + 1)]
    // Segment unit tangents
    let t0x = p.x - pPrev.x
    let t0y = p.y - pPrev.y
    let t1x = pNext.x - p.x
    let t1y = pNext.y - p.y
    const l0 = Math.hypot(t0x, t0y)
    const l1 = Math.hypot(t1x, t1y)
    if (l0 > 1e-6) { t0x /= l0; t0y /= l0 } else { t0x = t1x; t0y = t1y }
    if (l1 > 1e-6) { t1x /= l1; t1y /= l1 } else { t1x = t0x; t1y = t0y }

    // Corresponding unit normals
    const n0x = -t0y, n0y = t0x
    const n1x = -t1y, n1y = t1x

    // Miter direction = normalized sum of adjacent normals
    let mx = n0x + n1x
    let my = n0y + n1y
    let ml = Math.hypot(mx, my)
    // If normals are opposite (180° turn), fall back to current segment's normal
    if (ml < 1e-6) { mx = n1x; my = n1y; ml = 1 }
    mx /= ml; my /= ml

    // Miter scale to preserve constant distance from centerline
    // a = w / dot(m, n1)  => scale = 1 / dot(m, n1)
    const dotMN1 = mx * n1x + my * n1y
    let scale = 1 / Math.max(1e-3, Math.abs(dotMN1))
    // Fallback to bevel when the miter would be too large
    if (joinStyle === 'bevel' && scale > mLimit) {
      // Use the next-segment normal directly (flat bevel)
      mx = n1x
      my = n1y
      scale = 1
    } else {
      // Clamp extreme miters to avoid spikes at very sharp angles
      scale = Math.min(scale, mLimit)
    }
    const w = halfWidthPx[i] * scale

    left[i * 2 + 0] = p.x + mx * w
    left[i * 2 + 1] = p.y + my * w
    right[i * 2 + 0] = p.x - mx * w
    right[i * 2 + 1] = p.y - my * w
  }
  return { left, right }
}

function buildStrip(left: Float32Array, right: Float32Array): StripGeometry {
  const n = left.length / 2
  if (n < 2) {
    return {
      positions: new Float32Array(),
      indices: new Uint16Array() as any,
      uvs: new Float32Array(),
    }
  }
  // Interleaved L,R per point
  const positions = new Float32Array(n * 2 * 2)
  for (let i = 0; i < n; i++) {
    const off = i * 4
    positions[off + 0] = left[i * 2 + 0]
    positions[off + 1] = left[i * 2 + 1]
    positions[off + 2] = right[i * 2 + 0]
    positions[off + 3] = right[i * 2 + 1]
  }
  const triCount = (n - 1) * 2
  const indexCount = triCount * 3
  const useU16 = n * 2 <= 65535 && indexCount <= 65535
  const indices = (useU16 ? new Uint16Array(indexCount) : new Uint32Array(indexCount)) as any
  for (let i = 0; i < n - 1; i++) {
    const i0 = i * 2
    const i1 = i * 2 + 1
    const i2 = (i + 1) * 2
    const i3 = (i + 1) * 2 + 1
    const base = i * 6
    indices[base + 0] = i0
    indices[base + 1] = i1
    indices[base + 2] = i2
    indices[base + 3] = i1
    indices[base + 4] = i3
    indices[base + 5] = i2
  }
  const uvs = new Float32Array(n * 2 * 2) // placeholder 0s
  return { positions, indices, uvs }
}

export function buildOuterPolygon(left: Float32Array, right: Float32Array, close: boolean = true): Float32Array {
  // Concatenate left forward + right reversed into a single closed polygon
  const n = left.length / 2
  if (n < 2) return new Float32Array()
  const m = n * 2
  const poly = new Float32Array(m * 2 + (close ? 2 : 0))
  // Left forward
  for (let i = 0; i < n; i++) {
    poly[i * 2 + 0] = left[i * 2 + 0]
    poly[i * 2 + 1] = left[i * 2 + 1]
  }
  // Right reversed
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i
    const off = (n + i) * 2
    poly[off + 0] = right[j * 2 + 0]
    poly[off + 1] = right[j * 2 + 1]
  }
  // Close polygon
  if (close) {
    poly[m * 2 + 0] = poly[0]
    poly[m * 2 + 1] = poly[1]
  }
  return poly
}

export function buildStrokeStrip(points: StrokePoint[], params: StrokeBuilderParams): StrokeBuildResult {
  const n = points.length
  if (n < 2 || !isFinite(params.baseWidth) || params.baseWidth <= 0) {
    return {
      strip: { positions: new Float32Array(), indices: new Uint32Array(), uvs: new Float32Array() },
      outlines: { left: new Float32Array(), right: new Float32Array() },
      factors: { widthFactor: new Float32Array() },
    }
  }

  // Optionally streamline the path (EMA smoothing of positions)
  const streamline = clamp(params.streamline ?? 0, 0, 1)
  let pts = points
  if (streamline > 0) {
    const alpha = 1 - 0.85 * streamline
    const out: StrokePoint[] = new Array(n)
    // first sample unchanged
    out[0] = { ...points[0] }
    for (let i = 1; i < n; i++) {
      const prev = out[i - 1]
      const cur = points[i]
      const x = prev.x + (cur.x - prev.x) * alpha
      const y = prev.y + (cur.y - prev.y) * alpha
      // keep pressure/time from current sample to preserve dynamics
      out[i] = { x, y, pressure: cur.pressure, time: cur.time }
    }
    pts = out
  }

  // Path arclength for jitter + speed estimation
  const s = computeArclength(pts)

  // Compute per-point factors
  const { widthFactor, opacityFactor } = computeWidthAndOpacityFactors(pts, params, s)

  // Convert to half-width in pixels
  const half = new Float32Array(n)
  const halfBase = params.baseWidth * 0.5
  for (let i = 0; i < n; i++) {
    // Clamp factor to avoid degenerate geometry
    const f = clamp(widthFactor[i], 0.05, 4.0)
    half[i] = halfBase * f
  }

  // Build outlines
  const { left, right } = buildOffsets(pts, half, params)

  // Optionally add round joins by inserting arc samples at sharp corners (outside side only)
  let L = left, R = right
  if ((params.join ?? 'miter') === 'round' && n >= 3) {
    const lDyn: number[] = []
    const rDyn: number[] = []
    const angle = (x:number,y:number)=>Math.atan2(y,x)
    const normalizeDelta = (d:number, sign:number) => {
      // Normalize to (-PI, PI]
      while (d <= -Math.PI) d += 2*Math.PI
      while (d > Math.PI) d -= 2*Math.PI
      // Ensure sweep direction matches turn sign (positive for left, negative for right)
      if (sign > 0 && d < 0) d += 2*Math.PI
      if (sign < 0 && d > 0) d -= 2*Math.PI
      return d
    }
    for (let i = 0; i < n; i++) {
      if (i > 0 && i < n - 1) {
        const pPrev = pts[i - 1]
        const p = pts[i]
        const pNext = pts[i + 1]
        let t0x = p.x - pPrev.x, t0y = p.y - pPrev.y
        let t1x = pNext.x - p.x, t1y = pNext.y - p.y
        const l0 = Math.hypot(t0x, t0y)
        const l1 = Math.hypot(t1x, t1y)
        if (l0 > 1e-6) { t0x /= l0; t0y /= l0 } else { t0x = t1x; t0y = t1y }
        if (l1 > 1e-6) { t1x /= l1; t1y /= l1 } else { t1x = t0x; t1y = t0y }
        const cross = t0x * t1y - t0y * t1x // >0 left turn, <0 right turn
        // Skip tiny turns
        const dot = t0x * t1x + t0y * t1y
        const turnAngle = Math.acos(clamp(dot, -1, 1))
        if (Math.abs(cross) > 1e-6 && turnAngle > 0.12) {
          // Outside normal basis
          const n0x = -t0y, n0y = t0x
          const n1x = -t1y, n1y = t1x
          const out0x = cross > 0 ? n0x : -n0x
          const out0y = cross > 0 ? n0y : -n0y
          const out1x = cross > 0 ? n1x : -n1x
          const out1y = cross > 0 ? n1y : -n1y
          let a0 = angle(out0x, out0y)
          let a1 = angle(out1x, out1y)
          const d = normalizeDelta(a1 - a0, cross > 0 ? 1 : -1)
          // Segment count proportional to angle (pi/8 ~ 22.5° per segment)
          const k = Math.min(12, Math.max(2, Math.ceil(Math.abs(d) / (Math.PI / 8))))
          const radius = half[i]
          // Baseline inside pair at this index
          const baseLx = L[i * 2 + 0], baseLy = L[i * 2 + 1]
          const baseRx = R[i * 2 + 0], baseRy = R[i * 2 + 1]
          const insideIsRight = cross > 0 // left turn => outside=left => inside=right
          const fixedIx = insideIsRight ? baseRx : baseLx
          const fixedIy = insideIsRight ? baseRy : baseLy
          for (let j = 0; j <= k; j++) {
            const th = a0 + (d * (j / k))
            const ox = p.x + Math.cos(th) * radius
            const oy = p.y + Math.sin(th) * radius
            if (insideIsRight) {
              // [outside left = ox,oy] with fixed right
              lDyn.push(ox, oy)
              rDyn.push(fixedIx, fixedIy)
            } else {
              // outside right into rDyn
              lDyn.push(fixedIx, fixedIy)
              rDyn.push(ox, oy)
            }
          }
          continue
        }
      }
      // Default: copy pair as-is
      lDyn.push(L[i * 2 + 0], L[i * 2 + 1])
      rDyn.push(R[i * 2 + 0], R[i * 2 + 1])
    }
    L = new Float32Array(lDyn)
    R = new Float32Array(rDyn)
  }

  // Build interleaved strip
  let strip = buildStrip(L, R)

  // Apply end caps (square: offset ends along tangent; round: add a small fan)
  const capStart = params.capStart ?? 'butt'
  const capEnd = params.capEnd ?? 'butt'
  if (capStart !== 'butt' || capEnd !== 'butt') {
    // Compute endpoint tangents (unit vectors) from centers of the built strip pairs
    const pairCount = strip.positions.length / 4
    const centerAt = (idx: number) => {
      const off = idx * 4
      const lx = strip.positions[off + 0]
      const ly = strip.positions[off + 1]
      const rx = strip.positions[off + 2]
      const ry = strip.positions[off + 3]
      return { x: (lx + rx) * 0.5, y: (ly + ry) * 0.5 }
    }
    const tStart = (() => {
      const c0 = centerAt(0)
      const c1 = centerAt(Math.min(1, pairCount - 1))
      const dx = c1.x - c0.x, dy = c1.y - c0.y
      const l = Math.hypot(dx, dy) || 1
      return { x: dx / l, y: dy / l }
    })()
    const tEnd = (() => {
      const cN = centerAt(pairCount - 1)
      const cN1 = centerAt(Math.max(0, pairCount - 2))
      const dx = cN.x - cN1.x, dy = cN.y - cN1.y
      const l = Math.hypot(dx, dy) || 1
      return { x: dx / l, y: dy / l }
    })()

    // Helper to mutate positions for square caps
    const applySquareAt = (at: 'start' | 'end') => {
      // Use current strip pair count to locate endpoints (after any join expansion)
      const i = at === 'start' ? 0 : (pairCount - 1)
      const off = i * 4
      // Map back to centerline index for width; clamp to valid range
      const nPts = half.length
      const srcI = at === 'start' ? 0 : (nPts - 1)
      const hw = half[Math.max(0, Math.min(nPts - 1, srcI))]
      const t = at === 'start' ? { x: -tStart.x, y: -tStart.y } : tEnd
      // Shift L and R positions by +/- tangent * halfWidth (same direction for square)
      strip.positions[off + 0] += t.x * hw
      strip.positions[off + 1] += t.y * hw
      strip.positions[off + 2] += t.x * hw
      strip.positions[off + 3] += t.y * hw
    }

    if (capStart === 'square') applySquareAt('start')
    if (capEnd === 'square') applySquareAt('end')

    // Round caps via small triangle fan at ends; keep vertex count small (k ~ 6)
    const addRoundCap = (at: 'start' | 'end') => {
      const pairN = strip.positions.length / 4
      const i = at === 'start' ? 0 : (pairN - 1)
      const off = i * 4
      const center = (() => {
        const lx = strip.positions[off + 0], ly = strip.positions[off + 1]
        const rx = strip.positions[off + 2], ry = strip.positions[off + 3]
        return { x: (lx + rx) * 0.5, y: (ly + ry) * 0.5 }
      })()
      const vL = { x: strip.positions[off + 0] - center.x, y: strip.positions[off + 1] - center.y }
      const vR = { x: strip.positions[off + 2] - center.x, y: strip.positions[off + 3] - center.y }
      const angL = Math.atan2(vL.y, vL.x)
      // Sweep half circle from left to right around the front/back depending on end
      const sweep = Math.PI
      const dir = at === 'start' ? -1 : 1 // start cap sweeps backward
      const k = 6 // segments along the semicircle (lightweight)
      const baseVertCount = strip.positions.length / 2
      // Append center vertex
      const newPos: number[] = Array.from(strip.positions)
      const newUvs: number[] = Array.from(strip.uvs)
      const newIdx: number[] = Array.from(strip.indices as any)
      newPos.push(center.x, center.y)
      newUvs.push(0, 0)
      const cIdx = baseVertCount
      // Generate internal arc points (exclude endpoints since L/R already exist)
      const radius = Math.hypot(vL.x, vL.y) || (half[i])
      const arcIdxs: number[] = []
      for (let j = 1; j < k; j++) {
        const a = angL + dir * (sweep * (j / k))
        const ax = center.x + Math.cos(a) * radius
        const ay = center.y + Math.sin(a) * radius
        newPos.push(ax, ay)
        newUvs.push(0, 0)
        arcIdxs.push(baseVertCount + j)
      }
      // Existing endpoints
      const leftIdx = i * 2 + 0
      const rightIdx = i * 2 + 1
      // Triangulate fan from center across [L, ...arc..., R]
      let prev = leftIdx
      for (let j = 0; j <= arcIdxs.length; j++) {
        const next = (j < arcIdxs.length) ? arcIdxs[j] : rightIdx
        newIdx.push(cIdx, prev, next)
        prev = next
      }
      // Commit arrays back
      strip = {
        positions: new Float32Array(newPos),
        uvs: new Float32Array(newUvs),
        indices: (() => {
          // choose type based on max index
          const maxIdx = Math.max(...newIdx)
          if (maxIdx <= 65535) return new Uint16Array(newIdx) as any
          return new Uint32Array(newIdx) as any
        })(),
      }
    }

    if (capStart === 'round') addRoundCap('start')
    if (capEnd === 'round') addRoundCap('end')
  }

  return {
    strip,
    outlines: { left, right },
    factors: { widthFactor, opacityFactor },
  }
}
