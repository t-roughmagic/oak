import { Effect, Equal, SubscriptionRef } from 'effect'
import type { Context, Layer, ManagedRuntime } from 'effect'
import {
  EffectRuntimeContext,
  useManagedRuntime as useEffectManagedRuntime,
} from '@oak/react-effect-provider'
import { useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react'
import type { OakService } from '@oak/oak'
import { makeEffectSyncStore, type SyncEffectRunner, type SyncStore } from './sync-store.js'

// React components do two things with Oak: read state and dispatch messages.
// Selector consumers for the same runtime/tag share one sync store so they do
// not each open their own Effect stream subscription.
const stateStoreCache = new WeakMap<object, WeakMap<object, SyncStore<unknown>>>()

function makeOakStateStore<I, M, Msg>(
  runner: SyncEffectRunner<I>,
  tag: Context.Tag<I, OakService<M, Msg>>,
): SyncStore<M> {
  return makeEffectSyncStore(runner, {
    read: Effect.flatMap(tag, (svc) => SubscriptionRef.get(svc.state)),
    changes: Effect.map(tag, (svc) => svc.state.changes),
  })
}

function getOakStateStore<I, M, Msg>(
  runner: SyncEffectRunner<I> & object,
  tag: Context.Tag<I, OakService<M, Msg>>,
): SyncStore<M> {
  let stores = stateStoreCache.get(runner)

  if (!stores) {
    stores = new WeakMap<object, SyncStore<unknown>>()
    stateStoreCache.set(runner, stores)
  }

  const existing = stores.get(tag)
  if (existing) {
    return existing as SyncStore<M>
  }

  const created = makeOakStateStore(runner, tag)
  stores.set(tag, created as SyncStore<unknown>)
  return created
}

// ============================================================================
// Runtime Context
// ============================================================================

/**
 * React context carrying the Oak runtime for an interactive subtree.
 *
 * The context currently stores a ManagedRuntime because the provider owns the
 * layer lifecycle. The selector/dispatch hooks below only rely on the runtime
 * operations needed to read state and fork dispatch work.
 */
export const OakRuntimeContext = EffectRuntimeContext

/**
 * Reads the Oak runtime from React context.
 *
 * Most applications should use `useSelector` and `useDispatch` instead of this
 * directly; it is exported for advanced integration code.
 */
export function useOakRuntime<R = never>(): ManagedRuntime.ManagedRuntime<R, never> {
  const runtime = useContext(OakRuntimeContext)
  if (!runtime) {
    throw new Error('useOakRuntime: OakRuntimeContext.Provider is missing')
  }
  return runtime as unknown as ManagedRuntime.ManagedRuntime<R, never>
}

// ============================================================================
// useManagedRuntime
// ============================================================================

/**
 * Creates and disposes a ManagedRuntime for a React subtree.
 *
 * This hook returns the runtime during the first client render so selector
 * children can subscribe immediately instead of waiting for an effect pass.
 * The runtime is created from the initial `layer` only. If a route/session
 * change needs a fresh Oak instance, remount the provider with a React `key`.
 *
 * Cleanup is deferred by one microtask. React development StrictMode may replay
 * effect setup/cleanup for the same mounted tree, and immediate disposal would
 * leave selector children holding a runtime that React still considers mounted.
 */
export function useManagedRuntime<R>(
  layer: Layer.Layer<R, never, never>,
): ManagedRuntime.ManagedRuntime<R, never> {
  return useEffectManagedRuntime(layer, { runtimeName: 'Oak runtime' })
}

// ============================================================================
// useSelector
// ============================================================================

/**
 * Selects a synchronous value from an Oak program's model.
 *
 * React requires `getSnapshot` to be synchronous. Oak state is read from an
 * Effect `SubscriptionRef`, while updates are observed from its change stream.
 * The internal sync store bridges that mismatch and this hook only handles
 * selector memoization plus equality filtering.
 *
 * The default equality guard is Effect `Equal.equals`, which rewards selectors
 * that return Effect data types with value equality. Selectors returning plain
 * JavaScript aggregate objects should pass a custom `eq` when reference
 * equality is too strict.
 */
export function useSelector<I, M, Msg, A>(
  tag: Context.Tag<I, OakService<M, Msg>>,
  selector: (model: M) => A,
  eq: (a: A, b: A) => boolean = Equal.equals,
): A {
  const runtime = useOakRuntime<I>()
  const store = useMemo(() => getOakStateStore(runtime, tag), [runtime, tag])
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const { subscribe, getSnapshot } = useMemo(() => {
    let currentSelected = selectorRef.current(store.getSnapshot())

    return {
      subscribe: (onStoreChange: () => void) => {
        const syncSelected = () => {
          const nextSelected = selectorRef.current(store.getSnapshot())
          if (!eqRef.current(currentSelected, nextSelected)) {
            currentSelected = nextSelected
            onStoreChange()
          }
        }

        const unsubscribe = store.subscribe(syncSelected)
        syncSelected()
        return unsubscribe
      },
      getSnapshot: () => {
        const nextSelected = selectorRef.current(store.getSnapshot())
        if (!eqRef.current(currentSelected, nextSelected)) {
          currentSelected = nextSelected
        }
        return currentSelected
      },
    }
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ============================================================================
// useDispatch
// ============================================================================

/**
 * Returns a React callback that enqueues Oak messages.
 *
 * Dispatch is forked instead of run synchronously so this hook remains valid if
 * Oak dispatch ever crosses an async boundary, for example through middleware,
 * tracing, or a bounded queue.
 */
export function useDispatch<I, M, Msg>(
  tag: Context.Tag<I, OakService<M, Msg>>,
): (message: Msg) => void {
  const runtime = useOakRuntime<I>()

  return useCallback(
    (message: Msg) => {
      runtime.runFork(Effect.flatMap(tag, (svc) => svc.dispatch(message)))
    },
    [runtime, tag],
  )
}
