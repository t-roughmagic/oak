import type { Equality } from './types.js'

export interface CellOptions<M> {
  readonly eq?: Equality<M>
  readonly onListenerError?: (error: unknown) => void
}

/**
 * Synchronous mutable cell with deduplicated writes and callback subscribers.
 *
 * Internal to the kernel. Platform and view surfaces expose only the read-only
 * `OakState<M>` projection; only the kernel itself writes via `set`.
 */
export class Cell<M> {
  private current: M
  private readonly eq: Equality<M>
  private readonly listeners = new Set<(model: M) => void>()
  private readonly onListenerError: ((error: unknown) => void) | undefined

  constructor(initial: M, options: CellOptions<M> = {}) {
    this.current = initial
    this.eq = options.eq ?? Object.is
    this.onListenerError = options.onListenerError
  }

  get value(): M {
    return this.current
  }

  set(next: M): void {
    if (this.eq(this.current, next)) {
      return
    }

    this.current = next

    for (const listener of Array.from(this.listeners)) {
      try {
        listener(next)
      } catch (error) {
        this.onListenerError?.(error)
      }
    }
  }

  subscribe(listener: (model: M) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
