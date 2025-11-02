export type XYLike = { x: number; y: number; [key: string]: any }

/**
 * Distance-based decimation for previews: keeps the first point and then
 * only adds points when the distance to the last kept point exceeds minDist.
 * Always includes the last point.
 */
export function decimateByDistance<T extends XYLike>(points: T[], minDist: number): T[] {
  if (!points || points.length < 3 || minDist <= 0) return points.slice()
  const out: T[] = []
  let last = points[0]
  out.push(last)
  let accDx = 0
  let accDy = 0
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const dx = p.x - last.x
    const dy = p.y - last.y
    const d2 = dx * dx + dy * dy
    if (d2 >= minDist * minDist) {
      out.push(p)
      last = p
      accDx = 0
      accDy = 0
    } else {
      // accumulate to avoid directional bias
      accDx += dx
      accDy += dy
      const accD2 = accDx * accDx + accDy * accDy
      if (accD2 >= minDist * minDist) {
        out.push(p)
        last = p
        accDx = 0
        accDy = 0
      }
    }
  }
  out.push(points[points.length - 1])
  return out
}
