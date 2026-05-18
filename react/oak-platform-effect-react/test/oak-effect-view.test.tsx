import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context, Effect, Layer, ManagedRuntime } from 'effect'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeOakEffectProgram, type EffectCommand } from '@oak/platform-effect'
import { useOakDispatch, useOakSelector } from '@oak/react'
import { OakEffectViewProvider } from '../src/index.js'

afterEach(() => {
  cleanup()
})

type ServiceModel = { readonly value: number; readonly pending: boolean }
type ServiceMsg = { readonly _tag: 'Load' } | { readonly _tag: 'Loaded'; readonly value: number }

interface NumberService {
  readonly next: Effect.Effect<number>
}

const NumberService = Context.GenericTag<NumberService>('ReactEffectNumberService')

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

describe('OakEffectViewProvider', () => {
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

      // No await. No findBy. No waitFor. The first DOM snapshot has init state.
      expect(container.textContent).toBe('7')
    } finally {
      void runtime.dispose()
    }
  })

  it('dispatches Effect commands and reflects the resolved message back in state', async () => {
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
})
