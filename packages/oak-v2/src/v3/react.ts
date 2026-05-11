import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import type { OakKernel } from './kernel.js'

/** Selects from a generic Oak kernel using React's synchronous external store API. */
export function useSelector<M, Msg, Fx, A>(
  oak: OakKernel<M, Msg, Fx>,
  selector: (model: M) => A,
  eq: (prev: A, curr: A) => boolean = Object.is,
): A {
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const { subscribe, getSnapshot } = useMemo(() => {
    let currentSelected = selectorRef.current(oak.state.value)

    const syncSelected = (onStoreChange?: () => void) => {
      const nextSelected = selectorRef.current(oak.state.value)
      if (!eqRef.current(currentSelected, nextSelected)) {
        currentSelected = nextSelected
        onStoreChange?.()
      }
    }

    return {
      subscribe: (onStoreChange: () => void) => {
        const unsubscribe = oak.state.subscribe(() => {
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
  }, [oak])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Returns the kernel's synchronous dispatch as a stable React callback. */
export function useDispatch<M, Msg, Fx>(oak: OakKernel<M, Msg, Fx>): (message: Msg) => void {
  return useCallback(
    (message: Msg) => {
      oak.dispatch(message)
    },
    [oak],
  )
}
