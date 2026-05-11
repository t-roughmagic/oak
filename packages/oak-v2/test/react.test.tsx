import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Effect, ManagedRuntime } from 'effect'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeOakEffectProgram } from '../src/runtime-effect/index.js'
import { makeOakPromiseProgram } from '../src/runtime-promise/index.js'
import { OakProvider, useOakDispatch, useOakSelector } from '../src/react/index.js'

afterEach(() => {
  cleanup()
})

type CounterModel = { readonly count: number }
type CounterMsg = { readonly _tag: 'Increment' }

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

describe('react', () => {
  it('renders state and dispatches through an Effect-platform view driver', async () => {
    const program = makeOakEffectProgram<CounterModel, CounterMsg>({
      name: 'ReactEffectRuntime',
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

  it('renders state and dispatches through a Promise-platform view driver', () => {
    const program = makeOakPromiseProgram<CounterModel, CounterMsg>({
      name: 'ReactPromiseRuntime',
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
