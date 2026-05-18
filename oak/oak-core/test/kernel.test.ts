import { describe, expect, it, vi } from 'vitest'
import {
  makeKernel,
  type Diagnostic,
  type HandlerResult,
  type OakEvent,
  type ScheduleCommand,
  type Update,
} from '../src/index.js'

interface Model {
  readonly count: number
}

type Msg =
  | { readonly _tag: 'Inc' }
  | { readonly _tag: 'Dec' }
  | { readonly _tag: 'Set'; readonly value: number }
  | { readonly _tag: 'Throw' }
  | { readonly _tag: 'BadMutation' }
  | { readonly _tag: 'WithEffect' }

const inc: Update<Model, Msg, unknown> = (msg, model) => {
  switch (msg._tag) {
    case 'Inc':
      return { mutation: (m) => ({ count: m.count + 1 }), effects: [] }
    case 'Dec':
      return { mutation: (m) => ({ count: m.count - 1 }), effects: [] }
    case 'Set':
      return { mutation: () => ({ count: msg.value }), effects: [] }
    case 'Throw':
      throw new Error('boom from update')
    case 'BadMutation':
      return {
        mutation: () => {
          throw new Error('boom from mutation')
        },
        effects: [],
      }
    case 'WithEffect':
      return { mutation: (m) => ({ count: m.count + 1 }), effects: ['side-fx'] }
  }
}

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r))

