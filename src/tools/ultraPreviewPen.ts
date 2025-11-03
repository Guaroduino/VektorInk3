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
    // Presente en la geometría por defecto; no lo usamos pero lo declaramos para silenciar el warning
    attribute vec2 aUV;
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
    uniform vec3 uTint;
    uniform float uGlobalAlpha;
    void main(){
      gl_FragColor = vec4(uTint, uGlobalAlpha * vAlpha);
    }
  `
  const program = GlProgram.from({ vertex: vert, fragment: frag })
  // En v8 podemos pasar uniforms directamente vía resources con sus nombres
  const shader = new (Shader as any)({
    glProgram: program,
    resources: {
      uTint: [r, g, b],
      uGlobalAlpha: globalAlpha,
      uWidth: 6,
      uMinScale: 0.5,
    },
  }) as Shader
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

    // Inicializa geometría vacía con firmas de v8 (evita errores de tipos)
    const geom = new MeshGeometry({
      positions: new Float32Array(),
      uvs: new Float32Array(),
      indices: new Uint32Array(),
    })

    // Atributos extra usados por el shader (añadidos como datos vacíos al inicio)
    const gAny: any = geom
    if (typeof gAny.addAttribute === 'function') {
      gAny.addAttribute('aPrev', new Float32Array(), 2)
      gAny.addAttribute('aNext', new Float32Array(), 2)
      gAny.addAttribute('aSide', new Float32Array(), 1)
      gAny.addAttribute('aPressure', new Float32Array(), 1)
    }

    const shader = createExtrudeShader(this.strokeColor, this.opacity)
    updateExtrudeShader(shader, this.strokeColor, this.opacity, this.widthBase, this.widthScaleRange[0])
    
    const mesh = new Mesh({
        geometry: geom,
        shader: shader,
        texture: Texture.WHITE, // textura dummy para mantener pipeline consistente
    })
    
    mesh.cullable = false
    mesh.blendMode = this.blendMode
    layer.addChild(mesh)
    this.previewMesh = mesh
    
    try {
      if (!this.debugText) {
        this.debugText = new Text({ text: '', style: { fill: 0x00ff88 as any, fontSize: 10 } })
        this.debugText.alpha = 0.8
      }
      if (this.debugText.parent !== layer) layer.addChild(this.debugText)
      this.debugText.x = 6
      this.debugText.y = 6
    } catch {}
  }

  update(samples: InputSample[]) {
    if (!samples.length) return
    for (const s of samples) {
      const p = Math.max(this.widthScaleRange[0], Math.min(this.widthScaleRange[1], (this.pressureSensitivity ? (s.pressure ?? 1) : 1)))
      const last = this.points[this.points.length - 1]
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= Math.max(0.25, this.previewCfg.decimatePx)) {
        this.points.push({ x: s.x, y: s.y, pressure: p })
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

    const n = this.points.length
    const mesh = this.previewMesh
    const g = mesh.geometry

    if (n < 2) {
      if (mesh.visible) {
        mesh.visible = false
        const gAny: any = g
        // Vacía buffers de forma segura (firma v8)
        gAny.buffers[0].data = new Float32Array(0)
        gAny.buffers[0].update()
        gAny.indexBuffer.data = new Uint16Array(0)
        gAny.indexBuffer.update()
        ;(mesh as any).size = 0
      }
      try { if (this.debugText) this.debugText.text = 'ULTRA: v=0 i=0' } catch {}
      return
    }

    mesh.visible = true
    const vCount = n * 2
    const iCount = (n - 1) * 6

    // 1. Crear nuevos TypedArrays con el tamaño exacto necesario
    const posData = new Float32Array(vCount * 2)
    const prevData = new Float32Array(vCount * 2)
    const nextData = new Float32Array(vCount * 2)
    const sideData = new Float32Array(vCount)
    const pressureData = new Float32Array(vCount)
    const idxData = new Uint16Array(iCount)

    // 2. Llenar los arrays
    for (let i = 0; i < n; i++) {
        const p = this.points[i]
        const prev = this.points[i > 0 ? i - 1 : i]
        const next = this.points[i < n - 1 ? i + 1 : i]
        const vtxIdx = i * 2

        // Vértice izquierdo (-1)
        posData[vtxIdx * 2 + 0] = p.x
        posData[vtxIdx * 2 + 1] = p.y
        prevData[vtxIdx * 2 + 0] = prev.x
        prevData[vtxIdx * 2 + 1] = prev.y
        nextData[vtxIdx * 2 + 0] = next.x
        nextData[vtxIdx * 2 + 1] = next.y
        sideData[vtxIdx] = -1
        pressureData[vtxIdx] = p.pressure

        // Vértice derecho (+1)
        posData[(vtxIdx + 1) * 2 + 0] = p.x
        posData[(vtxIdx + 1) * 2 + 1] = p.y
        prevData[(vtxIdx + 1) * 2 + 0] = prev.x
        prevData[(vtxIdx + 1) * 2 + 1] = prev.y
        nextData[(vtxIdx + 1) * 2 + 0] = next.x
        nextData[(vtxIdx + 1) * 2 + 1] = next.y
        sideData[vtxIdx + 1] = 1
        pressureData[vtxIdx + 1] = p.pressure
    }

    for (let i = 1; i < n; i++) {
      const i0 = (i - 1) * 2
      const i1 = i * 2
      const idx = (i - 1) * 6
      idxData[idx + 0] = i0
      idxData[idx + 1] = i0 + 1
      idxData[idx + 2] = i1
      idxData[idx + 3] = i1
      idxData[idx + 4] = i0 + 1
      idxData[idx + 5] = i1 + 1
    }

    // 3. Actualizar buffers/atributos según la API de Pixi v8
    const gAny: any = g
    // aPosition (buffer 0 por convención en nuestros meshes)
    gAny.buffers[0].data = posData
    gAny.buffers[0].update()
    // uvs no se usan en este shader, pero mantenemos el buffer presente
    if (gAny.buffers[1]) { gAny.buffers[1].data = new Float32Array(vCount * 2); gAny.buffers[1].update() }
    // atributos personalizados
    if (typeof gAny.addAttribute === 'function') {
      gAny.addAttribute('aPrev', prevData, 2)
      gAny.addAttribute('aNext', nextData, 2)
      gAny.addAttribute('aSide', sideData, 1)
      gAny.addAttribute('aPressure', pressureData, 1)
    }
    // index buffer
    gAny.indexBuffer.data = idxData
    gAny.indexBuffer.update()

    // 4. Actualizar el tamaño del mesh (prop interna)
    ;(mesh as any).size = iCount
    ;(gAny as any).vertexCount = vCount
    
    try { if (this.debugText) this.debugText.text = `ULTRA: v=${vCount} i=${iCount}` } catch {}

    // Update material uniforms
    if ((mesh as any).shader) {
      updateExtrudeShader((mesh as any).shader as Shader, this.strokeColor, this.opacity, this.widthBase, this.widthScaleRange[0])
    }
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