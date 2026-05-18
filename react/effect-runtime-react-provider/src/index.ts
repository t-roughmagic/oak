'use client'

import { ManagedRuntime, type Layer } from 'effect'
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface RuntimeBinding<R, E = never> {
  readonly Provider: (props: { readonly children?: ReactNode }) => ReactNode
  readonly useRuntime: () => ManagedRuntime.ManagedRuntime<R, E>
}

export interface CreateRuntimeBindingOptions {
  readonly name?: string
}

/**
 * Wraps an already-instantiated `ManagedRuntime` in a typed React Provider +
 * hook pair. The runtime is created and disposed outside React; this factory
 * only carries it through context.
 *
 * Construct the runtime at module load (`const runtime = ManagedRuntime.make(layer)`)
 * and pass it here. Each `createRuntimeBinding` call captures `R`/`E` once so
 * `useRuntime()` returns a fully-typed runtime with no generics at the call.
 */
export function createRuntimeBinding<R, E = never>(
  runtime: ManagedRuntime.ManagedRuntime<R, E>,
  options?: CreateRuntimeBindingOptions,
): RuntimeBinding<R, E> {
  const name = options?.name ?? 'Effect runtime'
  const Context = createContext<ManagedRuntime.ManagedRuntime<R, E> | null>(null)

  const Provider = ({ children }: { readonly children?: ReactNode }) =>
    createElement(Context.Provider, { value: runtime }, children)

  const useRuntime = (): ManagedRuntime.ManagedRuntime<R, E> => {
    const current = useContext(Context)
    if (!current) throw new Error(`${name}: Provider is missing`)
    return current
  }

  return { Provider, useRuntime }
}

/**
 * Lifecycle-managed runtime for apps whose layer depends on per-mount data
 * (route seed, per-user composition). Creates the runtime during the first
 * render, disposes it on real unmount, and survives React StrictMode's
 * simulated unmount/remount via deferred cleanup + a generation counter.
 *
 * The layer is captured on first render; subsequent renders that pass a
 * different layer keep using the original. Remount with a React `key` to
 * get a fresh runtime.
 *
 * Prefer `createRuntimeBinding` with a module-scope runtime when the layer
 * does not depend on per-mount data — no lifecycle, no leak, no ceremony.
 */
export function useScopedRuntime<R, E = never>(
  layer: Layer.Layer<R, E, never>,
): ManagedRuntime.ManagedRuntime<R, E> {
  const disposeGenerationRef = useRef(0)
  const [runtime] = useState(() => ManagedRuntime.make(layer))

  useEffect(() => {
    const generation = ++disposeGenerationRef.current
    return () => {
      // Defer one microtask. StrictMode fires cleanup synchronously between
      // two setup invocations; the deferred generation check skips dispose
      // if another setup followed (StrictMode replay) and runs dispose if
      // no setup followed (real unmount).
      void Promise.resolve().then(() => {
        if (disposeGenerationRef.current === generation) {
          void runtime.dispose()
        }
      })
    }
  }, [runtime])

  return runtime
}
