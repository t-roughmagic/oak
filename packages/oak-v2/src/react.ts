import { Effect, Equal, ManagedRuntime } from 'effect'
import type { Context, Layer } from 'effect'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { OakService } from './types.js'

export const OakRuntimeContext = createContext<ManagedRuntime.ManagedRuntime<never, never> | null>(
  null,
)

export function useOakRuntime<R = never>(): ManagedRuntime.ManagedRuntime<R, never> {
  const runtime = useContext(OakRuntimeContext)
  if (!runtime) {
    throw new Error('useOakRuntime: OakRuntimeContext.Provider is missing')
  }
  return runtime as ManagedRuntime.ManagedRuntime<R, never>
}

export function useManagedRuntime<R>(
  layer: Layer.Layer<R, never, never>,
): ManagedRuntime.ManagedRuntime<R, never> {
  const initialLayerRef = useRef(layer)
  const warnedLayerChangeRef = useRef(false)
  const disposeGenerationRef = useRef(0)
  const [runtime] = useState(() => ManagedRuntime.make(layer))

  if (initialLayerRef.current !== layer && !warnedLayerChangeRef.current) {
    warnedLayerChangeRef.current = true
    console.warn(
      'useManagedRuntime: layer identity changed after mount. The existing Oak runtime will keep using the initial layer; remount the provider with a key to create a fresh runtime.',
    )
  }

  useEffect(() => {
    const generation = ++disposeGenerationRef.current

    return () => {
      void Promise.resolve().then(() => {
        if (disposeGenerationRef.current === generation) {
          void runtime.dispose()
        }
      })
    }
  }, [runtime])

  return runtime
}

function useOakService<I, M, Msg>(tag: Context.Tag<I, OakService<M, Msg>>): OakService<M, Msg> {
  const runtime = useOakRuntime<I>()
  return useMemo(() => runtime.runSync(Effect.flatMap(tag, Effect.succeed)), [runtime, tag])
}

export function useSelector<I, M, Msg, A>(
  tag: Context.Tag<I, OakService<M, Msg>>,
  selector: (model: M) => A,
  eq: (a: A, b: A) => boolean = Equal.equals,
): A {
  const service = useOakService(tag)
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const { subscribe, getSnapshot } = useMemo(() => {
    let currentSelected = selectorRef.current(service.state.value)

    const syncSelected = (onStoreChange?: () => void) => {
      const nextSelected = selectorRef.current(service.state.value)
      if (!eqRef.current(currentSelected, nextSelected)) {
        currentSelected = nextSelected
        onStoreChange?.()
      }
    }

    return {
      subscribe: (onStoreChange: () => void) => {
        const unsubscribe = service.state.subscribe(() => {
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
  }, [service])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useDispatch<I, M, Msg>(
  tag: Context.Tag<I, OakService<M, Msg>>,
): (message: Msg) => void {
  const service = useOakService(tag)
  return useCallback(
    (message: Msg) => {
      service.dispatch(message)
    },
    [service],
  )
}
