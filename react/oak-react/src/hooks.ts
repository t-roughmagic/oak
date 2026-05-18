import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { useOakDriver } from './context.js'

/**
 * Synchronous selector hook over a running Oak program's view driver.
 *
 * Selector memoization is intentionally a user concern. If `(model) => A`
 * returns a new object each render, pass a structural `eq` or wrap the
 * selector with `proxy-memoize` / `reselect` / your tool of choice before
 * passing it here.
 */
export function useOakSelector<M, A>(
  selector: (model: M) => A,
  eq: (prev: A, curr: A) => boolean = Object.is,
): A {
  const driver = useOakDriver<M, never>()
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const { subscribe, getSnapshot } = useMemo(() => {
    let currentSelected = selectorRef.current(driver.state.value)

    const syncSelected = (onStoreChange?: () => void): void => {
      const nextSelected = selectorRef.current(driver.state.value)
      if (!eqRef.current(currentSelected, nextSelected)) {
        currentSelected = nextSelected
        onStoreChange?.()
      }
    }

    return {
      subscribe: (onStoreChange: () => void) => {
        const unsubscribe = driver.state.subscribe(() => {
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
  }, [driver])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Stable React callback that dispatches a message through the view driver. */
export function useOakDispatch<Msg>(): (msg: Msg) => void {
  const driver = useOakDriver<unknown, Msg>()
  return useCallback(
    (msg: Msg) => {
      driver.dispatch(msg)
    },
    [driver],
  )
}
