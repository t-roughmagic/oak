import { describe, expect, it } from 'vitest'
import { type Diagnostic } from '../src/core/index.js'
import {
  makeOakPromiseProgram,
  type PromiseCommand,
  type PromiseSub,
} from '../src/platform-promise/index.js'

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

describe('Promise platform', () => {
  it('runs a Promise command and feeds its result back', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Follow' }
    type Cmd = PromiseCommand<Model, Msg>

    const follow: Cmd = async () => ({ _tag: 'Follow' })

    const program = makeOakPromiseProgram<Model, Msg>({
      name: 'PromiseCmd',
      init: { count: 0 },
      update: (msg) => {
        switch (msg._tag) {
          case 'Start':
            return {
              mutation: (model) => ({ count: model.count + 1 }),
              effects: [follow],
            }
          case 'Follow':
            return { mutation: (model) => ({ count: model.count + 10 }), effects: [] }
        }
      },
    })

    const instance = program.start()
    try {
      instance.driver.dispatch({ _tag: 'Start' })

      expect(instance.driver.state.value).toEqual({ count: 1 })
      await eventually(() => {
        expect(instance.driver.state.value).toEqual({ count: 11 })
      })
    } finally {
      instance.dispose()
    }
  })

  it('runs a callback subscription and switches on select changes', async () => {
    type Model = { readonly intervalMs: number; readonly ticks: number }
    type Msg =
      | { readonly _tag: 'SetInterval'; readonly intervalMs: number }
      | { readonly _tag: 'Tick' }

    const seenIntervals: Array<number> = []
    const tick: PromiseSub<Model, Msg, number> = {
      select: (m) => m.intervalMs,
      run: (intervalMs, dispatch) => {
        seenIntervals.push(intervalMs)
        const id = setInterval(() => {
          dispatch({ _tag: 'Tick' })
        }, intervalMs)
        return () => {
          clearInterval(id)
        }
      },
    }

    const program = makeOakPromiseProgram<Model, Msg>({
      name: 'PromiseSub',
      init: { intervalMs: 20, ticks: 0 },
      update: (msg) => {
        switch (msg._tag) {
          case 'SetInterval':
            return { mutation: (m) => ({ ...m, intervalMs: msg.intervalMs }), effects: [] }
          case 'Tick':
            return { mutation: (m) => ({ ...m, ticks: m.ticks + 1 }), effects: [] }
        }
      },
      subscriptions: [tick],
    })

    const instance = program.start()
    try {
      await eventually(() => {
        expect(instance.driver.state.value.ticks).toBeGreaterThan(0)
      })
      expect(seenIntervals).toEqual([20])

      instance.driver.dispatch({ _tag: 'SetInterval', intervalMs: 40 })

      await eventually(() => {
        expect(seenIntervals).toEqual([20, 40])
      })
    } finally {
      instance.dispose()
    }
  })

  it('reports rejections through diagnostics', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Run' } | { readonly _tag: 'Done' }
    type Cmd = PromiseCommand<Model, Msg>

    const fail: Cmd = async () => {
      throw new Error('boom')
    }

    const program = makeOakPromiseProgram<Model, Msg>({
      name: 'PromiseFail',
      init: { count: 0 },
      update: (msg) => {
        switch (msg._tag) {
          case 'Run':
            return { mutation: (m) => m, effects: [fail] }
          case 'Done':
            return { mutation: (m) => ({ count: m.count + 1 }), effects: [] }
        }
      },
    })

    const instance = program.start()
    try {
      const diagnostics: Array<Diagnostic> = []
      instance.subscribeDiagnostics((d) => {
        diagnostics.push(d)
      })

      instance.driver.dispatch({ _tag: 'Run' })

      await eventually(() => {
        expect(diagnostics.length).toBeGreaterThan(0)
      })
      expect(diagnostics[0]!.source).toBe('command')
    } finally {
      instance.dispose()
    }
  })

  it('disposes subscriptions and stops dispatch after dispose', async () => {
    type Model = { readonly ticks: number }
    type Msg = { readonly _tag: 'Tick' }

    let cleanupCalled = false
    const sub: PromiseSub<Model, Msg, number> = {
      select: () => 0,
      run: (_value, dispatch) => {
        const id = setInterval(() => {
          dispatch({ _tag: 'Tick' })
        }, 10)
        return () => {
          cleanupCalled = true
          clearInterval(id)
        }
      },
    }

    const program = makeOakPromiseProgram<Model, Msg>({
      name: 'PromiseDispose',
      init: { ticks: 0 },
      update: () => ({ mutation: (m) => ({ ticks: m.ticks + 1 }), effects: [] }),
      subscriptions: [sub],
    })

    const instance = program.start()
    await eventually(() => {
      expect(instance.driver.state.value.ticks).toBeGreaterThan(0)
    })

    const ticksBeforeDispose = instance.driver.state.value.ticks
    instance.dispose()

    expect(cleanupCalled).toBe(true)

    // After dispose, dispatch is ignored.
    instance.driver.dispatch({ _tag: 'Tick' })
    expect(instance.driver.state.value.ticks).toBe(ticksBeforeDispose)

    // No further ticks should arrive.
    await delay(40)
    expect(instance.driver.state.value.ticks).toBe(ticksBeforeDispose)
  })
})
