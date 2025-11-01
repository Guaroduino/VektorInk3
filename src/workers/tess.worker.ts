// Triangulation worker using tess2
// Receives: { id, contours: Array<Array<{x:number,y:number}>>, winding: 'nonzero'|'odd' }
// Returns: { id, positions: Float32Array, indices: Uint32Array }

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - tess2 has no types
console.log('¡¡¡WORKER DE TESSELLATION CARGADO - VERSIÓN 3!!!');

import * as tess2 from 'tess2'

export type TessJob = {
  id: number
  contours: Array<Array<{ x: number; y: number }>>
  winding: 'nonzero' | 'odd'
}

self.onmessage = (e: MessageEvent<TessJob>) => {
  const { id, contours, winding } = e.data
  try {
    const contourFloats: Float32Array[] = []
    for (const c of contours) {
      if (!c || c.length < 3) continue
      const flat = new Float32Array(c.length * 2)
      for (let i = 0; i < c.length; i++) {
        flat[i * 2] = c[i].x
        flat[i * 2 + 1] = c[i].y
      }
      contourFloats.push(flat)
    }
    if (contourFloats.length === 0) {
      ;(self as any).postMessage({ id, positions: new Float32Array(), indices: new Uint32Array() })
      return
    }

    const res = (tess2 as any).tesselate({
      contours: contourFloats,
      windingRule: (tess2 as any)[winding === 'odd' ? 'WINDING_ODD' : 'WINDING_NONZERO'],
      elementType: (tess2 as any).POLYGONS,
      polygonSize: 3,
      vertexSize: 2,
    })

    const verts: Float32Array = res.vertices as Float32Array
    const elems: Int32Array = res.elements as Int32Array
    const filtered: number[] = []
    for (let i = 0; i < elems.length; i++) if (elems[i] >= 0) filtered.push(elems[i])
  const positions = new Float32Array(verts)
    const indices = new Uint32Array(filtered)

    ;(self as any).postMessage({ id, positions, indices }, [positions.buffer, indices.buffer])
  } catch (err) {
    console.error('tess.worker error', err)
    ;(self as any).postMessage({ id, positions: new Float32Array(), indices: new Uint32Array(), error: String(err) })
  }
}
