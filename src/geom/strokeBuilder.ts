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
}

export interface JitterConfig {
  // Fraction of width variation (0..1). 0 disables jitter.
  amplitude?: number
  // Frequency of noise along the path, measured in cycles per pixel of arclength.
  frequency?: number
  // Seed for deterministic jitter per stroke.
  seed?: number
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

  for (let i = 0; i < n; i++) {
    const p = clamp(points[i].pressure ?? 0.5, 0, 1)

    // Pressure width factor
    const pressWidth = (pressMode === 'width' || pressMode === 'both')
      ? mapPressureToScale(p, params.pressureCurve, widthRange)
      : 1.0

    // Speed thinning factor (1 at slow, approaches minSpeedScale at very fast)
    const sN = clamp(speedNorm[i], 0, 1)
    const t = Math.pow(sN, exp)
    const speedWidth = lerp(1.0, minSpeedScale, t)

    // Jitter factor based on arclength
    let jitterFactor = 1.0
    if (amp > 0 && freq > 0) {
      const cyc = arclength[i] * freq // cycles
      const j = noise1D(seed, cyc) // [-1,1]
      jitterFactor = 1 + amp * j
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

function buildOffsets(points: StrokePoint[], halfWidthPx: Float32Array): { left: Float32Array; right: Float32Array } {
  const n = points.length
  const left = new Float32Array(n * 2)
  const right = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[Math.min(n - 1, i + 1)]
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const w = halfWidthPx[i]
    left[i * 2 + 0] = p.x + nx * w
    left[i * 2 + 1] = p.y + ny * w
    right[i * 2 + 0] = p.x - nx * w
    right[i * 2 + 1] = p.y - ny * w
  }
  return { left, right }
}

function buildStrip(left: Float32Array, right: Float32Array): StripGeometry {
  const n = left.length / 2
  if (n < 2) {
    return {
      positions: new Float32Array(),
      indices: new Uint32Array(),
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
  const indices = new Uint32Array((n - 1) * 6)
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

  // Path arclength for jitter + speed estimation
  const s = computeArclength(points)

  // Compute per-point factors
  const { widthFactor, opacityFactor } = computeWidthAndOpacityFactors(points, params, s)

  // Convert to half-width in pixels
  const half = new Float32Array(n)
  const halfBase = params.baseWidth * 0.5
  for (let i = 0; i < n; i++) {
    // Clamp factor to avoid degenerate geometry
    const f = clamp(widthFactor[i], 0.05, 4.0)
    half[i] = halfBase * f
  }

  // Build outlines
  const { left, right } = buildOffsets(points, half)

  // Build interleaved strip
  const strip = buildStrip(left, right)

  return {
    strip,
    outlines: { left, right },
    factors: { widthFactor, opacityFactor },
  }
}
