import {
  Container,
  Mesh,
  MeshGeometry,
  Shader,
  GlProgram,
  Texture,
  Text,
} from 'pixi.js'
import type { InputSample } from '../input'
import { buildStrokeStrip, type StrokeBuilderParams, type PressureMode } from '../geom/strokeBuilder'

// Simple color -> vec3
function colorToVec3(color: number): [number, number, number] {
  const r = ((color >>> 0) >> 16) & 0xff
  const g = ((color >>> 0) >> 8) & 0xff
  const b = (color >>> 0) & 0xff
  return [r / 255, g / 255, b / 255]
}

// --- SHADER CORREGIDO ---
function createExtrudeShader(color: number, globalAlpha: number): Shader {
  try { (console as any).info?.('[UltraPreviewPen] createExtrudeShader() init') } catch {}
  const [r, g, b] = colorToVec3(color)
  
  const vert = `
    precision mediump float;
    attribute vec2 aPosition;
    // Presente en la geometría por defecto; we reference it to avoid GLSL removing it during optimization
    attribute vec2 aUV;
    varying vec2 vUV;
    attribute vec2 aPrev;
    attribute vec2 aNext;
    attribute float aSide;
    attribute float aPressure;

    // Pixi v8: uWorldTransform y uProjectionMatrix
    uniform mat3 uWorldTransform;
    uniform mat3 uProjectionMatrix;
    uniform float uWidth;
    uniform float uMinScale;
    varying float vAlpha;

    void main(){
      vec2 prev = aPrev;
      vec2 curr = aPosition;
      vec2 next = aNext;
      // keep aUV as used so the attribute remains available in the linked program
      vUV = aUV;
      vec2 dir = normalize(next - prev);
      if (!all(greaterThan(abs(dir), vec2(1e-5)))) {
        dir = vec2(1.0, 0.0);
      }
      vec2 n = vec2(-dir.y, dir.x);
      float scale = max(aPressure, uMinScale);
      vec2 offset = n * aSide * (uWidth * 0.5 * scale);

      // Transformación a mundo y proyección
      vec3 world = uWorldTransform * vec3(curr + offset, 1.0);

      vec3 clip = uProjectionMatrix * world;
      gl_Position = vec4(clip.xy, 0.0, 1.0);
      vAlpha = 1.0;
    }
  `
  
  const frag = `
    precision mediump float;
    varying float vAlpha;
    varying vec2 vUV;
    uniform vec3 uTint;
    uniform float uGlobalAlpha;
    void main(){
      gl_FragColor = vec4(uTint, uGlobalAlpha * vAlpha);
    }
  `
  let program: any
  try {
    program = GlProgram.from({ vertex: vert, fragment: frag })
  } catch (err) {
    // Re-throw with context
    throw new Error('[UltraPreviewPen] GlProgram.from failed: ' + (err as any)?.message)
  }

  // Avoid passing primitive numbers directly in "resources" to Pixi's Shader constructor.
  // Pixi may attempt to set properties on each resource value (e.g. `name`), which fails for
  // primitive values like numbers. We'll create the Shader with an empty resources object
  // and populate uniforms afterwards via updateExtrudeShader.
  let shader: Shader
  try {
    shader = new (Shader as any)({ glProgram: program, resources: {} }) as Shader
  } catch (err) {
    throw new Error('[UltraPreviewPen] Shader creation failed: ' + (err as any)?.message)
  }
  return shader
}

function updateExtrudeShader(shader: Shader, color: number, alpha: number, width: number, minScale: number) {
  const [r, g, b] = colorToVec3(color)
  const res: any = (shader as any).resources
  if (res) {
    res.uTint = [r, g, b]
    res.uGlobalAlpha = alpha
    res.uWidth = width
    res.uMinScale = Math.max(0.0, Math.min(1.0, minScale))
  }
}

export class UltraPreviewPenTool {
  private container: Container | null = null
  // Usa 'any' para permitir tanto TextureShader como shaders personalizados
  private previewMesh: Mesh<any, any> | null = null
  private debugText: Text | null = null
  private points: { x: number; y: number; pressure: number }[] = []
  private widthBase = 6
  private strokeColor = 0xffffff
  private opacity = 1.0
  private blendMode: any = 'normal'
  private pressureSensitivity = true
  private widthScaleRange: [number, number] = [0.5, 1.0]
  private streamline = 0
  private previewCfg: { decimatePx: number; minMs: number } = { decimatePx: 0.5, minMs: 8 }
  private _rafScheduled = false
  private _lastUpdate = 0

  setStyle(styleOrSize: any, color?: number) {
    if (typeof styleOrSize === 'object') {
      const s = styleOrSize as {
        strokeSize?: number; strokeColor?: number; opacity?: number; blendMode?: string;
        pressureSensitivity?: boolean; widthScaleRange?: [number, number]
      }
      if (typeof s.strokeSize === 'number') this.widthBase = Math.max(1, s.strokeSize)
      if (typeof s.strokeColor === 'number') this.strokeColor = s.strokeColor >>> 0
      if (typeof s.opacity === 'number') this.opacity = Math.max(0.01, Math.min(1, s.opacity))
      if (typeof s.blendMode === 'string') this.blendMode = s.blendMode as any
      if (typeof s.pressureSensitivity === 'boolean') this.pressureSensitivity = s.pressureSensitivity
      if (s.widthScaleRange) this.widthScaleRange = s.widthScaleRange
      if ((styleOrSize as any).preview) this.previewCfg = { ...(styleOrSize as any).preview }
      if (typeof (styleOrSize as any).streamline === 'number') this.streamline = Math.max(0, Math.min(1, (styleOrSize as any).streamline))
    } else {
      this.widthBase = Math.max(1, styleOrSize)
      this.strokeColor = (color ?? this.strokeColor) >>> 0
    }
  }

