import type { VektorEngine } from '../VektorEngine'

declare global {
  interface Window {
    engine: VektorEngine
  }
}

export {}
