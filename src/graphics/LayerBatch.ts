import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'

export type BatchStyle = {
  color: number
  opacity: number
  blendMode: string
}

function makeKey(style: BatchStyle) {
  return `${style.blendMode}|${(style.color >>> 0).toString(16)}|${Math.round(style.opacity * 1000)}`
}

class Batch {
  mesh: Mesh
  geom: MeshGeometry
  vertexCount = 0
  indexCount = 0
  private useUint32: boolean

  constructor(style: BatchStyle, useUint32: boolean) {
    this.useUint32 = useUint32
    this.geom = new MeshGeometry({
      positions: new Float32Array(0),
      uvs: new Float32Array(0),
      indices: (this.useUint32 ? new Uint32Array(0) : new Uint16Array(0)) as any,
    })
    this.mesh = new Mesh({ geometry: this.geom, texture: Texture.WHITE })
    this.mesh.tint = style.color >>> 0
    this.mesh.alpha = style.opacity
    ;(this.mesh as any).blendMode = style.blendMode
    ;(this.mesh as any).size = 0
    ;(this.geom as any).vertexCount = 0
  }

  append(positions: Float32Array, uvs: Float32Array, indices: Uint32Array | Uint16Array) {
    const prevV = this.vertexCount
    const prevI = this.indexCount
    const addV = positions.length / 2
    const addI = indices.length

    // Grow position buffer
    const oldPos = this.geom.buffers[0].data as Float32Array
    const newPos = new Float32Array((prevV + addV) * 2)
    if (oldPos && oldPos.length) newPos.set(oldPos, 0)
    newPos.set(positions, prevV * 2)
    this.geom.buffers[0].data = newPos
    this.geom.buffers[0].update()

    // Grow UV buffer (if empty, ensure correct size)
    const oldUV = this.geom.buffers[1].data as Float32Array
    const newUV = new Float32Array((prevV + addV) * 2)
    if (oldUV && oldUV.length) newUV.set(oldUV, 0)
    // If provided uvs length mismatches, we just leave zeros
    const copyUV = Math.min(newUV.length - prevV * 2, uvs.length)
    if (copyUV > 0) newUV.set(uvs.subarray(0, copyUV), prevV * 2)
    this.geom.buffers[1].data = newUV
    this.geom.buffers[1].update()

    // Grow index buffer with offset
  const oldIdx = this.geom.indexBuffer.data as Uint32Array | Uint16Array
  const newIdx = this.useUint32 ? new Uint32Array(prevI + addI) : new Uint16Array(prevI + addI)
  if (oldIdx && oldIdx.length) (newIdx as any).set(oldIdx as any, 0)
  for (let i = 0; i < addI; i++) (newIdx as any)[prevI + i] = ((indices as any)[i] as number) + prevV
  this.geom.indexBuffer.data = newIdx as any
    this.geom.indexBuffer.update()

    this.vertexCount += addV
    this.indexCount += addI
    ;(this.mesh as any).size = this.indexCount
    ;(this.geom as any).vertexCount = this.vertexCount
  }
}

export type BatchAppendToken = {
  key: string
  style: BatchStyle
  positions: Float32Array
  uvs: Float32Array
  indices: Uint32Array | Uint16Array
  prevVertexCount: number
  prevIndexCount: number
}

/**
 * Aggregates many simple strokes into a few MeshGeometry per layer (one per material key).
 * Keeps Pluma/Contorno strokes untouched for editability; use only for static strokes.
 */
export class LayerBatch {
  private layer: Container
  private batches = new Map<string, Batch>()
  private partCounters = new Map<string, number>()
  private useUint32: boolean

  constructor(layer: Container, useUint32: boolean) {
    this.layer = layer
    this.useUint32 = useUint32
  }

  appendStroke(data: { positions: Float32Array; uvs: Float32Array; indices: Uint32Array | Uint16Array }, style: BatchStyle): BatchAppendToken {
    let key = makeKey(style)
    let batch = this.batches.get(key)
    if (!batch) {
      batch = new Batch(style, this.useUint32)
      this.batches.set(key, batch)
      this.layer.addChildAt(batch.mesh, 0)
    }
    // If 32-bit indices are not available, ensure we don't overflow 65535 vertices/indices.
    if (!this.useUint32) {
      const addV = data.positions.length / 2
      const addI = data.indices.length
      const wouldOverflow = (batch.vertexCount + addV) > 65535 || (batch.indexCount + addI) > 65535
      if (wouldOverflow) {
        // Create a new partitioned batch for this style
        const count = (this.partCounters.get(key) ?? 0) + 1
        this.partCounters.set(key, count)
        key = `${key}#${count}`
        batch = this.batches.get(key) || new Batch(style, this.useUint32)
        if (!this.batches.has(key)) {
          this.batches.set(key, batch)
          this.layer.addChildAt(batch.mesh, 0)
        }
      }
    }
    const token: BatchAppendToken = {
      key,
      style,
      positions: new Float32Array(data.positions),
      uvs: new Float32Array(data.uvs),
      indices: (data.indices instanceof Uint32Array ? new Uint32Array(data.indices) : new Uint16Array(data.indices)) as any,
      prevVertexCount: batch.vertexCount,
      prevIndexCount: batch.indexCount,
    }
    batch.append(data.positions, data.uvs, data.indices)
    return token
  }

  revertAppend(token: BatchAppendToken) {
    const batch = this.batches.get(token.key)
    if (!batch) return
    const geom = batch.geom
    const oldPos = geom.buffers[0].data as Float32Array
    const oldUV = geom.buffers[1].data as Float32Array
    const oldIdx = geom.indexBuffer.data as Uint32Array
    const nextPos = oldPos.subarray(0, token.prevVertexCount * 2)
    const nextUV = oldUV.subarray(0, token.prevVertexCount * 2)
    const nextIdx = oldIdx.subarray(0, token.prevIndexCount)
    geom.buffers[0].data = new Float32Array(nextPos)
    geom.buffers[0].update()
    geom.buffers[1].data = new Float32Array(nextUV)
    geom.buffers[1].update()
    geom.indexBuffer.data = new Uint32Array(nextIdx)
    geom.indexBuffer.update()
    batch.vertexCount = token.prevVertexCount
    batch.indexCount = token.prevIndexCount
    ;(batch.mesh as any).size = batch.indexCount
    ;(batch.geom as any).vertexCount = batch.vertexCount
    // If empty, remove mesh child and delete batch bucket
    if (batch.vertexCount === 0 || batch.indexCount === 0) {
      try { this.layer.removeChild(batch.mesh) } catch {}
      try { batch.mesh.destroy({ children: true }) } catch {}
      this.batches.delete(token.key)
    }
  }

  reapplyAppend(token: BatchAppendToken) {
    let batch = this.batches.get(token.key)
    if (!batch) {
      batch = new Batch(token.style, this.useUint32)
      this.batches.set(token.key, batch)
      this.layer.addChildAt(batch.mesh, 0)
    }
    batch.append(token.positions, token.uvs, token.indices)
  }
}
