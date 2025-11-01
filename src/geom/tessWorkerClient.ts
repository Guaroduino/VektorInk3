// Import worker via Vite worker plugin (see vite-env.d.ts)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import TessWorkerFactory from '../workers/tess.worker?worker'

export interface Triangulation {
  positions: Float32Array
  indices: Uint32Array
  error?: string
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (value: Triangulation) => void>()

function ensureWorker() {
  if (!worker) {
    worker = new TessWorkerFactory()
    ;(worker as Worker).onmessage = (e: MessageEvent<any>) => {
      const { id, positions, indices, error } = e.data || {}
      const resolve = pending.get(id)
      if (resolve) {
        pending.delete(id)
        // Always resolve with a plain object; arrays may be empty on error
        resolve({ positions, indices, error })
      }
    }
    ;(worker as Worker).onerror = (err) => {
      // Catastrophic worker error: reject all pending with empty buffers and error string
      for (const [id, resolve] of pending) {
        resolve({ positions: new Float32Array(), indices: new Uint32Array(), error: String(err.message || err) })
      }
      pending.clear()
    }
  }
}

export function triangulateWithTess2Async(
  contours: Array<Array<{ x: number; y: number }>>,
  winding: 'nonzero' | 'odd' = 'nonzero'
): Promise<Triangulation> {
  ensureWorker()
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    worker!.postMessage({ id, contours, winding })
  })
}
