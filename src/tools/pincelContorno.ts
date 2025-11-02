import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import simplify from 'simplify-js'
import type { InputSample } from '../input'
import { triangulateWithTess2Async } from '../geom/tessWorkerClient'
import { buildStrokeStrip, buildOuterPolygon, type PressureMode, type StrokeBuilderParams } from '../geom/strokeBuilder'

/**
 * Pincel de Contorno (Vectorial Editable)
 * - Feedback tiempo real igual a Pluma
 * - Al soltar: crea un Graphics permanente rellenando el contorno simplificado
 */
export class PincelContornoTool {
  private previewMesh: Mesh | null = null
  private points: { x: number; y: number; pressure?: number; time?: number }[] = []
  private strokeSize = 10
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'normal'
  private pressureSensitivity = true
  private pressureMode: PressureMode = 'width'
  private pressureCurve: 'linear' | 'sqrt' | 'square' | { exponent: number } = 'linear'
  private widthScaleRange: [number, number] = [0.5, 1.0]
  private opacityRange: [number, number] = [0.5, 1.0]
  private thinning: { minSpeedScale?: number; speedRefPxPerMs?: number; window?: number; exponent?: number } | undefined = undefined
  private jitter: { amplitude?: number; frequency?: number; seed?: number } | undefined = undefined
  private _seq = 0
  private _pending = false

  setStyle(styleOrSize: any, color?: number) {
    if (typeof styleOrSize === 'object') {
      const s = styleOrSize as {
        strokeSize?: number; strokeColor?: number; opacity?: number; blendMode?: string;
        pressureSensitivity?: boolean; pressureMode?: PressureMode;
        pressureCurve?: 'linear' | 'sqrt' | 'square' | { exponent: number }
        widthScaleRange?: [number, number]
        opacityRange?: [number, number]
        thinning?: { minSpeedScale?: number; speedRefPxPerMs?: number; window?: number; exponent?: number }
        jitter?: { amplitude?: number; frequency?: number; seed?: number }
      }
      if (typeof s.strokeSize === 'number') this.strokeSize = s.strokeSize
      if (typeof s.strokeColor === 'number') this.strokeColor = s.strokeColor >>> 0
      if (typeof s.opacity === 'number') this.opacity = s.opacity
      if (typeof s.blendMode === 'string') this.blendMode = s.blendMode as any
      if (typeof s.pressureSensitivity === 'boolean') this.pressureSensitivity = s.pressureSensitivity
      if (s.pressureMode) this.pressureMode = s.pressureMode
      if (s.pressureCurve) this.pressureCurve = s.pressureCurve
      if (s.widthScaleRange) this.widthScaleRange = s.widthScaleRange
      if (s.opacityRange) this.opacityRange = s.opacityRange
      if (s.thinning) this.thinning = { ...s.thinning }
      if (s.jitter) this.jitter = { ...s.jitter }
    } else {
      this.strokeSize = styleOrSize
      this.strokeColor = (color ?? this.strokeColor) >>> 0
    }
  }

  start(layer: Container) {
    // Crear Mesh de preview con geometría vacía
    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
    ;(mesh as any).blendMode = this.blendMode
    ;(mesh as any).size = 0
    ;(geom as any).vertexCount = 0
    mesh.visible = false
    layer.addChild(mesh)
  this.previewMesh = mesh
  this.points = []
  }

  update(samples: InputSample[]) {
    for (const s of samples) this.points.push({ x: s.x, y: s.y, pressure: s.pressure, time: s.time })
    if (!this.previewMesh) return
    // Build polygon and tessellate in preview to avoid opacity accumulation
    const { outlines } = buildStrokeStrip(this.points as any, this._builderParams())
    const polyF32 = buildOuterPolygon(outlines.left, outlines.right, true)
    const geom = this.previewMesh.geometry
    if (polyF32.length < 6) {
      geom.buffers[0].data = new Float32Array(0)
      geom.buffers[0].update()
      geom.buffers[1].data = new Float32Array(0)
      geom.buffers[1].update()
      geom.indexBuffer.data = new Uint32Array(0)
      geom.indexBuffer.update()
      ;(this.previewMesh as any).size = 0
      ;(geom as any).vertexCount = 0
      this.previewMesh.visible = false
      return
    }
    const poly: { x: number; y: number }[] = []
    for (let i = 0; i < polyF32.length - 2; i += 2) poly.push({ x: polyF32[i], y: polyF32[i + 1] })
    const seq = ++this._seq
    if (this._pending) return
    this._pending = true
    triangulateWithTess2Async([poly], 'nonzero').then(({ positions, indices }) => {
      this._pending = false
      if (!this.previewMesh) return
      if (seq !== this._seq) return
      if (!positions || !indices || indices.length < 3) {
        geom.buffers[0].data = new Float32Array(0)
        geom.buffers[0].update()
        geom.buffers[1].data = new Float32Array(0)
        geom.buffers[1].update()
        geom.indexBuffer.data = new Uint32Array(0)
        geom.indexBuffer.update()
        ;(this.previewMesh as any).size = 0
        ;(geom as any).vertexCount = 0
        this.previewMesh.visible = false
        return
      }
      const uvs = new Float32Array((positions.length / 2) * 2)
      geom.buffers[0].data = positions
      geom.buffers[0].update()
      geom.buffers[1].data = uvs
      geom.buffers[1].update()
      geom.indexBuffer.data = indices
      geom.indexBuffer.update()
      ;(this.previewMesh as any).size = indices.length
      ;(geom as any).vertexCount = positions.length / 2
      this.previewMesh.visible = true
      this.previewMesh.alpha = this.opacity
    }).catch(() => { this._pending = false })
  }

  async end(layer: Container) {
    if (this.points.length < 2) {
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      this.points = []
      return { graphic: null as any, controlPoints: [] }
    }

    const result = buildStrokeStrip(this.points as any, this._builderParams())
    // Build polygon from outlines
    const polyF32 = buildOuterPolygon(result.outlines.left, result.outlines.right, true)
    if (polyF32.length < 6) {
      this.previewMesh?.destroy({ children: true })
      this.previewMesh = null
      this.points = []
      return { graphic: null as any, controlPoints: [] }
    }
    const poly = [] as { x: number; y: number }[]
    for (let i = 0; i < polyF32.length - 2; i += 2) { // last two repeat first when closed
      poly.push({ x: polyF32[i], y: polyF32[i + 1] })
    }
    const simplified = simplify(poly, 2.0, true)
    const { positions, indices } = await triangulateWithTess2Async([poly], 'nonzero')
    const finalGeom = new MeshGeometry({
      positions,
      uvs: new Float32Array((positions.length / 2) * 2),
      indices,
    })
    const finalMesh = new Mesh({ geometry: finalGeom, texture: Texture.WHITE })
    finalMesh.tint = this.strokeColor
    finalMesh.alpha = this.opacity
    ;(finalMesh as any).blendMode = this.blendMode
    layer.addChild(finalMesh)
    ;(finalMesh as any).size = indices.length
    ;(finalGeom as any).vertexCount = positions.length / 2

    this.previewMesh?.destroy({ children: true })
    this.previewMesh = null
    this.points = []

    return { graphic: finalMesh, controlPoints: simplified }
  }

  private _builderParams(): StrokeBuilderParams {
    return {
      baseWidth: this.strokeSize,
      pressureSensitivity: this.pressureSensitivity,
      pressureMode: this.pressureMode,
      pressureCurve: this.pressureCurve,
      widthScaleRange: this.widthScaleRange,
      opacityRange: this.opacityRange,
      thinning: this.thinning,
      jitter: this.jitter,
    }
  }
}
