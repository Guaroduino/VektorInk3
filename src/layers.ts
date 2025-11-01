import { Container } from 'pixi.js'

export interface LayerInfo {
  id: string
  name: string
  node: Container
}

export class LayersManager {
  private stage: Container
  private layers: LayerInfo[] = []
  private _activeIndex = -1

  constructor(stage: Container) {
    this.stage = stage
  }

  get active(): LayerInfo | null {
    return this.layers[this._activeIndex] ?? null
  }

  list(): LayerInfo[] {
    return [...this.layers]
  }

  create(name = 'Capa'): LayerInfo {
    const node = new Container()
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const info: LayerInfo = { id, name, node }
    this.layers.push(info)
    this.stage.addChild(node)
    this._activeIndex = this.layers.length - 1
    return info
  }

  remove(id: string) {
    const idx = this.layers.findIndex((l) => l.id === id)
    if (idx === -1) return
    const [info] = this.layers.splice(idx, 1)
    this.stage.removeChild(info.node)
    info.node.destroy({ children: true })
    if (this._activeIndex >= this.layers.length) this._activeIndex = this.layers.length - 1
  }

  setActiveById(id: string) {
    const idx = this.layers.findIndex((l) => l.id === id)
    if (idx !== -1) this._activeIndex = idx
  }

  reorder(id: string, newIndex: number) {
    const idx = this.layers.findIndex((l) => l.id === id)
    if (idx === -1) return
    const [info] = this.layers.splice(idx, 1)
    const clamped = Math.max(0, Math.min(newIndex, this.layers.length))
    this.layers.splice(clamped, 0, info)
    this.stage.setChildIndex(info.node, clamped)
    this._activeIndex = clamped
  }
}
