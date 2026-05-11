import { Effect, Equal, Stream } from 'effect'
import type { OakState } from './types.js'

export interface CellOptions {
  readonly onListenerError?: (error: unknown) => void
}

export class Cell<M> implements OakState<M> {
  private current: M
  private readonly listeners = new Set<(model: M) => void>()
  private readonly onListenerError: ((error: unknown) => void) | undefined

  constructor(initial: M, options: CellOptions = {}) {
    this.current = initial
    this.onListenerError = options.onListenerError
  }

  get value(): M {
    return this.current
  }

  set(next: M): void {
    if (Equal.equals(this.current, next)) {
      return
    }

    this.current = next

    for (const listener of Array.from(this.listeners)) {
      try {
        listener(next)
      } catch (error) {
        if (this.onListenerError) {
          this.onListenerError(error)
        } else {
          throw error
        }
      }
    }
  }

  modify<A>(f: (model: M) => readonly [A, M]): A {
    const [value, next] = f(this.current)
    this.set(next)
    return value
  }

  subscribe(listener: (model: M) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get changes(): Stream.Stream<M> {
    return Stream.asyncPush<M>((emit) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          emit.single(this.current)
          return this.subscribe((model) => {
            emit.single(model)
          })
        }),
        (unsubscribe) => Effect.sync(unsubscribe),
      ),
    )
  }
}
