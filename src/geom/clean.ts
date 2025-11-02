// Utilidades ligeras para estabilizar contornos de perfect-freehand en tamaños grandes
// - Elimina puntos duplicados consecutivos
// - Quita casi-colineales por área mínima
// - Simplifica con simplify-js con una tolerancia pequeña relativa al tamaño

import simplify from 'simplify-js'

export type Pt = { x: number; y: number }

export function dedupeConsecutive(points: Pt[], eps = 1e-3): Pt[] {
  if (points.length <= 1) return points.slice()
  const out: Pt[] = []
  let lastX = NaN, lastY = NaN
  const eps2 = eps * eps
  for (const p of points) {
    const dx = p.x - lastX
    const dy = p.y - lastY
    if (!isFinite(dx) || !isFinite(dy) || dx * dx + dy * dy > eps2) {
      out.push(p)
      lastX = p.x
      lastY = p.y
    }
  }
  // Si el último es igual al primero, quítalo para evitar borde degenerado
  if (out.length > 2) {
    const a = out[0]
    const b = out[out.length - 1]
    if ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) <= eps2) out.pop()
  }
  return out
}

export function removeNearlyCollinear(points: Pt[], areaEps = 0.01): Pt[] {
  const n = points.length
  if (n < 3) return points.slice()
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]
    // área del triángulo * 2 (shoelace local)
    const area2 = Math.abs((cur.x - prev.x) * (next.y - prev.y) - (cur.y - prev.y) * (next.x - prev.x))
    if (area2 > areaEps) out.push(cur)
  }
  return out
}

export function cleanOutline(points: Pt[], strokeSize: number): Pt[] {
  if (points.length < 3) return []
  // Epsilons relativos al tamaño de trazo para evitar triángulos largos y finos
  const eps = Math.max(0.25, strokeSize * 0.02)
  const areaEps = eps * eps * 0.5
  let pts = dedupeConsecutive(points, eps * 0.5)
  if (pts.length < 3) return []
  pts = removeNearlyCollinear(pts, areaEps)
  if (pts.length < 3) return []
  // Simplificación muy suave
  const simp = simplify(pts.map(p => ({ x: p.x, y: p.y })), eps, true)
  return simp as Pt[]
}
