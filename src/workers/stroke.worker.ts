// Placeholder del worker de trazo.
// En el futuro: recibir arrays de muestras y devolver geometría (vector) o bitmaps (raster) usando OffscreenCanvas.

export type StrokeJob =
  | { kind: 'vector'; points: { x: number; y: number; pressure?: number }[]; options?: any }
  | { kind: 'raster'; points: { x: number; y: number; pressure?: number }[]; options?: any }

self.onmessage = async (e: MessageEvent<StrokeJob>) => {
  const job = e.data
  switch (job.kind) {
    case 'vector': {
      // TODO: calcular geometría de listón (triangulación) y devolver posiciones/indices/uvs/alpha
      ;(self as any).postMessage({ kind: 'vector', ok: true, positions: [], uvs: [], indices: [] })
      break
    }
    case 'raster': {
      // TODO: dibujar en OffscreenCanvas y devolver ImageBitmap o transferir el canvas
      ;(self as any).postMessage({ kind: 'raster', ok: true })
      break
    }
  }
}
