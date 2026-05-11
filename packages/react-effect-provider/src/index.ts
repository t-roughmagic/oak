'use client'

import { ManagedRuntime } from 'effect'
import type { Effect, Fiber, Layer, Runtime } from 'effect'
import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

export type EffectManagedRuntime<R = never, E = never> = ManagedRuntime.ManagedRuntime<R, E>

export interface UseManagedRuntimeOptions {
  readonly runtimeName?: string | undefined
}

export interface ManagedRuntimeProviderProps<R, E> {
  readonly runtime: ManagedRuntime.ManagedRuntime<R, E>
  readonly children?: ReactNode
}

export interface EffectRuntimeProviderProps<R, E> extends UseManagedRuntimeOptions {
  readonly layer: Layer.Layer<R, E, never>
  readonly children?: ReactNode
}

export interface ClientEffectRuntimeProviderProps<R, E> extends EffectRuntimeProviderProps<R, E> {
  readonly fallback?: ReactNode
}

export const EffectRuntimeContext = createContext<ManagedRuntime.ManagedRuntime<
  never,
  never
> | null>(null)

export function useEffectRuntime<R = never, E = never>(): ManagedRuntime.ManagedRuntime<R, E> {
  const runtime = useContext(EffectRuntimeContext)
  if (!runtime) {
    throw new Error('useEffectRuntime: EffectRuntimeContext.Provider is missing')
  }
  return runtime as unknown as ManagedRuntime.ManagedRuntime<R, E>
}

/**
 * Creates and disposes one Effect ManagedRuntime for a React subtree.
 *
 * The runtime is created during the first render so child hooks can access it
 * immediately. The initial layer is intentionally sticky; remount the provider
 * with a React `key` when a route/session change needs a fresh runtime.
 *
 * Cleanup is deferred by one microtask. React development StrictMode may replay
 * effect setup/cleanup for the same mounted tree, and immediate disposal would
 * leave children holding a runtime React still considers mounted.
 */
export function useManagedRuntime<R, E = never>(
  layer: Layer.Layer<R, E, never>,
  options?: UseManagedRuntimeOptions,
): ManagedRuntime.ManagedRuntime<R, E> {
  const initialLayerRef = useRef(layer)
  const warnedLayerChangeRef = useRef(false)
  const disposeGenerationRef = useRef(0)
  const [runtime] = useState(() => ManagedRuntime.make(layer))

  if (initialLayerRef.current !== layer && !warnedLayerChangeRef.current) {
    warnedLayerChangeRef.current = true
    const runtimeName = options?.runtimeName ?? 'Effect runtime'
    console.warn(
      `useManagedRuntime: layer identity changed after mount. The existing ${runtimeName} will keep using the initial layer; remount the provider with a key to create a fresh runtime.`,
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

export function ManagedRuntimeProvider<R, E>({
  runtime,
  children,
}: ManagedRuntimeProviderProps<R, E>) {
  return createElement(
    EffectRuntimeContext.Provider,
    { value: runtime as unknown as ManagedRuntime.ManagedRuntime<never, never> },
    children,
  )
}

export function EffectRuntimeProvider<R, E = never>({
  layer,
  runtimeName,
  children,
}: EffectRuntimeProviderProps<R, E>) {
  const runtime = useManagedRuntime(layer, { runtimeName })
  return createElement(ManagedRuntimeProvider<R, E>, { runtime }, children)
}

export function ClientEffectRuntimeProvider<R, E = never>({
  fallback = null,
  ...props
}: ClientEffectRuntimeProviderProps<R, E>) {
  const mounted = useClientMounted()
  if (!mounted) {
    return createElement(Fragment, null, fallback)
  }
  return createElement(EffectRuntimeProvider<R, E>, props)
}

export function useRunPromise<R = never, ER = never>(): <A, E>(
  effect: Effect.Effect<A, E, R>,
  options?: Parameters<ManagedRuntime.ManagedRuntime<R, ER>['runPromise']>[1],
) => Promise<A> {
  const runtime = useEffectRuntime<R, ER>()
  return useCallback(
    <A, E>(
      effect: Effect.Effect<A, E, R>,
      options?: Parameters<ManagedRuntime.ManagedRuntime<R, ER>['runPromise']>[1],
    ) => runtime.runPromise(effect, options),
    [runtime],
  )
}

export function useRunFork<R = never, ER = never>(): <A, E>(
  effect: Effect.Effect<A, E, R>,
  options?: Runtime.RunForkOptions,
) => Fiber.RuntimeFiber<A, E | ER> {
  const runtime = useEffectRuntime<R, ER>()
  return useCallback(
    <A, E>(effect: Effect.Effect<A, E, R>, options?: Runtime.RunForkOptions) =>
      runtime.runFork(effect, options),
    [runtime],
  )
}

function useClientMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return mounted
}
