import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context, Effect, Layer, ManagedRuntime } from 'effect'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeOakEffectProgram, type EffectCommand } from '../src/platform-effect/index.js'
import { OakEffectViewProvider } from '../src/platform-effect/react.js'
import { makeOakPromiseProgram } from '../src/platform-promise/index.js'
import { OakProvider, useOakDispatch, useOakSelector } from '../src/react/index.js'

afterEach(() => {
  cleanup()
})

type CounterModel = { readonly count: number }
type CounterMsg = { readonly _tag: 'Increment' }
type ServiceModel = { readonly value: number; readonly pending: boolean }
type ServiceMsg = { readonly _tag: 'Load' } | { readonly _tag: 'Loaded'; readonly value: number }

interface NumberService {
  readonly next: Effect.Effect<number>
}

const NumberService = Context.GenericTag<NumberService>('ReactEffectNumberService')

function CounterButton() {
  const count = useOakSelector<CounterModel, number>((m) => m.count)
  const dispatch = useOakDispatch<CounterMsg>()
  return createElement(
    'button',
    {
      type: 'button',
      onClick: () => dispatch({ _tag: 'Increment' }),
    },
    String(count),
  )
}

function ServiceButton() {
  const pending = useOakSelector<ServiceModel, boolean>((m) => m.pending)
  const value = useOakSelector<ServiceModel, number>((m) => m.value)
  const dispatch = useOakDispatch<ServiceMsg>()
  return createElement(
    'button',
    {
      type: 'button',
      disabled: pending,
      onClick: () => dispatch({ _tag: 'Load' }),
    },
    pending ? 'loading' : String(value),
  )
}

describe('react', () => {
  it('renders state and dispatches through an Effect-platform view driver', async () => {
    const program = makeOakEffectProgram<CounterModel, CounterMsg>({
      tagKey: 'ReactEffectRuntime',
      init: { count: 0 },
      update: () => ({ mutation: (m) => ({ count: m.count + 1 }), effects: [] }),
    })

    const runtime = ManagedRuntime.make(program.layer)
    try {
      const service = await runtime.runPromise(Effect.flatMap(program.tag, Effect.succeed))
      const driver = program.view(service)

      render(createElement(OakProvider, { driver }, createElement(CounterButton)))

      expect(screen.getByRole('button').textContent).toBe('0')
      fireEvent.click(screen.getByRole('button'))
      expect(screen.getByRole('button').textContent).toBe('1')
    } finally {
      await runtime.dispose()
    }
  })

  it('paints the init model synchronously on render 1 (no waitFor, no findBy)', () => {
    type SyncModel = { readonly count: number }
    type SyncMsg = { readonly _tag: 'Inc' }

    const program = makeOakEffectProgram<SyncModel, SyncMsg>({
      tagKey: 'SyncFirstPaint',
      init: { count: 7 },
      update: () => ({ mutation: (m) => ({ count: m.count + 1 }), effects: [] }),
    })

    function ReadCount() {
      const count = useOakSelector<SyncModel, number>((m) => m.count)
      return createElement('output', null, String(count))
    }

    const runtime = ManagedRuntime.make(program.layer)
    try {
      const { container } = render(
        createElement(
          OakEffectViewProvider,
          { runtime, program },
          createElement(ReadCount),
        ),
      )

      expect(container.textContent).toBe('7')
    } finally {
      void runtime.dispose()
    }
  })

  it('renders the init model on first paint via a runtime-prop OakEffectViewProvider', async () => {
    const loadNumber: EffectCommand<ServiceModel, ServiceMsg, NumberService> = () =>
      Effect.gen(function* () {
        const service = yield* NumberService
        const value = yield* service.next
        return { _tag: 'Loaded' as const, value }
      })

    const program = makeOakEffectProgram<ServiceModel, ServiceMsg, NumberService>({
      tagKey: 'ReactEffectViewProvider',
      init: { value: 0, pending: false },
      update: (msg) => {
        switch (msg._tag) {
          case 'Load':
            return {
              mutation: (model) => ({ ...model, pending: true }),
              effects: [loadNumber],
            }
          case 'Loaded':
            return {
              mutation: () => ({ value: msg.value, pending: false }),
              effects: [],
            }
        }
      },
    })
    const numberLayer: Layer.Layer<NumberService> = Layer.succeed(
      NumberService,
      NumberService.of({ next: Effect.succeed(42) }),
    )
    const appLayer = program.layer.pipe(Layer.provideMerge(numberLayer))

    const runtime = ManagedRuntime.make(appLayer)
    try {
      render(
        createElement(
          OakEffectViewProvider,
          { runtime, program },
          createElement(ServiceButton),
        ),
      )

      const button = screen.getByRole('button')
      expect(button.textContent).toBe('0')
      fireEvent.click(button)

      await waitFor(() => {
        expect(button.textContent).toBe('42')
      })
    } finally {
      await runtime.dispose()
    }
  })

  it('renders state and dispatches through a Promise-platform view driver', () => {
    const program = makeOakPromiseProgram<CounterModel, CounterMsg>({
      init: { count: 0 },
      update: () => ({ mutation: (m) => ({ count: m.count + 1 }), effects: [] }),
    })

    const instance = program.start()
    try {
      const driver = program.view(instance)

      render(createElement(OakProvider, { driver }, createElement(CounterButton)))

      expect(screen.getByRole('button').textContent).toBe('0')
      fireEvent.click(screen.getByRole('button'))
      expect(screen.getByRole('button').textContent).toBe('1')
      fireEvent.click(screen.getByRole('button'))
      expect(screen.getByRole('button').textContent).toBe('2')
    } finally {
      instance.dispose()
    }
  })

  it('throws when used outside an OakProvider', () => {
    const consoleError = console.error
    console.error = () => {}
    try {
      expect(() => render(createElement(CounterButton))).toThrow(/OakProvider/)
    } finally {
      console.error = consoleError
    }
  })
})
