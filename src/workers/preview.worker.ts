// Offscreen preview worker using 2D canvas for low-latency rendering
// Receives pointer samples in canvas space and renders a stroke preview.

interface Sample { x: number; y: number; pressure?: number; predicted?: boolean }
interface Style { color: number; opacity: number; width: number; pressure: boolean }

type MsgInit = { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number }
type MsgResize = { type: 'resize'; width: number; height: number; dpr: number }
type MsgSamples = { type: 'samples'; phase: 'start' | 'move' | 'end' | 'cancel'; samples: Sample[]; style: Style }
type MsgEnd = { type: 'end' }

type InMsg = MsgInit | MsgResize | MsgSamples | MsgEnd

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let dpr = 1
let width = 1
let height = 1
let points: Sample[] = []
let scheduled = false
let lastDraw = 0
const minMs = 8
let style: Style = { color: 0xffffff, opacity: 1, width: 8, pressure: true }

function hexToRgba(c: number, a: number) {
  const r = (c >>> 16) & 0xff
  const g = (c >>> 8) & 0xff
  const b = c & 0xff
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`
}

function setupCanvas(cvs: OffscreenCanvas, w: number, h: number, devicePR: number) {
  canvas = cvs
  width = Math.max(1, Math.floor(w))
  height = Math.max(1, Math.floor(h))
  dpr = Math.max(0.5, devicePR || 1)
  try {
    cvs.width = Math.max(1, Math.floor(width * dpr))
    cvs.height = Math.max(1, Math.floor(height * dpr))
  } catch {}
  ctx = cvs.getContext('2d', { alpha: true, desynchronized: true }) as OffscreenCanvasRenderingContext2D
  if (ctx) {
    try { (ctx as any).imageSmoothingEnabled = false } catch {}
    try { ctx.setTransform(dpr, 0, 0, dpr, 0, 0) } catch {}
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
  }
}

function scheduleDraw() {
  if (scheduled) return
  scheduled = true
  setTimeout(() => { scheduled = false; draw() }, Math.max(0, minMs - (performance.now() - lastDraw)))
}

function draw() {
  if (!ctx || !canvas) return
  lastDraw = performance.now()
  // Clear
  ctx.clearRect(0, 0, width, height)
  if (points.length < 2) return

  // Draw as per-segment lines with variable width (pressure)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    const p = style.pressure ? Math.max(0.1, Math.min(1, b.pressure ?? 1)) : 1
    ctx.lineWidth = Math.max(1, style.width * p)
    ctx.strokeStyle = hexToRgba(style.color >>> 0, style.opacity)
    ctx.stroke()
  }
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data
  if (!msg) return
  switch (msg.type) {
    case 'init': {
      setupCanvas(msg.canvas, msg.width, msg.height, msg.dpr)
      points = []
      break
    }
    case 'resize': {
      if (canvas) setupCanvas(canvas, msg.width, msg.height, msg.dpr)
      scheduleDraw()
      break
    }
    case 'samples': {
      style = msg.style
      if (msg.phase === 'start') points = []
      if (msg.samples && msg.samples.length) {
        const decimatePx = 0.35
        let last = points[points.length - 1]
        for (const s of msg.samples) {
          if (!last) { points.push({ x: s.x, y: s.y, pressure: s.pressure }); last = points[points.length - 1]; continue }
          const dx = s.x - last.x
          const dy = s.y - last.y
          if (Math.hypot(dx, dy) >= decimatePx) { points.push({ x: s.x, y: s.y, pressure: s.pressure }); last = points[points.length - 1] }
        }
      }
      scheduleDraw()
      break
    }
    case 'end': {
      // Clear fast
      points = []
      if (ctx) ctx.clearRect(0, 0, width, height)
      break
    }
  }
}
