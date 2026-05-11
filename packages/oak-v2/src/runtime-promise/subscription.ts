import type { OakKernel } from '../core/index.js'

/**
 * Callback-shaped subscription for the Promise platform.
 *
 * The platform watches `select(model)` for changes (deduped by `eq` or
 * `Object.is`). On each change it disposes the previous `cleanup` callback
 * (if any) and calls `run(value, dispatch)`, storing the new cleanup.
 *
 * `run` is responsible for any async work it wants to do — setting up
 * timers, opening WebSockets, polling — and must return a cleanup function
 * that tears that work down.
 */
export interface PromiseSub<M, Msg, A> {
  select(model: M): A
  run(value: A, dispatch: (msg: Msg) => void): () => void
  eq?(prev: A, curr: A): boolean
}

/**
 * Starts a Promise subscription against a running program's private state.
 *
 * Returns a disposer that tears down the subscription, including any in-flight
 * `run` cleanup.
 */
export function startPromiseSub<M, Msg, A>(
  kernel: OakKernel<M, Msg>,
  sub: PromiseSub<M, Msg, A>,
): () => void {
  const eq = sub.eq ?? Object.is

  const initial = sub.select(kernel.state.value)
  let lastSelected = initial
  let currentCleanup: (() => void) | undefined = (() => {
    try {
      return sub.run(initial, kernel.dispatch)
    } catch (error) {
      kernel.reportDiagnostic('subscription', error)
      return undefined
    }
  })()

  const unsubscribe = kernel.state.subscribe((model) => {
    const next = sub.select(model)
    if (eq(lastSelected, next)) {
      return
    }
    lastSelected = next

    if (currentCleanup) {
      try {
        currentCleanup()
      } catch (error) {
        kernel.reportDiagnostic('subscription', error)
      }
      currentCleanup = undefined
    }

    try {
      currentCleanup = sub.run(next, kernel.dispatch)
    } catch (error) {
      kernel.reportDiagnostic('subscription', error)
      currentCleanup = undefined
    }
  })

  return () => {
    unsubscribe()
    if (currentCleanup) {
      try {
        currentCleanup()
      } catch (error) {
        kernel.reportDiagnostic('subscription', error)
      }
      currentCleanup = undefined
    }
  }
}
