import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { useOakKernel } from './context.js'

/**
 * Synchronous selector hook over the kernel state.
 *
 * Selector memoization is intentionally a user concern. If `(model) => A`
 * returns a new object each render, pass a structural `eq` or wrap the
 * selector with `proxy-memoize` / `reselect` / your tool of choice before
 * passing it here.
 */
export function useOakSelector<M, A, Msg = unknown>(
  selector: (model: M) => A,
  eq: (prev: A, curr: A) => boolean = Object.is,
): A {
  const kernel = useOakKernel<M, Msg>()
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const { subscribe, getSnapshot } = useMemo(() => {
    let currentSelected = selectorRef.current(kernel.state.value)

    const syncSelected = (onStoreChange?: () => void): void => {
      const nextSelected = selectorRef.current(kernel.state.value)
      if (!eqRef.current(currentSelected, nextSelected)) {
        currentSelected = nextSelected
        onStoreChange?.()
      }
    }

    return {
      subscribe: (onStoreChange: () => void) => {
        const unsubscribe = kernel.state.subscribe(() => {
          syncSelected(onStoreChange)
        })
        syncSelected(onStoreChange)
        return unsubscribe
      },
      getSnapshot: () => {
        syncSelected()
        return currentSelected
      },
    }
  }, [kernel])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Stable React callback that dispatches a message to the kernel. */
export function useOakDispatch<Msg, M = unknown>(): (msg: Msg) => void {
  const kernel = useOakKernel<M, Msg>()
  return useCallback(
    (msg: Msg) => {
      kernel.dispatch(msg)
    },
    [kernel],
  )
}
