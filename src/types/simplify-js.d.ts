declare module 'simplify-js' {
  export interface PointLike { x: number; y: number }
  function simplify(points: PointLike[], tolerance?: number, highQuality?: boolean): PointLike[]
  export default simplify
}
