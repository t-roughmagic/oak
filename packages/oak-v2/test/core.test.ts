import { Effect, Fiber, ManagedRuntime, Stream } from 'effect'
import type { Context } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Cell,
  makeOak,
  type Cmd,
  type MsgHandler,
  type OakService,
  type Sub,
} from '../src/index.js'

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

function getService<I, M, Msg>(
  runtime: ManagedRuntime.ManagedRuntime<I, never>,
  tag: Context.Tag<I, OakService<M, Msg>>,
): OakService<M, Msg> {
  return runtime.runSync(Effect.flatMap(tag, Effect.succeed))
}

describe('Cell', () => {
  it('emits the current value first and then later changes', async () => {
    const cell = new Cell(1)
    const seen: Array<number> = []
    const fiber = Effect.runFork(
      cell.changes.pipe(
        Stream.take(2),
        Stream.runForEach((value) =>
          Effect.sync(() => {
            seen.push(value)
          }),
        ),
      ),
    )

    await eventually(() => {
      expect(seen).toEqual([1])
    })

    cell.set(2)
    await Effect.runPromise(Fiber.join(fiber))

    expect(seen).toEqual([1, 2])
  })
})

describe('makeOak', () => {
  it('updates state synchronously when dispatch returns', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Increment' }

    const handle: MsgHandler<Model, Msg, never> = () => ({
      mutation: (model) => ({ count: model.count + 1 }),
    })
    const program = makeOak({ name: 'OakV2SyncDispatch', init: { count: 0 }, handle })
    const runtime = ManagedRuntime.make(program.layer)

    try {
      const service = getService<Model, Msg>(runtime, program.tag)

      service.dispatch({ _tag: 'Increment' })

      expect(service.state.value).toEqual({ count: 1 })
    } finally {
      await runtime.dispose()
    }
  })

  it('runs command results through a deferred dispatch', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Follow' }

    let commandModel = -1
    const handlerModels: Array<number> = []
    const follow: Cmd<Model, Msg, never> = (_message, model) =>
      Effect.sync(() => {
        commandModel = model.count
        return { _tag: 'Follow' } as const
      })
    const handle: MsgHandler<Model, Msg, never> = (message, model) => {
      handlerModels.push(model.count)
      switch (message._tag) {
        case 'Start':
          return {
            mutation: (model) => ({ count: model.count + 1 }),
            commands: [follow],
          }
        case 'Follow':
          return {
            mutation: (model) => ({ count: model.count + 10 }),
          }
      }
    }
    const program = makeOak({ name: 'OakV2CommandDispatch', init: { count: 0 }, handle })
    const runtime = ManagedRuntime.make(program.layer)

    try {
      const service = getService<Model, Msg>(runtime, program.tag)

      service.dispatch({ _tag: 'Start' })

      expect(service.state.value).toEqual({ count: 1 })
      await eventually(() => {
        expect(service.state.value).toEqual({ count: 11 })
      })
      expect(commandModel).toBe(1)
      expect(handlerModels).toEqual([0, 1])
    } finally {
      await runtime.dispose()
    }
  })

  it('starts subscriptions from the initial selection and restarts when it changes', async () => {
    type Model = { readonly interval: number; readonly ticks: number }
    type Msg =
      | { readonly _tag: 'SetInterval'; readonly interval: number }
      | { readonly _tag: 'Tick' }

    const runModels: Array<number> = []
    const subscription: Sub<Model, Msg, never, number> = {
      select: (model) => model.interval,
      run: (interval) => {
        runModels.push(interval)
        return Stream.succeed({ _tag: 'Tick' } as const)
      },
    }
    const handle: MsgHandler<Model, Msg, never> = (message) => {
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
    const program = makeOak({
      name: 'OakV2SubscriptionInitial',
      init: { interval: 100, ticks: 0 },
      handle,
      subscriptions: [subscription],
    })
    const runtime = ManagedRuntime.make(program.layer)

    try {
      const service = getService<Model, Msg>(runtime, program.tag)

      await eventually(() => {
        expect(service.state.value).toEqual({ interval: 100, ticks: 1 })
      })
      expect(runModels).toEqual([100])
      await flushMicrotasks()
      expect(runModels).toEqual([100])

      service.dispatch({ _tag: 'SetInterval', interval: 250 })

      await eventually(() => {
        expect(runModels).toEqual([100, 250])
        expect(service.state.value).toEqual({ interval: 250, ticks: 2 })
      })
    } finally {
      await runtime.dispose()
    }
  })

  it('defers direct nested dispatch instead of recursing through the active frame', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Increment' }

    const handle: MsgHandler<Model, Msg, never> = () => ({
      mutation: (model) => ({ count: model.count + 1 }),
    })
    const program = makeOak({ name: 'OakV2NestedDispatch', init: { count: 0 }, handle })
    const runtime = ManagedRuntime.make(program.layer)

    try {
      const service = getService<Model, Msg>(runtime, program.tag)
      const unsubscribe = service.state.subscribe((model) => {
        if (model.count === 1) {
          service.dispatch({ _tag: 'Increment' })
        }
      })

      service.dispatch({ _tag: 'Increment' })

      expect(service.state.value).toEqual({ count: 1 })
      await flushMicrotasks()
      expect(service.state.value).toEqual({ count: 2 })
      unsubscribe()
    } finally {
      await runtime.dispose()
    }
  })

  it('reports update defects through diagnostics', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Boom' }

    const handle: MsgHandler<Model, Msg, never> = () => {
      throw new Error('boom')
    }
    const program = makeOak({ name: 'OakV2Diagnostics', init: { count: 0 }, handle })
    const runtime = ManagedRuntime.make(program.layer)

    try {
      const service = getService<Model, Msg>(runtime, program.tag)
      let source: string | undefined
      const fiber = runtime.runFork(
        service.diagnostics.pipe(
          Stream.runForEach((diagnostic) =>
            Effect.sync(() => {
              source = diagnostic.source
            }),
          ),
        ),
      )

      await flushMicrotasks()
      service.dispatch({ _tag: 'Boom' })

      await eventually(() => {
        expect(source).toBe('message')
      })
      await runtime.runPromise(Fiber.interrupt(fiber))
    } finally {
      await runtime.dispose()
    }
  })

  it('interrupts scoped command fibers when the runtime is disposed', async () => {
    type Model = { readonly started: boolean }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Never' }

    let commandStarted = false
    let commandFinalized = false
    const neverCommand: Cmd<Model, Msg, never> = () =>
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
    const handle: MsgHandler<Model, Msg, never> = (message) => {
      switch (message._tag) {
        case 'Start':
          return {
            mutation: (model) => ({ ...model, started: true }),
            commands: [neverCommand],
          }
        case 'Never':
          return {
            mutation: (model) => model,
          }
      }
    }
    const program = makeOak({ name: 'OakV2ScopedCommand', init: { started: false }, handle })
    const runtime = ManagedRuntime.make(program.layer)

    const service = getService<Model, Msg>(runtime, program.tag)
    service.dispatch({ _tag: 'Start' })

    await eventually(() => {
      expect(commandStarted).toBe(true)
    })
    await runtime.dispose()
    await eventually(() => {
      expect(commandFinalized).toBe(true)
    })
  })
})
