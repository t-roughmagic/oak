import { Context, Effect, Layer, ManagedRuntime, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import type { Diagnostic, OakEvent, Update } from '@oak/oak-core'
import {
  makeOakEffectProgram,
  type EffectCommand,
  type EffectSub,
} from '../src/index.js'

interface Model {
  readonly count: number
  readonly label: string
  readonly seen: readonly string[]
}

type Msg =
  | { readonly _tag: 'Inc' }
  | { readonly _tag: 'Set'; readonly value: number }
  | { readonly _tag: 'SetLabel'; readonly label: string }
  | { readonly _tag: 'Saw'; readonly label: string }
  | { readonly _tag: 'StartFetch' }
  | { readonly _tag: 'Loaded'; readonly value: number }
  | { readonly _tag: 'StartForever' }
  | { readonly _tag: 'CmdBoom' }

interface NumberService {
  readonly next: Effect.Effect<number>
}
const NumberService = Context.GenericTag<NumberService>('test:NumberService')

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

const initModel: Model = { count: 0, label: 'a', seen: [] }

describe('makeOakEffectProgram', () => {
  describe('layer + service', () => {
    it('builds a service exposing init state synchronously', async () => {
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:basic',
        init: { ...initModel, count: 7 },
        update: () => ({ mutation: (m) => m, effects: [] }),
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        expect(service.state.value).toEqual({ ...initModel, count: 7 })
      } finally {
        await runtime.dispose()
      }
    })

    it('runs Effect-side dispatch and reflects in state', async () => {
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'Inc')
          return { mutation: (m) => ({ ...m, count: m.count + 1 }), effects: [] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:dispatch-effect',
        init: initModel,
        update,
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        await runtime.runPromise(service.dispatch({ _tag: 'Inc' }))
        expect(service.state.value.count).toBe(1)
      } finally {
        await runtime.dispose()
      }
    })

    it('exposes a sync driver whose dispatch updates state without an Effect runtime', async () => {
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'Inc')
          return { mutation: (m) => ({ ...m, count: m.count + 1 }), effects: [] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:driver',
        init: initModel,
        update,
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        const driver = program.view(service)
        driver.dispatch({ _tag: 'Inc' })
        driver.dispatch({ _tag: 'Inc' })
        expect(driver.state.value.count).toBe(2)
        expect(service.state.value.count).toBe(2)
      } finally {
        await runtime.dispose()
      }
    })
  })

  describe('commands', () => {
    it('runs a command, dispatches its result message, and reflects it in state', async () => {
      const fetchCmd: EffectCommand<Model, Msg, NumberService> = () =>
        Effect.flatMap(NumberService, (s) =>
          Effect.map(s.next, (value) => ({ _tag: 'Loaded' as const, value })),
        )
      const update: Update<Model, Msg, EffectCommand<Model, Msg, NumberService>> = (msg) => {
        switch (msg._tag) {
          case 'StartFetch':
            return { mutation: (m) => m, effects: [fetchCmd] }
          case 'Loaded':
            return {
              mutation: (m) => ({ ...m, count: msg.value }),
              effects: [],
            }
          default:
            return { mutation: (m) => m, effects: [] }
        }
      }
      const program = makeOakEffectProgram<Model, Msg, NumberService>({
        tagKey: 'test:command-result',
        init: initModel,
        update,
      })
      const numberLayer = Layer.succeed(
        NumberService,
        NumberService.of({ next: Effect.succeed(42) }),
      )
      const runtime = ManagedRuntime.make(program.layer.pipe(Layer.provideMerge(numberLayer)))
      try {
        const service = await runtime.runPromise(program.tag)
        await runtime.runPromise(service.dispatch({ _tag: 'StartFetch' }))
        // The command runs on a fiber and its result is fed back via a microtask.
        await flushMicrotasks()
        expect(service.state.value.count).toBe(42)
      } finally {
        await runtime.dispose()
      }
    })

    it("reports a command failure as a 'command' diagnostic and does not crash the program", async () => {
      const boom: EffectCommand<Model, Msg> = () => Effect.fail(new Error('cmd failed'))
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'CmdBoom')
          return { mutation: (m) => ({ ...m, count: m.count + 1 }), effects: [boom] }
        if (msg._tag === 'Inc')
          return { mutation: (m) => ({ ...m, count: m.count + 1 }), effects: [] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:cmd-failure',
        init: initModel,
        update,
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        const diagnostics: Diagnostic[] = []
        // Subscribe to diagnostics stream BEFORE triggering the command.
        runtime.runFork(
          service.diagnostics.pipe(
            Stream.runForEach((d) =>
              Effect.sync(() => {
                diagnostics.push(d)
              }),
            ),
          ),
        )
        await flushMicrotasks()
        await runtime.runPromise(service.dispatch({ _tag: 'CmdBoom' }))
        await flushMicrotasks()
        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0]?.source).toBe('command')
        // Program still functions after the failure.
        await runtime.runPromise(service.dispatch({ _tag: 'Inc' }))
        expect(service.state.value.count).toBe(2)
      } finally {
        await runtime.dispose()
      }
    })

    it('does not report a diagnostic when a pending command is interrupted by scope close', async () => {
      const forever: EffectCommand<Model, Msg> = () =>
        Effect.never as Effect.Effect<Msg, never, never>
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'StartForever')
          return { mutation: (m) => m, effects: [forever] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:cmd-interrupt',
        init: initModel,
        update,
      })
      const runtime = ManagedRuntime.make(program.layer)
      const service = await runtime.runPromise(program.tag)
      const diagnostics: Diagnostic[] = []
      runtime.runFork(
        service.diagnostics.pipe(
          Stream.runForEach((d) =>
            Effect.sync(() => {
              diagnostics.push(d)
            }),
          ),
        ),
      )
      await flushMicrotasks()
      await runtime.runPromise(service.dispatch({ _tag: 'StartForever' }))
      await flushMicrotasks()
      await runtime.dispose()
      await flushMicrotasks()
      expect(diagnostics).toHaveLength(0)
    })
  })

  describe('subscriptions', () => {
    it('starts immediately and dispatches messages emitted by the run-stream', async () => {
      const labelSub: EffectSub<Model, Msg, never, string> = {
        select: (m) => m.label,
        run: (label) => Stream.make({ _tag: 'Saw' as const, label }),
      }
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'Saw')
          return {
            mutation: (m) => ({ ...m, seen: [...m.seen, msg.label] }),
            effects: [],
          }
        if (msg._tag === 'SetLabel')
          return { mutation: (m) => ({ ...m, label: msg.label }), effects: [] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:sub-initial',
        init: initModel,
        update,
        subscriptions: [labelSub],
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        // The sub forked at scope start emits on the initial selected value.
        await flushMicrotasks()
        expect(service.state.value.seen).toEqual(['a'])
      } finally {
        await runtime.dispose()
      }
    })

    it('switches the running stream when the selected value changes', async () => {
      const labelSub: EffectSub<Model, Msg, never, string> = {
        select: (m) => m.label,
        run: (label) => Stream.make({ _tag: 'Saw' as const, label }),
      }
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'Saw')
          return {
            mutation: (m) => ({ ...m, seen: [...m.seen, msg.label] }),
            effects: [],
          }
        if (msg._tag === 'SetLabel')
          return { mutation: (m) => ({ ...m, label: msg.label }), effects: [] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:sub-switch',
        init: initModel,
        update,
        subscriptions: [labelSub],
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        await flushMicrotasks()
        await runtime.runPromise(service.dispatch({ _tag: 'SetLabel', label: 'b' }))
        await flushMicrotasks()
        await runtime.runPromise(service.dispatch({ _tag: 'SetLabel', label: 'c' }))
        await flushMicrotasks()
        // Each change triggers a fresh sub run; redundant changes would be filtered.
        expect(service.state.value.seen).toEqual(['a', 'b', 'c'])
      } finally {
        await runtime.dispose()
      }
    })

    it('does not re-run when the selected value is equal under the default eq', async () => {
      const labelSub: EffectSub<Model, Msg, never, string> = {
        select: (m) => m.label,
        run: (label) => Stream.make({ _tag: 'Saw' as const, label }),
      }
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'Saw')
          return {
            mutation: (m) => ({ ...m, seen: [...m.seen, msg.label] }),
            effects: [],
          }
        if (msg._tag === 'SetLabel')
          return { mutation: (m) => ({ ...m, label: msg.label }), effects: [] }
        if (msg._tag === 'Inc')
          return { mutation: (m) => ({ ...m, count: m.count + 1 }), effects: [] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:sub-dedup',
        init: initModel,
        update,
        subscriptions: [labelSub],
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        await flushMicrotasks()
        // Inc changes the model but not the selected label — sub should not re-run.
        await runtime.runPromise(service.dispatch({ _tag: 'Inc' }))
        await flushMicrotasks()
        await runtime.runPromise(service.dispatch({ _tag: 'Inc' }))
        await flushMicrotasks()
        expect(service.state.value.seen).toEqual(['a'])
      } finally {
        await runtime.dispose()
      }
    })

    it('honors a custom eq on the subscription', async () => {
      type CaselessModel = { readonly label: string; readonly seen: readonly string[] }
      type CaselessMsg =
        | { readonly _tag: 'SetLabel'; readonly label: string }
        | { readonly _tag: 'Saw'; readonly label: string }
      const caselessSub: EffectSub<CaselessModel, CaselessMsg, never, string> = {
        select: (m) => m.label,
        eq: (a, b) => a.toLowerCase() === b.toLowerCase(),
        run: (label) => Stream.make({ _tag: 'Saw' as const, label }),
      }
      const update: Update<CaselessModel, CaselessMsg, EffectCommand<CaselessModel, CaselessMsg>> = (
        msg,
      ) => {
        if (msg._tag === 'Saw')
          return {
            mutation: (m) => ({ ...m, seen: [...m.seen, msg.label] }),
            effects: [],
          }
        return { mutation: (m) => ({ ...m, label: msg.label }), effects: [] }
      }
      const program = makeOakEffectProgram<CaselessModel, CaselessMsg>({
        tagKey: 'test:sub-eq',
        init: { label: 'a', seen: [] },
        update,
        subscriptions: [caselessSub],
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        await flushMicrotasks()
        await runtime.runPromise(service.dispatch({ _tag: 'SetLabel', label: 'A' }))
        await flushMicrotasks()
        await runtime.runPromise(service.dispatch({ _tag: 'SetLabel', label: 'b' }))
        await flushMicrotasks()
        // 'a' → 'A' is deduped by caseless eq; 'A' → 'b' triggers a re-run.
        expect(service.state.value.seen).toEqual(['a', 'b'])
      } finally {
        await runtime.dispose()
      }
    })
  })

  describe('events stream', () => {
    it('emits OakEvent for each successful mutation', async () => {
      const update: Update<Model, Msg, EffectCommand<Model, Msg>> = (msg) => {
        if (msg._tag === 'Inc')
          return { mutation: (m) => ({ ...m, count: m.count + 1 }), effects: [] }
        return { mutation: (m) => m, effects: [] }
      }
      const program = makeOakEffectProgram<Model, Msg>({
        tagKey: 'test:events',
        init: initModel,
        update,
      })
      const runtime = ManagedRuntime.make(program.layer)
      try {
        const service = await runtime.runPromise(program.tag)
        const events: OakEvent<Model, Msg>[] = []
        runtime.runFork(
          service.events.pipe(
            Stream.runForEach((e) =>
              Effect.sync(() => {
                events.push(e)
              }),
            ),
          ),
        )
        await flushMicrotasks()
        await runtime.runPromise(service.dispatch({ _tag: 'Inc' }))
        await runtime.runPromise(service.dispatch({ _tag: 'Inc' }))
        await flushMicrotasks()
        expect(events.map((e) => e.model.count)).toEqual([1, 2])
        expect(events.map((e) => e.message)).toEqual([{ _tag: 'Inc' }, { _tag: 'Inc' }])
      } finally {
        await runtime.dispose()
      }
    })
  })
})