  private _builderParams(): StrokeBuilderParams {
    return {
      baseWidth: this.widthBase,
      pressureSensitivity: this.pressureSensitivity,
      pressureMode: 'width' as PressureMode,
      pressureCurve: 'linear',
      widthScaleRange: this.widthScaleRange,
      opacityRange: [1, 1],
      thinning: undefined,
      jitter: undefined,
      streamline: this.streamline,
    }
  }

  // --- ¡CORREGIDO! ---
  start(layer: Container) {
    this.container = layer
    this.points = []
    this._lastUpdate = 0

    // Geometría vacía inicial y Mesh con shader por defecto (TextureShader)
    const geom = new MeshGeometry({ positions: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array() })
    const mesh = new Mesh({ geometry: geom, texture: Texture.WHITE })
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
    
    mesh.cullable = false
    mesh.blendMode = this.blendMode
    layer.addChild(mesh)
    this.previewMesh = mesh
  try { console.debug?.('[UltraPreviewPen] start: preview mesh added', { widthBase: this.widthBase, strokeColor: this.strokeColor }) } catch {}
    
    try {
      if (!this.debugText) {
        // Pixi v8: prefer the new object form { text, style }
        this.debugText = new Text({ text: '', style: { fill: 0x00ff88 as any, fontSize: 10 } } as any)
        this.debugText.alpha = 0.8
      }
      if (this.debugText.parent !== layer) layer.addChild(this.debugText)
      this.debugText.x = 6
      this.debugText.y = 6
    } catch {}
  }

  update(samples: InputSample[]) {
    if (!samples.length) return
    try { console.debug?.('[UltraPreviewPen] update called, samples=', samples.length) } catch {}
    for (const s of samples) {
      const p = Math.max(this.widthScaleRange[0], Math.min(this.widthScaleRange[1], (this.pressureSensitivity ? (s.pressure ?? 1) : 1)))
      const last = this.points[this.points.length - 1]
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= Math.max(0.25, this.previewCfg.decimatePx)) {
        this.points.push({ x: s.x, y: s.y, pressure: p })
        try { console.debug?.('[UltraPreviewPen] point added, total=', this.points.length) } catch {}
      }
    }
    if (!this._rafScheduled) {
      this._rafScheduled = true
      requestAnimationFrame(() => { this._rafScheduled = false; this._updatePreview() })
    }
  }

  // ¡Función _ensureCap eliminada! Ya no es necesaria.

  // --- ¡CORREGIDO! ---
  private _updatePreview() {
    if (!this.previewMesh) return
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    if (now - this._lastUpdate < this.previewCfg.minMs) return
    this._lastUpdate = now

    // Construir una tira extruida con el builder (igual que el final) y volcar en buffers
    const { strip } = buildStrokeStrip(this.points as any, this._builderParams())
    const mesh = this.previewMesh
    const g = mesh.geometry
    const gAny: any = g
    if (strip.indices.length < 3) {
      gAny.buffers[0].data = new Float32Array(0)
      gAny.buffers[0].update()
      gAny.buffers[1].data = new Float32Array(0)
      gAny.buffers[1].update()
      gAny.indexBuffer.data = new Uint32Array(0)
      gAny.indexBuffer.update()
      ;(mesh as any).size = 0
      mesh.visible = false
      try { if (this.debugText) this.debugText.text = 'ULTRA: v=0 i=0' } catch {}
      return
    }

    gAny.buffers[0].data = strip.positions
    gAny.buffers[0].update()
    gAny.buffers[1].data = strip.uvs
    gAny.buffers[1].update()
    gAny.indexBuffer.data = strip.indices
    gAny.indexBuffer.update()
    ;(mesh as any).size = strip.indices.length
    ;(gAny as any).vertexCount = strip.positions.length / 2
    mesh.visible = true
    try { if (this.debugText) this.debugText.text = `ULTRA: v=${strip.positions.length/2} i=${strip.indices.length}` } catch {}
    
  try { if (this.debugText) this.debugText.text = `ULTRA: v=${this.points.length * 2} i=${Math.max(0, (this.points.length - 1) * 6)}` } catch {}

    // Mantener estilo
    mesh.tint = this.strokeColor
    mesh.alpha = this.opacity
  }

  end() {
    const layer = this.container
    const pts = this.points
    // Cleanup preview
    try { this.previewMesh?.destroy({ children: true }) } catch {}
    this.previewMesh = null

    if (!layer || pts.length < 2) {
      this.container = null
      this.points = []
      return null
    }
    // Build final high-quality strip (vector mesh).
    const { strip } = buildStrokeStrip(pts as any, this._builderParams())
    const geom = new MeshGeometry({ positions: strip.positions, uvs: strip.uvs, indices: strip.indices })
    
    // ¡CORREGIDO! El Mesh final usa el shader por defecto (TextureShader), 
    // así que no necesita el tipo genérico <..., Shader>
    const final = new Mesh({ geometry: geom, texture: Texture.WHITE }) 
    final.tint = this.strokeColor
    final.alpha = this.opacity
    ;(final as any).blendMode = this.blendMode
    layer.addChild(final)

    const result = { mesh: final, points: pts, style: { color: this.strokeColor, opacity: this.opacity, blendMode: this.blendMode } }
    this.container = null
    this.points = []
    return result
  }
}