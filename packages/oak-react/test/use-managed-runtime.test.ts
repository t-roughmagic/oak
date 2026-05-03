import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { Context, Layer, ManagedRuntime } from 'effect'
import { StrictMode, createElement, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useManagedRuntime } from '../src/index.js'

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
  const runtime = useManagedRuntime(stableLayer)
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

afterEach(async () => {
  cleanup()
  await flushMicrotasks()
  vi.restoreAllMocks()
})

describe('useManagedRuntime', () => {
  it('returns a runtime during the first client render', () => {
    render(createElement(RuntimeStatus))

    expect(screen.getByTestId('runtime-status').textContent).toBe('ready')
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
    const tag = Context.GenericTag<{ readonly value: number }>('LayerIdentityWarning')
    const firstLayer = Layer.succeed(tag, { value: 1 })
    const nextLayer = Layer.succeed(tag, { value: 2 })
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
      'useManagedRuntime: layer identity changed after mount. The existing Oak runtime will keep using the initial layer; remount the provider with a key to create a fresh runtime.',
    )
  })
})