describe('makeKernel', () => {
  describe('state', () => {
    it('exposes init as state.value before any dispatch', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 7 }, update: inc })
      expect(kernel.state.value).toEqual({ count: 7 })
    })

    it('reflects the post-message model synchronously after dispatch', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      kernel.dispatch({ _tag: 'Inc' })
      expect(kernel.state.value).toEqual({ count: 1 })
      kernel.dispatch({ _tag: 'Inc' })
      kernel.dispatch({ _tag: 'Inc' })
      expect(kernel.state.value).toEqual({ count: 3 })
    })
  })

  describe('state listeners', () => {
    it('notifies subscribers with the new model', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const seen: Model[] = []
      kernel.state.subscribe((m) => seen.push(m))
      kernel.dispatch({ _tag: 'Inc' })
      kernel.dispatch({ _tag: 'Set', value: 10 })
      expect(seen).toEqual([{ count: 1 }, { count: 10 }])
    })

    it('does not notify when the next model is Object.is-equal to the previous', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 5 }, update: inc })
      const listener = vi.fn()
      kernel.state.subscribe(listener)
      kernel.dispatch({ _tag: 'Set', value: 5 })
      // mutation returns a new object — Object.is sees them as different references
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('honors a custom eq for deduplication', () => {
      const kernel = makeKernel<Model, Msg>({
        init: { count: 5 },
        update: inc,
        eq: (a, b) => a.count === b.count,
      })
      const listener = vi.fn()
      kernel.state.subscribe(listener)
      kernel.dispatch({ _tag: 'Set', value: 5 })
      expect(listener).not.toHaveBeenCalled()
      kernel.dispatch({ _tag: 'Inc' })
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('unsubscribe stops notification', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const listener = vi.fn()
      const unsubscribe = kernel.state.subscribe(listener)
      kernel.dispatch({ _tag: 'Inc' })
      expect(listener).toHaveBeenCalledTimes(1)
      unsubscribe()
      kernel.dispatch({ _tag: 'Inc' })
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('continues notifying remaining listeners when one throws, and reports a diagnostic', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const good = vi.fn()
      const diagnostics: Diagnostic[] = []
      kernel.subscribeDiagnostics((d) => diagnostics.push(d))
      kernel.state.subscribe(() => {
        throw new Error('listener exploded')
      })
      kernel.state.subscribe(good)
      kernel.dispatch({ _tag: 'Inc' })
      expect(good).toHaveBeenCalledTimes(1)
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.source).toBe('state-listener')
    })
  })

  describe('events', () => {
    it('publishes an OakEvent after a successful mutation', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const events: OakEvent<Model, Msg>[] = []
      kernel.subscribeEvents((e) => events.push(e))
      kernel.dispatch({ _tag: 'Inc' })
      expect(events).toHaveLength(1)
      expect(events[0]?.message).toEqual({ _tag: 'Inc' })
      expect(events[0]?.model).toEqual({ count: 1 })
    })

    it('does not publish an event when update throws', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const events: OakEvent<Model, Msg>[] = []
      kernel.subscribeEvents((e) => events.push(e))
      kernel.subscribeDiagnostics(() => {}) // swallow
      kernel.dispatch({ _tag: 'Throw' })
      expect(events).toHaveLength(0)
    })

    it('does not publish an event when mutation throws', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const events: OakEvent<Model, Msg>[] = []
      kernel.subscribeEvents((e) => events.push(e))
      kernel.subscribeDiagnostics(() => {})
      kernel.dispatch({ _tag: 'BadMutation' })
      expect(events).toHaveLength(0)
    })

    it('reports event-listener throws as diagnostics', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const diagnostics: Diagnostic[] = []
      kernel.subscribeDiagnostics((d) => diagnostics.push(d))
      kernel.subscribeEvents(() => {
        throw new Error('event listener exploded')
      })
      kernel.dispatch({ _tag: 'Inc' })
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.source).toBe('event-listener')
    })
  })

  describe('diagnostics', () => {
    it("routes update throws to source 'update' and leaves state unchanged", () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const diagnostics: Diagnostic[] = []
      kernel.subscribeDiagnostics((d) => diagnostics.push(d))
      kernel.dispatch({ _tag: 'Throw' })
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.source).toBe('update')
      expect((diagnostics[0]?.error as Error).message).toBe('boom from update')
      expect(kernel.state.value).toEqual({ count: 0 })
    })

    it("routes mutation throws to source 'mutation' and leaves state unchanged", () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const diagnostics: Diagnostic[] = []
      kernel.subscribeDiagnostics((d) => diagnostics.push(d))
      kernel.dispatch({ _tag: 'BadMutation' })
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.source).toBe('mutation')
      expect(kernel.state.value).toEqual({ count: 0 })
    })

    it('lets platforms publish their own diagnostics via reportDiagnostic', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const diagnostics: Diagnostic[] = []
      kernel.subscribeDiagnostics((d) => diagnostics.push(d))
      kernel.reportDiagnostic('subscription', new Error('sub failed'))
      expect(diagnostics).toEqual([
        { source: 'subscription', error: expect.any(Error) },
      ])
    })

    it('terminally console.errors when a diagnostic listener throws', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        kernel.subscribeDiagnostics(() => {
          throw new Error('diag listener exploded')
        })
        kernel.dispatch({ _tag: 'Throw' })
        expect(err).toHaveBeenCalled()
      } finally {
        err.mockRestore()
      }
    })
  })

  describe('scheduleCommand', () => {
    it("is called with (cmd, msg, post-mutation model, deferredDispatch, reportDiagnostic) per effect", () => {
      const scheduler = vi.fn<ScheduleCommand<Model, Msg, string>>()
      const kernel = makeKernel<Model, Msg, string>({
        init: { count: 0 },
        update: inc,
        scheduleCommand: scheduler,
      })
      kernel.dispatch({ _tag: 'WithEffect' })
      expect(scheduler).toHaveBeenCalledTimes(1)
      const [cmd, msg, model, deferredDispatch, reportDiagnostic] = scheduler.mock.calls[0]!
      expect(cmd).toBe('side-fx')
      expect(msg).toEqual({ _tag: 'WithEffect' })
      expect(model).toEqual({ count: 1 })
      expect(typeof deferredDispatch).toBe('function')
      expect(typeof reportDiagnostic).toBe('function')
    })

    it('deferredDispatch defers the next dispatch via a microtask', async () => {
      let captured: ((m: Msg) => void) | null = null
      const kernel = makeKernel<Model, Msg, string>({
        init: { count: 0 },
        update: inc,
        scheduleCommand: (_cmd, _msg, _model, deferredDispatch) => {
          captured = deferredDispatch
        },
      })
      kernel.dispatch({ _tag: 'WithEffect' })
      // After the synchronous dispatch, count is 1.
      expect(kernel.state.value.count).toBe(1)
      captured!({ _tag: 'Inc' })
      // Not applied synchronously.
      expect(kernel.state.value.count).toBe(1)
      await flushMicrotasks()
      expect(kernel.state.value.count).toBe(2)
    })

    it("reports a scheduler throw as source 'command' and continues with later effects", () => {
      type FxMsg = Msg | { readonly _tag: 'TwoEffects' }
      const update: Update<Model, FxMsg, string> = (msg, model) => {
        if (msg._tag === 'TwoEffects') {
          return { mutation: (m) => m, effects: ['bad', 'good'] }
        }
        return inc(msg, model) as HandlerResult<Model, string>
      }
      const seenEffects: string[] = []
      const diagnostics: Diagnostic[] = []
      const kernel = makeKernel<Model, FxMsg, string>({
        init: { count: 0 },
        update,
        scheduleCommand: (cmd) => {
          if (cmd === 'bad') {
            throw new Error('scheduler boom')
          }
          seenEffects.push(cmd)
        },
      })
      kernel.subscribeDiagnostics((d) => diagnostics.push(d))
      kernel.dispatch({ _tag: 'TwoEffects' })
      expect(seenEffects).toEqual(['good'])
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.source).toBe('command')
    })

    it('does not call scheduleCommand when update returns no effects', () => {
      const scheduler = vi.fn<ScheduleCommand<Model, Msg, string>>()
      const kernel = makeKernel<Model, Msg, string>({
        init: { count: 0 },
        update: inc,
        scheduleCommand: scheduler,
      })
      kernel.dispatch({ _tag: 'Inc' })
      expect(scheduler).not.toHaveBeenCalled()
    })
  })

  describe('re-entrance', () => {
    it('defers a nested dispatch made from a state listener', async () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      const observed: number[] = []
      let reentered = false
      kernel.state.subscribe((m) => {
        observed.push(m.count)
        if (m.count === 1 && !reentered) {
          reentered = true
          kernel.dispatch({ _tag: 'Inc' })
        }
      })
      kernel.dispatch({ _tag: 'Inc' })
      // First dispatch completed; nested one queued on microtask.
      expect(observed).toEqual([1])
      expect(kernel.state.value.count).toBe(1)
      await flushMicrotasks()
      expect(observed).toEqual([1, 2])
      expect(kernel.state.value.count).toBe(2)
    })
  })

  describe('dispose', () => {
    it('makes subsequent dispatches a no-op', () => {
      const kernel = makeKernel<Model, Msg>({ init: { count: 0 }, update: inc })
      kernel.dispatch({ _tag: 'Inc' })
      expect(kernel.state.value.count).toBe(1)
      kernel.dispose()
      kernel.dispatch({ _tag: 'Inc' })
      expect(kernel.state.value.count).toBe(1)
    })
  })
})
