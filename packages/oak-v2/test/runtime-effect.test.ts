import { Effect, ManagedRuntime, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  makeOakEffectProgram,
  type EffectCommand,
  type EffectSub,
} from '../src/runtime-effect/index.js'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function eventually(assertion: () => void, timeoutMs = 1_000): Promise<void> {
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

describe('runtime-effect', () => {
  it('builds a Layer that runs Effect commands and feeds messages back', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Follow' }
    type Cmd = EffectCommand<Model, Msg, never>

    const follow: Cmd = () => Effect.succeed({ _tag: 'Follow' } as const)
    const program = makeOakEffectProgram<Model, Msg>({
      name: 'EffectCmd',
      init: { count: 0 },
      update: (msg) => {
        switch (msg._tag) {
          case 'Start':
            return {
              mutation: (model) => ({ count: model.count + 1 }),
              effects: [follow],
            }
          case 'Follow':
            return { mutation: (model) => ({ count: model.count + 10 }) }
        }
      },
    })

    const runtime = ManagedRuntime.make(program.layer)
    try {
      const service = await runtime.runPromise(Effect.flatMap(program.tag, Effect.succeed))

      service.kernel.dispatch({ _tag: 'Start' })

      expect(service.state.value).toEqual({ count: 1 })
      await eventually(() => {
        expect(service.state.value).toEqual({ count: 11 })
      })
    } finally {
      await runtime.dispose()
    }
  })

  it('runs subscriptions and switches on selected value change', async () => {
    type Model = { readonly interval: number; readonly ticks: number }
    type Msg =
      | { readonly _tag: 'SetInterval'; readonly interval: number }
      | { readonly _tag: 'Tick' }

    const runIntervals: Array<number> = []
    const sub: EffectSub<Model, Msg, never, number> = {
      select: (m) => m.interval,
      run: (interval) => {
        runIntervals.push(interval)
        return Stream.succeed({ _tag: 'Tick' } as const)
      },
    }

    const program = makeOakEffectProgram<Model, Msg>({
      name: 'EffectSub',
      init: { interval: 100, ticks: 0 },
      update: (msg) => {
        switch (msg._tag) {
          case 'SetInterval':
            return { mutation: (m) => ({ ...m, interval: msg.interval }) }
          case 'Tick':
            return { mutation: (m) => ({ ...m, ticks: m.ticks + 1 }) }
        }
      },
      subscriptions: [sub],
    })

    const runtime = ManagedRuntime.make(program.layer)
    try {
      const service = await runtime.runPromise(Effect.flatMap(program.tag, Effect.succeed))

      await eventually(() => {
        expect(service.state.value).toEqual({ interval: 100, ticks: 1 })
      })
      expect(runIntervals).toEqual([100])

      service.kernel.dispatch({ _tag: 'SetInterval', interval: 250 })

      await eventually(() => {
        expect(service.state.value).toEqual({ interval: 250, ticks: 2 })
        expect(runIntervals).toEqual([100, 250])
      })
    } finally {
      await runtime.dispose()
    }
  })

  it('disposes the kernel when the Layer scope closes', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Inc' }

    const program = makeOakEffectProgram<Model, Msg>({
      name: 'EffectDispose',
      init: { count: 0 },
      update: () => ({ mutation: (m) => ({ count: m.count + 1 }) }),
    })

    const runtime = ManagedRuntime.make(program.layer)
    const service = await runtime.runPromise(Effect.flatMap(program.tag, Effect.succeed))

    service.kernel.dispatch({ _tag: 'Inc' })
    expect(service.state.value).toEqual({ count: 1 })

    await runtime.dispose()

    service.kernel.dispatch({ _tag: 'Inc' })
    expect(service.state.value).toEqual({ count: 1 })
  })
})
