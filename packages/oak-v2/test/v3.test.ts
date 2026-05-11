import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Effect, Stream } from 'effect'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  makeOakKernel,
  runOakEffect,
  runOakEffectScoped,
  useDispatch,
  useSelector,
  type EffectCommand,
  type EffectSubscription,
  type MsgHandler,
  type ProducedEffect,
} from '../src/v3/index.js'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function eventually(assertion: () => void, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await delay(5)
    }
  }

  if (lastError) {
    throw lastError
  }
  assertion()
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  cleanup()
})

describe('v3 generic kernel', () => {
  it('updates state synchronously and emits generic effect instructions', () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Increment' }
    type Fx = { readonly _tag: 'Log'; readonly text: string }

    const handle: MsgHandler<Model, Msg, Fx> = () => ({
      mutation: (model) => ({ count: model.count + 1 }),
      effects: [{ _tag: 'Log', text: 'incremented' }],
    })
    const oak = makeOakKernel({ name: 'V3GenericKernel', init: { count: 0 }, handle })
    const produced: Array<ProducedEffect<Model, Msg, Fx>> = []
    const events: Array<Model> = []
    oak.effects.subscribe((effect) => {
      produced.push(effect)
    })
    oak.events.subscribe((event) => {
      events.push(event.model)
    })

    oak.dispatch({ _tag: 'Increment' })

    expect(oak.state.value).toEqual({ count: 1 })
    expect(events).toEqual([{ count: 1 }])
    expect(produced).toEqual([
      {
        message: { _tag: 'Increment' },
        model: { count: 1 },
        effect: { _tag: 'Log', text: 'incremented' },
      },
    ])
  })

  it('runs Effect commands through the Effect harness', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Follow' }
    type Command = EffectCommand<Model, Msg, never>

    let commandModel = -1
    const follow: Command = (_message, model) =>
      Effect.sync(() => {
        commandModel = model.count
        return { _tag: 'Follow' } as const
      })
    const handle: MsgHandler<Model, Msg, Command> = (message) => {
      switch (message._tag) {
        case 'Start':
          return {
            mutation: (model) => ({ count: model.count + 1 }),
            effects: [follow],
          }
        case 'Follow':
          return {
            mutation: (model) => ({ count: model.count + 10 }),
          }
      }
    }
    const oak = makeOakKernel({ name: 'V3EffectCommands', init: { count: 0 }, handle })
    const running = runOakEffect(oak)

    try {
      oak.dispatch({ _tag: 'Start' })

      expect(oak.state.value).toEqual({ count: 1 })
      await eventually(() => {
        expect(oak.state.value).toEqual({ count: 11 })
      })
      expect(commandModel).toBe(1)
    } finally {
      await running.dispose()
    }
  })

  it('runs Effect subscriptions as a harness concern', async () => {
    type Model = { readonly interval: number; readonly ticks: number }
    type Msg =
      | { readonly _tag: 'SetInterval'; readonly interval: number }
      | { readonly _tag: 'Tick' }
    type Command = EffectCommand<Model, Msg, never>

    const runIntervals: Array<number> = []
    const subscription: EffectSubscription<Model, Msg, never, number> = {
      select: (model) => model.interval,
      run: (interval) => {
        runIntervals.push(interval)
        return Stream.succeed({ _tag: 'Tick' } as const)
      },
    }
    const handle: MsgHandler<Model, Msg, Command> = (message) => {
      switch (message._tag) {
        case 'SetInterval':
          return {
            mutation: (model) => ({ ...model, interval: message.interval }),
          }
        case 'Tick':
          return {
            mutation: (model) => ({ ...model, ticks: model.ticks + 1 }),
          }
      }
    }
    const oak = makeOakKernel({
      name: 'V3EffectSubscriptions',
      init: { interval: 100, ticks: 0 },
      handle,
    })
    const running = runOakEffect(oak, { subscriptions: [subscription] })

    try {
      await eventually(() => {
        expect(oak.state.value).toEqual({ interval: 100, ticks: 1 })
      })
      expect(runIntervals).toEqual([100])
      await flushMicrotasks()
      expect(runIntervals).toEqual([100])

      oak.dispatch({ _tag: 'SetInterval', interval: 250 })

      await eventually(() => {
        expect(oak.state.value).toEqual({ interval: 250, ticks: 2 })
        expect(runIntervals).toEqual([100, 250])
      })
    } finally {
      await running.dispose()
    }
  })

  it('interrupts Effect harness fibers when disposed', async () => {
    type Model = { readonly started: boolean }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Never' }
    type Command = EffectCommand<Model, Msg, never>

    let commandStarted = false
    let commandFinalized = false
    const neverCommand: Command = () =>
      Effect.sync(() => {
        commandStarted = true
      }).pipe(
        Effect.zipRight(Effect.never),
        Effect.ensuring(
          Effect.sync(() => {
            commandFinalized = true
          }),
        ),
      )
    const handle: MsgHandler<Model, Msg, Command> = (message) => {
      switch (message._tag) {
        case 'Start':
          return {
            mutation: (model) => ({ ...model, started: true }),
            effects: [neverCommand],
          }
        case 'Never':
          return {
            mutation: (model) => model,
          }
      }
    }
    const oak = makeOakKernel({ name: 'V3EffectDispose', init: { started: false }, handle })
    const running = runOakEffect(oak)

    oak.dispatch({ _tag: 'Start' })

    await eventually(() => {
      expect(commandStarted).toBe(true)
    })
    await running.dispose()
    await eventually(() => {
      expect(commandFinalized).toBe(true)
    })
  })

  it('can attach the Effect harness inside an existing Effect scope', async () => {
    type Model = { readonly started: boolean }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Never' }
    type Command = EffectCommand<Model, Msg, never>

    let commandStarted = false
    let commandFinalized = false
    const neverCommand: Command = () =>
      Effect.sync(() => {
        commandStarted = true
      }).pipe(
        Effect.zipRight(Effect.never),
        Effect.ensuring(
          Effect.sync(() => {
            commandFinalized = true
          }),
        ),
      )
    const handle: MsgHandler<Model, Msg, Command> = (message) => {
      switch (message._tag) {
        case 'Start':
          return {
            mutation: (model) => ({ ...model, started: true }),
            effects: [neverCommand],
          }
        case 'Never':
          return {
            mutation: (model) => model,
          }
      }
    }
    const oak = makeOakKernel({ name: 'V3EffectScoped', init: { started: false }, handle })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* runOakEffectScoped(oak)
          oak.dispatch({ _tag: 'Start' })
          yield* Effect.promise(() =>
            eventually(() => {
              expect(commandStarted).toBe(true)
            }),
          )
        }),
      ),
    )

    await eventually(() => {
      expect(commandFinalized).toBe(true)
    })
  })

  it('integrates with React without a ManagedRuntime or tag lookup', () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Increment' }

    const handle: MsgHandler<Model, Msg> = () => ({
      mutation: (model) => ({ count: model.count + 1 }),
    })
    const oak = makeOakKernel({ name: 'V3ReactCounter', init: { count: 0 }, handle })

    function Counter() {
      const count = useSelector(oak, (model) => model.count)
      const dispatch = useDispatch(oak)

      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => dispatch({ _tag: 'Increment' }),
        },
        String(count),
      )
    }

    render(createElement(Counter))

    expect(screen.getByRole('button').textContent).toBe('0')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('1')
  })
})
