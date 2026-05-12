# Oak SPEC

This document is the authoritative specification for the `packages/oak-v2`
scratchpad.

## Summary

Oak is an Elm-style state framework for TypeScript. An Oak program is always
authored for one Oak platform, because effects and subscriptions are part of
the program API and are shaped by the platform that runs them.

Use **platform** for Oak integrations such as Effect, Promise, or Observable.
Use **runtime** only for an underlying execution system, such as Effect's
`ManagedRuntime`.

The internal kernel is not an Oak program and is not a public handoff value. It
is private machinery used by platforms to implement synchronous mutation,
effect scheduling, events, diagnostics, and teardown.

```
                  user code
        model, message, update, effects, subs
                         |
                         v
          Oak platform artifact, e.g. Effect
            { name, tag, layer, view(...) }
                         |
             +-----------+-----------+
             |                       |
             v                       v
       platform runtime        view driver
       Layer / service         { state, dispatch }
       effects / subs                |
                                     v
                              React / CLI / ...
```

## Public Authoring Types

Updates always return effects. A no-work branch returns `effects: []`.

```ts
type Mutation<M> = (model: M) => M

interface HandlerResult<M, Fx> {
  readonly mutation: Mutation<M>
  readonly effects: ReadonlyArray<Fx>
}

type Update<M, Msg, Fx> = (msg: Msg, model: M) => HandlerResult<M, Fx>
```

The view handoff is a driver:

```ts
interface OakState<M> {
  readonly value: M
  subscribe(listener: (model: M) => void): () => void
}

interface OakViewDriver<M, Msg> {
  readonly name: string
  readonly state: OakState<M>
  dispatch(msg: Msg): void
}
```

Views do not receive an internal kernel or a platform service.

## Effect Platform

`platform-effect/` is the Effect platform.

```ts
type EffectCommand<M, Msg, R = never, E = unknown> = (
  msg: Msg,
  model: M,
) => Effect.Effect<Msg, E, R>

interface EffectSub<M, Msg, R = never, A = unknown> {
  select(model: M): A
  run(value: A): Stream.Stream<Msg, never, R>
  eq?(prev: A, curr: A): boolean
}

interface OakEffectProgram<M, Msg, R = never> {
  readonly name: string
  readonly tag: OakTag<M, Msg>
  readonly layer: Layer.Layer<OakService<M, Msg>, never, R>
  view(service: OakService<M, Msg>): OakViewDriver<M, Msg>
}
```

`makeOakEffectProgram` creates the exportable program artifact. Library authors
export that artifact. Application code provides `program.layer` to an Effect
runtime, retrieves `program.tag`, and passes `program.view(service)` to React.

React apps may compose `program.layer` with any other Effect layers before
creating the runtime. Oak does not own that composition; the program layer's
requirements remain visible in its type signature.

`OakService` is the running Effect-side surface:

```ts
interface OakService<M, Msg> {
  readonly name: string
  readonly state: OakState<M>
  readonly dispatch: (msg: Msg) => Effect.Effect<void>
  readonly driver: OakViewDriver<M, Msg>
  readonly events: Stream.Stream<OakEvent<M, Msg>>
  readonly diagnostics: Stream.Stream<Diagnostic>
}
```

Effect-side consumers use `dispatch`, `events`, and `diagnostics`. View code
uses the driver.

## Promise Platform

The Promise platform is a second platform sketch. It exists to keep the
platform boundary honest, but it does not make the kernel a standalone program.

```ts
type PromiseCommand<M, Msg> = (msg: Msg, model: M) => Promise<Msg>

interface PromiseSub<M, Msg, A> {
  select(model: M): A
  run(value: A, dispatch: (msg: Msg) => void): () => void
  eq?(prev: A, curr: A): boolean
}

interface PromiseProgram<M, Msg> {
  readonly name: string
  start(): PromiseProgramInstance<M, Msg>
  view(instance: PromiseProgramInstance<M, Msg>): OakViewDriver<M, Msg>
}
```

`start()` starts the running program and subscriptions. `view(instance)` returns
the driver for views.

## React View Adapter

React imports the shared driver and state types. It does not import Effect,
Promise platform code, or the internal kernel.

```tsx
<OakProvider driver={program.view(service)}>
  <App />
</OakProvider>

useOakSelector((model) => model.someSlice, eq?)
useOakDispatch()
```

`useOakSelector` uses `useSyncExternalStore` against `driver.state`.
`useOakDispatch` calls `driver.dispatch`.

An Effect-specific React bridge may sit beside this driver adapter:

```tsx
<EffectRuntimeProvider layer={composedAppLayer}>
  <OakEffectViewProvider program={program}>
    <App />
  </OakEffectViewProvider>
</EffectRuntimeProvider>
```

`EffectRuntimeProvider` is a generic React/Effect concern. `OakEffectViewProvider`
requires that an ambient runtime already provides the program's `OakService`;
it resolves `program.tag` and delegates to `OakProvider`.

Selector memoization is a user concern. For selectors returning fresh objects,
pass an equality function or memoize the selector before passing it to
`useOakSelector`.

## Internal Kernel

`core/` contains the internal dispatch engine:

- `Cell<M>` stores the current model and notifies state listeners.
- `makeKernel` runs `update`, applies the returned mutation, emits events, and
  passes effects to a platform-supplied scheduler.
- `dispatch` is synchronous. After it returns, `state.value` reflects the
  post-mutation model unless `update` or `mutation` failed.
- Re-entrant dispatches are deferred with `queueMicrotask`.
- `dispose()` turns future dispatches into no-ops so late platform callbacks
  cannot mutate state after teardown.

The kernel has no Effect, Promise, Observable, React, or platform dependency.
That keeps the platform implementation small and testable, but it does not make
the kernel an Oak application API.

## Invariants

1. Every user-authored Oak program targets one platform.
2. Commands/effects and subscriptions are platform-shaped and part of the
   program design.
3. Views consume `OakViewDriver<M, Msg>`, never `OakKernel<M, Msg>`.
4. Platform services may own private kernel machinery, but docs and examples
   must not present the kernel as a public handoff.
5. React must not import Effect or Promise platform modules.
6. The internal kernel must not import async or view libraries.
7. No-effect update branches return `effects: []`.

## Tests

- `core.test.ts` is internal implementation coverage for the platform dispatch
  engine.
- `platform-effect.test.ts` covers the Effect platform layer, commands,
  subscriptions, diagnostics, and disposal.
- `platform-promise.test.ts` covers the Promise platform sketch.
- `react.test.tsx` covers React rendering through `OakViewDriver`.

## Historical Context

`oak-protocol-plan.md` is an old design note. It contains obsolete
kernel-as-protocol language and is not authoritative.
