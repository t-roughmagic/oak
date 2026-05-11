import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { StrictMode, createElement, useEffect } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ClientEffectRuntimeProvider,
  EffectRuntimeProvider,
  ManagedRuntimeProvider,
  useEffectRuntime,
  useManagedRuntime,
  useRunPromise,
} from '../src/index.js'

type Runtime = ManagedRuntime.ManagedRuntime<never, never>
type RuntimeWithWritableDispose = Omit<Runtime, 'dispose'> & {
  dispose: () => Promise<void>
}

const stableLayer = Layer.empty

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

function observeDispose(runtime: Runtime, onDispose: () => void): void {
  const writable = runtime as RuntimeWithWritableDispose
  const originalDispose = writable.dispose.bind(runtime)

  writable.dispose = () => {
    onDispose()
    return originalDispose()
  }
}

function RuntimeStatus() {
  const runtime = useEffectRuntime()
  const status = runtime === null ? 'missing' : 'ready'

  return createElement('output', { 'data-testid': 'runtime-status' }, status)
}

function RuntimeProbe({
  layer,
  onRuntime,
}: {
  readonly layer: Layer.Layer<never, never, never>
  readonly onRuntime: (runtime: Runtime) => void
}) {
  const runtime = useManagedRuntime(layer)

  useEffect(() => {
    onRuntime(runtime)
  }, [onRuntime, runtime])

  return createElement('output', { 'data-testid': 'runtime-status' }, 'ready')
}

function RunPromiseProbe({ onValue }: { readonly onValue: (value: number) => void }) {
  const runPromise = useRunPromise()

  useEffect(() => {
    void runPromise(Effect.succeed(42)).then(onValue)
  }, [onValue, runPromise])

  return createElement('output', { 'data-testid': 'runtime-status' }, 'ready')
}

afterEach(async () => {
  cleanup()
  await flushMicrotasks()
  vi.restoreAllMocks()
})

describe('react-effect-provider', () => {
  it('returns a runtime during the first client render', () => {
    render(
      createElement(EffectRuntimeProvider, { layer: stableLayer }, createElement(RuntimeStatus)),
    )

    expect(screen.getByTestId('runtime-status').textContent).toBe('ready')
  })

  it('can provide an externally-owned ManagedRuntime', () => {
    const runtime = ManagedRuntime.make(stableLayer)

    try {
      render(createElement(ManagedRuntimeProvider, { runtime }, createElement(RuntimeStatus)))

      expect(screen.getByTestId('runtime-status').textContent).toBe('ready')
    } finally {
      void runtime.dispose()
    }
  })

  it('runs effects through a stable useRunPromise callback', async () => {
    const values: Array<number> = []

    render(
      createElement(
        EffectRuntimeProvider,
        { layer: stableLayer },
        createElement(RunPromiseProbe, {
          onValue: (value) => {
            values.push(value)
          },
        }),
      ),
    )

    await waitFor(() => {
      expect(values).toEqual([42])
    })
  })

  it('disposes the runtime after final unmount', async () => {
    let disposeCalls = 0
    let observed = false
    const patched = new WeakSet<object>()
    const onRuntime = (runtime: Runtime) => {
      observed = true
      if (!patched.has(runtime)) {
        patched.add(runtime)
        observeDispose(runtime, () => {
          disposeCalls++
        })
      }
    }

    const { unmount } = render(createElement(RuntimeProbe, { layer: stableLayer, onRuntime }))

    await waitFor(() => {
      expect(observed).toBe(true)
    })
    expect(disposeCalls).toBe(0)

    await act(async () => {
      unmount()
      await flushMicrotasks()
    })

    expect(disposeCalls).toBe(1)
  })

  it('does not dispose the runtime during StrictMode effect replay', async () => {
    let disposeCalls = 0
    let observed = false
    const patched = new WeakSet<object>()
    const onRuntime = (runtime: Runtime) => {
      observed = true
      if (!patched.has(runtime)) {
        patched.add(runtime)
        observeDispose(runtime, () => {
          disposeCalls++
        })
      }
    }

    const { unmount } = render(
      createElement(
        StrictMode,
        null,
        createElement(RuntimeProbe, { layer: stableLayer, onRuntime }),
      ),
    )

    await waitFor(() => {
      expect(observed).toBe(true)
    })
    await act(async () => {
      await flushMicrotasks()
    })

    expect(disposeCalls).toBe(0)

    await act(async () => {
      unmount()
      await flushMicrotasks()
    })

    expect(disposeCalls).toBe(1)
  })

  it('warns when layer identity changes without a remount', async () => {
    const firstLayer = Layer.empty
    const nextLayer = Layer.mergeAll()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const observedRuntimes: Array<Runtime> = []
    const onRuntime = (runtime: Runtime) => {
      observedRuntimes.push(runtime)
    }

    const { rerender } = render(createElement(RuntimeProbe, { layer: firstLayer, onRuntime }))
    await waitFor(() => {
      expect(observedRuntimes).toHaveLength(1)
    })

    rerender(createElement(RuntimeProbe, { layer: nextLayer, onRuntime }))
    await act(async () => {
      await flushMicrotasks()
    })

    expect(observedRuntimes).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(
      'useManagedRuntime: layer identity changed after mount. The existing Effect runtime will keep using the initial layer; remount the provider with a key to create a fresh runtime.',
    )
  })

  it('can defer runtime creation behind a client-mounted boundary', async () => {
    const html = renderToString(
      createElement(
        ClientEffectRuntimeProvider,
        {
          layer: stableLayer,
          fallback: createElement('output', null, 'pending'),
        },
        createElement(RuntimeStatus),
      ),
    )

    expect(html).toContain('pending')

    render(
      createElement(
        ClientEffectRuntimeProvider,
        {
          layer: stableLayer,
          fallback: createElement('output', { 'data-testid': 'runtime-status' }, 'pending'),
        },
        createElement(RuntimeStatus),
      ),
    )

    await waitFor(() => {
      expect(screen.getByTestId('runtime-status').textContent).toBe('ready')
    })
  })
})
