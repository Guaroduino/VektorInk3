import type { Container } from 'pixi.js'
import type { BatchAppendToken } from './graphics/LayerBatch'

export type HistoryAction = {
  undo: () => void
  redo: () => void
  label?: string
}

export class HistoryManager {
  private undoStack: HistoryAction[] = []
  private redoStack: HistoryAction[] = []
  private onChangeCb?: () => void
  private grouping: HistoryAction[] | null = null
  private limit = 20

  constructor(onChange?: () => void, limit: number = 20) {
    this.onChangeCb = onChange
    this.limit = Math.max(1, Math.floor(limit))
  }

  private notify() { try { this.onChangeCb?.() } catch {} }
  private ensureCapacity() {
    while (this.undoStack.length > this.limit) this.undoStack.shift()
  }

  setLimit(n: number) {
    this.limit = Math.max(1, Math.floor(n))
    this.ensureCapacity()
    this.notify()
  }

  beginGroup() {
    if (!this.grouping) this.grouping = []
  }

  endGroup(label?: string) {
    if (!this.grouping) return
    const items = this.grouping
    this.grouping = null
    if (items.length === 0) return
    const action: HistoryAction = {
      label,
      undo: () => {
        for (let i = items.length - 1; i >= 0; i--) items[i].undo()
      },
      redo: () => {
        for (let i = 0; i < items.length; i++) items[i].redo()
      },
    }
    this.redoStack.length = 0
    this.undoStack.push(action)
    this.ensureCapacity()
    this.notify()
  }

  push(action: HistoryAction) {
    if (this.grouping) {
      this.grouping.push(action)
      return
    }
    this.redoStack.length = 0
    this.undoStack.push(action)
    this.ensureCapacity()
    this.notify()
  }

  canUndo() { return this.undoStack.length > 0 }
  canRedo() { return this.redoStack.length > 0 }

  undo() {
    const a = this.undoStack.pop()
    if (!a) return
    try { a.undo() } finally { this.redoStack.push(a); this.notify() }
  }

  redo() {
    const a = this.redoStack.pop()
    if (!a) return
    try { a.redo() } finally { this.undoStack.push(a); this.notify() }
  }

  // Helpers for common actions
  makeAddChildAction(parent: Container, child: any, index?: number): HistoryAction {
    const idx = index ?? parent.getChildIndex(child)
    return {
      label: 'addChild',
      undo: () => { try { parent.removeChild(child) } catch {} },
      redo: () => { try { parent.addChildAt(child, Math.max(0, Math.min(idx, parent.children.length))) } catch {} },
    }
  }

  makeRemoveChildAction(parent: Container, child: any, index: number): HistoryAction {
    return {
      label: 'removeChild',
      undo: () => { try { parent.addChildAt(child, Math.max(0, Math.min(index, parent.children.length))) } catch {} },
      redo: () => { try { parent.removeChild(child) } catch {} },
    }
  }

  makeBatchAppendAction(layerBatch: { revertAppend: (t: BatchAppendToken) => void; reapplyAppend: (t: BatchAppendToken) => void }, token: BatchAppendToken): HistoryAction {
    return {
      label: 'batchAppend',
      undo: () => { try { layerBatch.revertAppend(token) } catch {} },
      redo: () => { try { layerBatch.reapplyAppend(token) } catch {} },
    }
  }
}
