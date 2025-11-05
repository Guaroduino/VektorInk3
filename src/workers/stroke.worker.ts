// Stroke geometry worker: builds triangle strip from points off the main thread
import { buildStrokeStrip, buildOuterPolygon, type StrokeBuilderParams, type StrokePoint } from '../geom/strokeBuilder'
import * as tess2 from 'tess2'

type VectorJob = { type: 'vector'; seq: number; points: StrokePoint[]; params: StrokeBuilderParams }
type InMessage = VectorJob

type VectorResult = { type: 'vector'; seq: number; positions: Float32Array; uvs: Float32Array; indices: Uint32Array }

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data
  if (!msg) return
  if (msg.type === 'vector') {
    try {
      // 1) Build outlines from stroke
      const { outlines } = buildStrokeStrip(msg.points, msg.params)
      // 2) Build outer polygon (left forward + right reversed, closed)
      const poly = buildOuterPolygon(outlines.left, outlines.right, true)
      if (!poly || poly.length < 6) {
        const positions = new Float32Array()
        const uvs = new Float32Array()
        const indices = new Uint32Array()
        ;(self as any).postMessage({ type: 'vector', seq: msg.seq, positions, uvs, indices }, [positions.buffer, uvs.buffer, indices.buffer])
        return
      }
      // 3) Tessellate polygon with tess2 to robustly handle complex shapes
      const contourFloats = [poly]
      const res: any = (tess2 as any).tesselate({
        contours: contourFloats,
        windingRule: (tess2 as any).WINDING_NONZERO,
        elementType: (tess2 as any).POLYGONS,
        polygonSize: 3,
        vertexSize: 2,
      })
      const verts: Float32Array = res.vertices as Float32Array
      const elems: Int32Array = res.elements as Int32Array
      const triIndices: number[] = []
      for (let i = 0; i < elems.length; i++) if (elems[i] >= 0) triIndices.push(elems[i])
      const positions = new Float32Array(verts)
      const indices = new Uint32Array(triIndices)
      const uvs = new Float32Array((positions.length / 2) * 2) // zeros
      const out: VectorResult = { type: 'vector', seq: msg.seq, positions, uvs, indices }
      ;(self as any).postMessage(out, [positions.buffer, uvs.buffer, indices.buffer])
    } catch (err) {
      // On error, send empty geometry so main thread can clear preview
      const positions = new Float32Array()
      const uvs = new Float32Array()
      const indices = new Uint32Array()
      ;(self as any).postMessage({ type: 'vector', seq: msg.seq, positions, uvs, indices }, [positions.buffer, uvs.buffer, indices.buffer])
    }
  }
}
