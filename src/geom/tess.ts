// Tessellation using tess2 JS API (emscripten build)
// We avoid GLU-style constructor and use the high-level tesselate() helper.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - tess2 has no types
import * as tess2 from 'tess2'

export interface Triangulation {
  positions: Float32Array
  indices: Uint32Array
}

export function triangulateSimplePolygon(points: Array<{ x: number; y: number }>): Triangulation {
  // Not used when user requires tess2 everywhere; kept for optional fallback.
  const flat = new Float32Array(points.length * 2)
  for (let i = 0; i < points.length; i++) {
    flat[i * 2] = points[i].x
    flat[i * 2 + 1] = points[i].y
  }
  const res = (tess2 as any).tesselate({
    contours: [flat],
    windingRule: (tess2 as any).WINDING_NONZERO,
    elementType: (tess2 as any).POLYGONS,
    polygonSize: 3,
    vertexSize: 2,
  })
  const verts: Float32Array = res.vertices as Float32Array
  const elems: Int32Array = res.elements as Int32Array
  const filtered: number[] = []
  for (let i = 0; i < elems.length; i++) if (elems[i] >= 0) filtered.push(elems[i])
  return { positions: verts, indices: new Uint32Array(filtered) }
}

export function triangulateWithTess2(
  contours: Array<Array<{ x: number; y: number }>>,
  windingRule: 'nonzero' | 'odd' = 'nonzero'
): Triangulation {
  const contourFloats: Float32Array[] = []
  for (const contour of contours) {
    if (!contour || contour.length < 3) continue
    const flat = new Float32Array(contour.length * 2)
    for (let i = 0; i < contour.length; i++) {
      flat[i * 2] = contour[i].x
      flat[i * 2 + 1] = contour[i].y
    }
    contourFloats.push(flat)
  }
  if (contourFloats.length === 0) return { positions: new Float32Array(), indices: new Uint32Array() }

  const res = (tess2 as any).tesselate({
    contours: contourFloats,
    windingRule: (tess2 as any)[windingRule === 'odd' ? 'WINDING_ODD' : 'WINDING_NONZERO'],
    elementType: (tess2 as any).POLYGONS,
    polygonSize: 3,
    vertexSize: 2,
  })

  const verts: Float32Array = res.vertices as Float32Array
  const elems: Int32Array = res.elements as Int32Array
  const filtered: number[] = []
  for (let i = 0; i < elems.length; i++) if (elems[i] >= 0) filtered.push(elems[i])
  return { positions: verts, indices: new Uint32Array(filtered) }
}
