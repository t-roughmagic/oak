import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { Layer, ManagedRuntime } from 'effect'
import { StrictMode, createElement, useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntimeBinding, useScopedRuntime } from '../src/index.js'

const stableLayer = Layer.empty

type Runtime = ManagedRuntime.ManagedRuntime<never, never>
type RuntimeWithWritableDispose = Omit<Runtime, 'dispose'> & {
  dispose: () => Promise<void>
}

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

function ScopedProbe({
  layer,
  onRuntime,
}: {
  readonly layer: Layer.Layer<never, never, never>
  readonly onRuntime: (runtime: Runtime) => void
}) {
  const runtime = useScopedRuntime(layer)
  useEffect(() => {
    onRuntime(runtime)
  }, [onRuntime, runtime])
  return createElement('output', null, 'ready')
}

afterEach(async () => {
  cleanup()
  await flushMicrotasks()
})

describe('createRuntimeBinding', () => {
  it('useRuntime throws when no Provider wraps the consumer', () => {
    const runtime = ManagedRuntime.make(stableLayer)
    try {
      const { useRuntime } = createRuntimeBinding(runtime, { name: 'Test runtime' })

      function Probe() {
        useRuntime()
        return null
      }

      const consoleError = console.error
      console.error = () => {}
      try {
        expect(() => render(createElement(Probe))).toThrow(/Test runtime: Provider is missing/)
      } finally {
        console.error = consoleError
      }
    } finally {
      void runtime.dispose()
    }
  })

  it('Provider supplies the bound runtime to children on first render', () => {
    const runtime = ManagedRuntime.make(stableLayer)
    try {
      const { Provider, useRuntime } = createRuntimeBinding(runtime)

      let observed: ManagedRuntime.ManagedRuntime<never, never> | null = null

      function Probe() {
        observed = useRuntime()
        return createElement('output', { 'data-testid': 'probe' }, 'ready')
      }

      render(createElement(Provider, null, createElement(Probe)))

      expect(screen.getByTestId('probe').textContent).toBe('ready')
      expect(observed).toBe(runtime)
    } finally {
      void runtime.dispose()
    }
  })

  it('separate bindings have independent contexts', () => {
    const runtimeA = ManagedRuntime.make(stableLayer)
    const runtimeB = ManagedRuntime.make(stableLayer)
    try {
      const bindingA = createRuntimeBinding(runtimeA, { name: 'A' })
      const bindingB = createRuntimeBinding(runtimeB, { name: 'B' })

      let seenA: ManagedRuntime.ManagedRuntime<never, never> | null = null
      let seenB: ManagedRuntime.ManagedRuntime<never, never> | null = null

      function ProbeA() {
        seenA = bindingA.useRuntime()
        return null
      }
      function ProbeB() {
        seenB = bindingB.useRuntime()
        return null
      }

      render(
        createElement(
          bindingA.Provider,
          null,
          createElement(bindingB.Provider, null, createElement(ProbeA), createElement(ProbeB)),
        ),
      )

      expect(seenA).toBe(runtimeA)
      expect(seenB).toBe(runtimeB)
    } finally {
      void runtimeA.dispose()
      void runtimeB.dispose()
    }
  })
})

describe('useScopedRuntime', () => {
  it('returns the same runtime across renders', async () => {
    const observed: Array<Runtime> = []
    const { rerender } = render(
      createElement(ScopedProbe, {
        layer: stableLayer,
        onRuntime: (r) => observed.push(r),
      }),
    )
    await waitFor(() => {
      expect(observed.length).toBeGreaterThan(0)
    })
    const first = observed[0]

    rerender(
      createElement(ScopedProbe, {
        layer: stableLayer,
        onRuntime: (r) => observed.push(r),
      }),
    )
    rerender(
      createElement(ScopedProbe, {
        layer: stableLayer,
        onRuntime: (r) => observed.push(r),
      }),
    )

    for (const r of observed) {
      expect(r).toBe(first)
    }
  })

  it('disposes the runtime after final unmount', async () => {
    let disposeCalls = 0
    let observedOnce = false
    const patched = new WeakSet<object>()
    const onRuntime = (runtime: Runtime) => {
      observedOnce = true
      if (!patched.has(runtime)) {
        patched.add(runtime)
        observeDispose(runtime, () => {
          disposeCalls++
        })
      }
    }

    const { unmount } = render(
      createElement(ScopedProbe, { layer: stableLayer, onRuntime }),
    )

    await waitFor(() => {
      expect(observedOnce).toBe(true)
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
    let observedOnce = false
    const patched = new WeakSet<object>()
    const onRuntime = (runtime: Runtime) => {
      observedOnce = true
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
        createElement(ScopedProbe, { layer: stableLayer, onRuntime }),
      ),
    )

    await waitFor(() => {
      expect(observedOnce).toBe(true)
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
})
