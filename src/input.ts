export type PointerPhase = 'start' | 'move' | 'end' | 'cancel'

export interface InputSample {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  pointerId: number
  time: number
  pointerType: string
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  // Marca opcional para muestras predichas (extrapoladas)
  predicted?: boolean
}

export interface InputOptions {
  // Coordenadas relativas al elemento objetivo (default) o absolutas en client space
  relativeToTarget?: boolean
  // Usar eventos de alta frecuencia "pointerrawupdate" en lugar de "pointermove" (Chromium)
  usePointerRawUpdate?: boolean
  // Extrapolación simple del último punto (ms en el futuro)
  predictionMs?: number
}

export type SamplesCallback = (pointerId: number, samples: InputSample[], phase: PointerPhase, rawEvent: PointerEvent) => void

/**
 * Capturador de entrada de alta fidelidad usando getCoalescedEvents() cuando esté disponible.
 * Adjunta listeners al elemento dado (o window) y emite batches de muestras.
 */
export function createInputCapture(
  target: HTMLElement | Window,
  onSamples: SamplesCallback,
  options: InputOptions = {}
) {
  const rel = options.relativeToTarget ?? true
  const element: HTMLElement | null = target instanceof Window ? null : (target as HTMLElement)
  const activePointers = new Set<number>()

  const getXY = (e: PointerEvent) => {
    if (!rel || !element) return { x: e.clientX, y: e.clientY }
    const r = element.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const mapSample = (e: PointerEvent): InputSample => {
    const { x, y } = getXY(e)
    return {
      x,
      y,
      pressure: e.pressure ?? 0.5,
      tiltX: (e as any).tiltX ?? 0,
      tiltY: (e as any).tiltY ?? 0,
      pointerId: e.pointerId,
      time: e.timeStamp,
      pointerType: e.pointerType,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    }
  }

  const emitCoalesced = (e: PointerEvent, phase: PointerPhase) => {
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
    const samples = evs.map((ev) => mapSample(ev as PointerEvent))
    // Predicción básica: usa los dos últimos eventos coalescidos para estimar velocidad
    const predMs = Math.max(0, options.predictionMs ?? 0)
    if (!options.usePointerRawUpdate && predMs > 0 && samples.length >= 2) {
      const a = samples[samples.length - 2]
      const b = samples[samples.length - 1]
      const dt = Math.max(0.0001, (b.time - a.time))
      // timeStamp suele estar en ms con origen de performance; trabajamos en ms
      const vx = (b.x - a.x) / dt
      const vy = (b.y - a.y) / dt
      const px = b.x + vx * predMs
      const py = b.y + vy * predMs
      samples.push({ ...b, x: px, y: py, time: b.time + predMs, predicted: true })
    }
    onSamples(e.pointerId, samples, phase, e)
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'pen' && e.pointerType !== 'touch') return
    activePointers.add(e.pointerId)
    if (element && 'setPointerCapture' in element && e.target && (e.target as Element).hasPointerCapture === undefined) {
      // Preferimos capturar sobre el elemento objetivo si aplica
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId)
      } catch {}
    }
    emitCoalesced(e, 'start')
  }

  const onMove = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return
    emitCoalesced(e, 'move')
  }

  const onUpOrCancel = (e: PointerEvent, phase: PointerPhase) => {
    if (!activePointers.has(e.pointerId)) return
    emitCoalesced(e, phase)
    activePointers.delete(e.pointerId)
    try {
      (e.target as Element)?.releasePointerCapture?.(e.pointerId)
    } catch {}
  }

  const targetAdd = (type: string, handler: any) => {
    (target as any).addEventListener(type, handler, { passive: true })
  }
  const targetRemove = (type: string, handler: any) => {
    (target as any).removeEventListener(type, handler)
  }

  const down = (e: Event) => onDown(e as PointerEvent)
  const move = (e: Event) => onMove(e as PointerEvent)
  const raw = (e: Event) => onMove(e as PointerEvent)
  const up = (e: Event) => onUpOrCancel(e as PointerEvent, 'end')
  const cancel = (e: Event) => onUpOrCancel(e as PointerEvent, 'cancel')

  targetAdd('pointerdown', down)
  if (options.usePointerRawUpdate) targetAdd('pointerrawupdate', raw)
  else targetAdd('pointermove', move)
  targetAdd('pointerup', up)
  targetAdd('pointercancel', cancel)
  targetAdd('lostpointercapture', cancel)

  return {
    dispose() {
      targetRemove('pointerdown', down)
      if (options.usePointerRawUpdate) targetRemove('pointerrawupdate', raw)
      else targetRemove('pointermove', move)
      targetRemove('pointerup', up)
      targetRemove('pointercancel', cancel)
      targetRemove('lostpointercapture', cancel)
      activePointers.clear()
    },
  }
}
