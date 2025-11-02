import { Texture, GlProgram, Shader } from 'pixi.js'

function colorToVec3(color: number): [number, number, number] {
  const r = ((color >> 16) & 0xff) / 255
  const g = ((color >> 8) & 0xff) / 255
  const b = (color & 0xff) / 255
  return [r, g, b]
}

const VERT = `
precision mediump float;

attribute vec2 aPosition;
attribute vec2 aTextureCoord;
attribute float aAlpha;

uniform mat3 uWorldTransform;
uniform mat3 uProjectionMatrix;

varying vec2 vTextureCoord;
varying float vAlpha;

void main(void){
  vec3 pos = uWorldTransform * vec3(aPosition, 1.0);
  pos = uProjectionMatrix * pos;
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  vTextureCoord = aTextureCoord;
  vAlpha = aAlpha;
}
`

const FRAG = `
precision mediump float;

varying vec2 vTextureCoord;
varying float vAlpha;

uniform sampler2D uSampler;
uniform vec3 uTint;
uniform float uGlobalAlpha;

void main(void){
  vec4 tex = texture2D(uSampler, vTextureCoord);
  vec3 color = tex.rgb * uTint;
  float alpha = tex.a * uGlobalAlpha * vAlpha;
  gl_FragColor = vec4(color, alpha);
}
`

export function createAlphaStripShader(color: number, globalAlpha: number, texture: Texture = Texture.WHITE): Shader {
  const [r, g, b] = colorToVec3(color >>> 0)
  const program = GlProgram.from({ vertex: VERT, fragment: FRAG })
  const shader = new (Shader as any)({
    glProgram: program,
    resources: {
      uSampler: texture,
      uTint: [r, g, b],
      uGlobalAlpha: globalAlpha,
    },
  }) as Shader
  return shader
}

export function updateAlphaStripShader(shader: Shader, color: number, globalAlpha: number) {
  const [r, g, b] = colorToVec3(color >>> 0)
  ;(shader as any).resources.uTint = [r, g, b]
  ;(shader as any).resources.uGlobalAlpha = globalAlpha
}
