import { describe, expect, it } from 'vitest'
import {
  makeKernel,
  type Diagnostic,
  type DiagnosticSource,
  type OakEvent,
} from '../src/core/index.js'

describe('internal core kernel', () => {
  it('applies mutations synchronously and emits events', () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Increment' }

    const kernel = makeKernel<Model, Msg>({
      init: { count: 0 },
      update: () => ({
        mutation: (model) => ({ count: model.count + 1 }),
        effects: [],
      }),
    })

    const events: Array<OakEvent<Model, Msg>> = []
    kernel.subscribeEvents((event) => {
      events.push(event)
    })

    kernel.dispatch({ _tag: 'Increment' })

    expect(kernel.state.value).toEqual({ count: 1 })
    expect(events).toEqual([{ message: { _tag: 'Increment' }, model: { count: 1 } }])
  })

  it('hands commands to the scheduleCommand callback', () => {
    type Model = { readonly value: string }
    type Msg = { readonly _tag: 'Set'; readonly value: string }
    type Cmd = { readonly _tag: 'Log'; readonly text: string }

    const scheduled: Array<{ cmd: Cmd; msg: Msg; model: Model }> = []

    const kernel = makeKernel<Model, Msg, Cmd>({
      init: { value: 'initial' },
      update: (msg) => ({
        mutation: (model) => ({ ...model, value: msg.value }),
        effects: [{ _tag: 'Log', text: `set to ${msg.value}` }],
      }),
      scheduleCommand: (cmd, msg, model) => {
        scheduled.push({ cmd, msg, model })
      },
    })

    kernel.dispatch({ _tag: 'Set', value: 'hello' })

    expect(kernel.state.value).toEqual({ value: 'hello' })
    expect(scheduled).toEqual([
      {
        cmd: { _tag: 'Log', text: 'set to hello' },
        msg: { _tag: 'Set', value: 'hello' },
        model: { value: 'hello' },
      },
    ])
  })

  it('routes command-produced messages through deferred dispatch', async () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Follow' }
    type Cmd = { readonly _tag: 'EmitFollow' }

    const kernel = makeKernel<Model, Msg, Cmd>({
      init: { count: 0 },
      update: (msg) => {
        switch (msg._tag) {
          case 'Start':
            return {
              mutation: (model) => ({ count: model.count + 1 }),
              effects: [{ _tag: 'EmitFollow' }],
            }
          case 'Follow':
            return { mutation: (model) => ({ count: model.count + 10 }), effects: [] }
        }
      },
      scheduleCommand: (_cmd, _msg, _model, deferredDispatch) => {
        deferredDispatch({ _tag: 'Follow' })
      },
    })

    kernel.dispatch({ _tag: 'Start' })

    expect(kernel.state.value).toEqual({ count: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(kernel.state.value).toEqual({ count: 11 })
  })

  it('reports update defects as diagnostics without crashing', () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Bad' }

    const diagnostics: Array<Diagnostic> = []
    const kernel = makeKernel<Model, Msg>({
      init: { count: 0 },
      update: () => {
        throw new Error('boom')
      },
    })
    kernel.subscribeDiagnostics((d) => {
      diagnostics.push(d)
    })

    kernel.dispatch({ _tag: 'Bad' })

    expect(kernel.state.value).toEqual({ count: 0 })
    expect(diagnostics).toHaveLength(1)
    const sources: ReadonlyArray<DiagnosticSource> = ['update']
    expect(sources).toContain(diagnostics[0]!.source)
  })

  it('ignores dispatches after dispose', () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Inc' }

    const kernel = makeKernel<Model, Msg>({
      init: { count: 0 },
      update: () => ({ mutation: (m) => ({ count: m.count + 1 }), effects: [] }),
    })

    kernel.dispatch({ _tag: 'Inc' })
    expect(kernel.state.value).toEqual({ count: 1 })

    kernel.dispose()
    kernel.dispatch({ _tag: 'Inc' })
    expect(kernel.state.value).toEqual({ count: 1 })
  })

  it('allows platform code to publish diagnostics via reportDiagnostic', () => {
    type Model = { readonly ok: boolean }
    type Msg = { readonly _tag: 'Noop' }

    const kernel = makeKernel<Model, Msg>({
      init: { ok: true },
      update: () => ({ mutation: (model) => model, effects: [] }),
    })
    const captured: Array<Diagnostic> = []
    kernel.subscribeDiagnostics((d) => {
      captured.push(d)
    })

    kernel.reportDiagnostic('subscription', new Error('sub blew up'))

    expect(captured).toHaveLength(1)
    expect(captured[0]!.source).toBe('subscription')
  })
})
