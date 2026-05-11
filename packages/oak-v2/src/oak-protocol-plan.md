# Oak Architectural Plan: Protocol, Runtimes, and Views

## Statement of intent

Oak is a TEA (The Elm Architecture) implementation for TypeScript, factored as a **protocol with pluggable runtimes** rather than as a single framework. The kernel is plain synchronous TypeScript with no async-machinery dependency. Async machinery — Effect, RxJS, Promises, whatever — lives in *runtime adapter* packages that implement a small protocol the kernel exposes. View integrations (React, Solid, etc.) talk only to the kernel's synchronous surface and remain agnostic to which runtime is in use.

This plan describes how the kernel stays generic over command type, how host runtimes wire up commands/subscriptions/events/diagnostics, and how selector memoization is solved as a *user concern* via libraries like `proxy-memoize` rather than as a framework concern coupled into the React view package.

## The three layers

### 1. `oak-core` — the kernel

Plain TypeScript. No dependency on Effect, no dependency on RxJS, no dependency on any async runtime. The kernel knows about:

- A model `M` and a message type `Msg`.
- A `Cell<M>` holding the current model.
- A synchronous `dispatch(msg)` that runs `update`, writes the cell, publishes an event, and hands commands to the host for scheduling.
- An events surface (synchronous listener set) for `{message, model}` post-dispatch.
- A diagnostics surface (synchronous listener set) for non-fatal errors caught around `update` and `cell.set`.

The kernel is generic over the *command type*. It does not run commands. It does not know what an Effect is, what an Observable is, what a Promise is. It hands command values to the host runtime via a `scheduleCommand` callback the host supplies at kernel-construction time. The host runs them however it likes.

### 2. `oak-runtime-*` — the runtimes

A runtime adapter is a thin package that bundles:

- A specific command type (`Effect.Effect<Msg, never, S>`, `Observable<Msg>`, `(msg, model) => Promise<Msg>`, etc.).
- An implementation of `scheduleCommand` that knows how to execute that command type and route its result back into the kernel's dispatch.
- A specific subscription type and the wiring to start/stop subs against the kernel.
- Optional richer surfaces for events and diagnostics (e.g., an Effect runtime might expose them as `Stream`s; an RxJS runtime as `Observable`s; a Promise runtime as `EventTarget` or callback registration).
- Lifecycle management: how the program is started, scoped, and torn down in that runtime's idiom.

Initial runtimes to write:

- **`oak-runtime-effect`** — the canonical runtime, the one zen-sim uses. Commands are `Effect<Msg, never, S>`. Subs are `Stream<Msg, never, S>`. Events and diagnostics are `Stream`s over `PubSub`s. Lifecycle is a `Layer.scoped` providing an `OakService` tag.
- **`oak-runtime-promise`** — the validation runtime. Commands are `(msg, model) => Promise<Msg>`. Subs are async iterables or `(model, dispatch) => () => void` registration callbacks. Events and diagnostics are listener-set surfaces. Lifecycle is `start()`/`dispose()`.

`oak-runtime-promise` exists primarily to *prove the protocol is real*. If the kernel can be driven cleanly by Promises, it can be driven by anything. If the Promise runtime feels awkward, the protocol has leaked Effect assumptions and needs fixing.

Optional later runtimes: `oak-runtime-rxjs`, `oak-runtime-signals`, etc. Each is a leaf package; none is foundational.

### 3. `oak-view-*` — the view adapters

A view adapter wires a kernel to a UI framework. It uses only the kernel's synchronous surface: `cell.value`, `cell.subscribe`, `dispatch`, and the events/diagnostics listener registration. It does not import any runtime package. It works with any runtime that produces an `OakKernel<M, Msg>`.

Initial view adapter:

- **`oak-react`** — React hooks: `useOakKernel` (provides a kernel via context), `useOakState`, `useOakDispatch`, `useOakSelector`. The last takes a function `(m: M) => A` and a selector-result equality. It does not depend on or require any selector library. Users who want memoization wrap their selector with `proxy-memoize`, reselect, or anything else *before* passing it to `useOakSelector`.

Future view adapters: `oak-solid`, `oak-vue`, `oak-cli` (renders state to terminal), `oak-test` (snapshots state for golden tests). Each implements the same protocol shape against its framework's reactivity model.

## The kernel protocol, concretely

The full TypeScript-side protocol is small. Here is the shape.

### Core types

```ts
// oak-core

export type Mutation<M> = (m: M) => M

export type Update<M, Msg, Cmd> = (msg: Msg) => readonly [Mutation<M>, ReadonlyArray<Cmd>]

export interface Diagnostic {
  readonly source: 'message' | 'command' | 'subscription' | 'dispatch'
  readonly error: unknown
}

export interface OakEvent<M, Msg> {
  readonly message: Msg
  readonly model: M
}

export interface Cell<M> {
  readonly value: M
  set(next: M): void
  subscribe(listener: (m: M) => void): () => void
}
```

### Kernel construction

```ts
// oak-core

export interface KernelConfig<M, Msg, Cmd> {
  readonly init: M
  readonly update: Update<M, Msg, Cmd>
  /**
   * The host's command scheduler. Called synchronously inside dispatch, once
   * per command produced by `update`. The host is responsible for executing
   * the command and calling `deferredDispatch` with the resulting message.
   *
   * The host MUST NOT call `deferredDispatch` synchronously from inside
   * `scheduleCommand`. It must be scheduled on a microtask, fiber turn,
   * Promise resolution, or other async boundary. The kernel guarantees its
   * own synchronous frame has unwound before the deferred dispatch runs.
   */
  readonly scheduleCommand: (
    cmd: Cmd,
    msg: Msg,
    model: M,
    deferredDispatch: (m: Msg) => void,
    reportDiagnostic: (d: Diagnostic) => void,
  ) => void
}

export interface OakKernel<M, Msg> {
  readonly cell: Cell<M>
  readonly dispatch: (msg: Msg) => void
  readonly subscribeEvents: (l: (e: OakEvent<M, Msg>) => void) => () => void
  readonly subscribeDiagnostics: (l: (d: Diagnostic) => void) => () => void
}

export function makeKernel<M, Msg, Cmd>(
  config: KernelConfig<M, Msg, Cmd>,
): OakKernel<M, Msg>
```

The kernel's responsibilities, end to end:

1. Maintain a `Cell<M>` initialized to `config.init`.
2. Implement synchronous `dispatch(msg)`:
   - Call `config.update(msg)`, catching synchronous throws as diagnostics.
   - Apply the mutation to the cell.
   - Publish an event to events listeners.
   - For each command, call `config.scheduleCommand(cmd, msg, newModel, deferredDispatch, reportDiagnostic)`.
3. Provide event and diagnostic subscribe surfaces backed by simple listener sets.
4. Provide a deferred-dispatch primitive (queueMicrotask-wrapped) that the host receives in `scheduleCommand`, so command continuations are guaranteed not to re-enter the same synchronous frame.
5. That's all.

Subscriptions are *not* part of the kernel protocol. The kernel knows about commands (which it hands to the host) and about state changes (which the host can observe via `cell.subscribe`). Subscriptions are entirely a runtime concept — the host implements them however it wants, using the kernel's `cell.subscribe` for change observation and the kernel's `dispatch` to feed messages back in.

### Why subscriptions live in the runtime, not the kernel

A subscription is "watch state, run an async machine that emits messages over time, restart it when something changes." The "async machine" part is irreducibly runtime-specific:

- In Effect, it's a `Stream` with `flatMap({ switch: true })`.
- In RxJS, it's an `Observable` with `switchMap`.
- In Promise-land, it's a series of async iterators or polling loops.

There's no portable shape for "an async machine that emits messages." Trying to define one in the kernel would either be uselessly generic or would secretly assume one of the existing async paradigms. Better to let each runtime define `Sub<M, Msg>` in its own idiom and implement `startSubscriptions(subs, kernel)` against its own machinery.

The kernel exposes everything a runtime needs to implement subs:

- `cell.subscribe` for state-change observation.
- `cell.value` for synchronous reads inside the sub.
- `dispatch` for feeding messages back in (with the runtime applying its own deferral semantics — the dispatch is sync so the runtime can call it directly, or wrap in microtask/setTimeout/fiber-yield as appropriate).

That's enough. Each runtime builds its sub abstraction on top.

## How a host wires up a kernel

The host has two equally valid styles, depending on what feels natural in the runtime's idiom.

### Style A: callback-based host

The host constructs the kernel with `scheduleCommand` filled in, then provides additional surfaces (subs, runtime-shaped events/diagnostics) as adapter functions over the kernel.

```ts
// oak-runtime-effect (sketch)

export interface OakService<M, Msg, S> {
  readonly state: Cell<M>
  readonly dispatch: Dispatch<Msg, S>
  readonly events: Stream.Stream<OakEvent<M, Msg>>
  readonly diagnostics: Stream.Stream<Diagnostic>
}

export function makeOakProgram<M, Msg, S>(config: {
  name: string
  init: M
  update: Update<M, Msg, Effect.Effect<Msg, never, S>>
  subscriptions?: ReadonlyArray<EffectSub<M, Msg, S>>
}): { layer: Layer.Layer<OakService<M, Msg>, never, S> } {
  return {
    layer: Layer.scoped(/* tag for OakService */, Effect.gen(function* () {
      const context = yield* Effect.context<S>()
      const scope = yield* Effect.scope

      const kernel = makeKernel<M, Msg, Effect.Effect<Msg, never, S>>({
        init: config.init,
        update: config.update,
        scheduleCommand: (cmd, msg, model, deferredDispatch, reportDiagnostic) => {
          Effect.runFork(
            cmd.pipe(
              Effect.flatMap(resultMsg =>
                Effect.sync(() => deferredDispatch(resultMsg))
              ),
              Effect.provide(context),
              Effect.catchAllCause(cause => Effect.sync(() =>
                reportDiagnostic({ source: 'command', error: cause })
              )),
            ),
          )
        },
      })

      // Adapt the kernel's listener-set events to a Stream
      const events = Stream.async<OakEvent<M, Msg>>((emit) => {
        const unsub = kernel.subscribeEvents(e => { emit.single(e) })
        return Effect.sync(unsub)
      })
      const diagnostics = Stream.async<Diagnostic>((emit) => {
        const unsub = kernel.subscribeDiagnostics(d => { emit.single(d) })
        return Effect.sync(unsub)
      })

      // Start subs
      for (const sub of config.subscriptions ?? []) {
        yield* runEffectSub(sub, kernel).pipe(
          Effect.provide(context),
          Effect.forkScoped,
        )
      }

      return {
        state: kernel.cell,
        dispatch: (msg: Msg) => Effect.sync(() => kernel.dispatch(msg)),
        events,
        diagnostics,
      }
    })),
  }
}
```

The kernel is purely callback-driven. The Effect-specific stuff — Layer, Scope, Context, Stream — is entirely the runtime's concern. The kernel doesn't know any of it exists.

### Style B: wrapping host

The host treats the kernel as a small primitive and wraps it with its own richer dispatch API. The kernel's `dispatch` stays the source of truth; the wrapper exposes a runtime-shaped surface to users.

```ts
// oak-runtime-promise (sketch)

export interface PromiseOak<M, Msg> {
  readonly state: Cell<M>
  readonly dispatch: (msg: Msg) => void
  readonly onEvent: (l: (e: OakEvent<M, Msg>) => void) => () => void
  readonly onDiagnostic: (l: (d: Diagnostic) => void) => () => void
  readonly dispose: () => void
}

export function makePromiseOak<M, Msg>(config: {
  init: M
  update: Update<M, Msg, (msg: Msg, model: M) => Promise<Msg>>
  subscriptions?: ReadonlyArray<PromiseSub<M, Msg>>
}): PromiseOak<M, Msg> {
  const kernel = makeKernel({
    init: config.init,
    update: config.update,
    scheduleCommand: (cmd, msg, model, deferredDispatch, reportDiagnostic) => {
      cmd(msg, model).then(
        resultMsg => deferredDispatch(resultMsg),
        err => reportDiagnostic({ source: 'command', error: err }),
      )
    },
  })

  const subDisposers: Array<() => void> = []
  for (const sub of config.subscriptions ?? []) {
    subDisposers.push(startPromiseSub(sub, kernel))
  }

  return {
    state: kernel.cell,
    dispatch: kernel.dispatch,
    onEvent: kernel.subscribeEvents,
    onDiagnostic: kernel.subscribeDiagnostics,
    dispose: () => { for (const d of subDisposers) d() },
  }
}
```

Same kernel, different host shape. The Promise runtime exposes a simpler surface — no Layer, no Stream — but the kernel underneath is identical. A user of `oak-runtime-promise` doesn't import Effect; a user of `oak-runtime-effect` doesn't import Promise utilities.

### What every host does, summarized

The minimum work to be a host:

1. Pick a command type. (`Effect<Msg>`, `Observable<Msg>`, `() => Promise<Msg>`, whatever.)
2. Implement `scheduleCommand` against that type. The implementation must (a) execute the command, (b) call `deferredDispatch(resultMsg)` on success on an async boundary, (c) call `reportDiagnostic` on failure.
3. Pick a subscription type. (`Stream<Msg>`, `Observable<Msg>`, polling-with-cleanup, etc.)
4. Implement subscription startup: given a sub and the kernel, return a disposer that tears the sub down. The sub's lifecycle (restart on state change, etc.) is the host's design call.
5. Optionally adapt the kernel's listener-set events and diagnostics to the runtime's preferred shape (Stream, Observable, EventTarget, etc.).
6. Provide a lifecycle entry point appropriate to the runtime (a `Layer` for Effect, a `start()`/`dispose()` for Promise, etc.).

That's all. The kernel does the rest.

## Selectors and memoization: a user concern, not a framework concern

This is the deliberate non-coupling that the previous plan got wrong.

The React view package exposes a `useOakSelector` hook that takes a function `(m: M) => A` and an optional equality check. It does not, and does not need to, know anything about how that function was produced. Specifically:

- It does not depend on `proxy-memoize`.
- It does not depend on `reselect`.
- It does not depend on any signal library.
- It does not export its own selector-construction API.

The shape:

```ts
// oak-react

export function useOakSelector<M, Msg, A>(
  selector: (m: M) => A,
  eq: (a: A, b: A) => boolean = Object.is,
): A {
  const kernel = useOakKernel<M, Msg>()
  // useSyncExternalStore + selector + eq dedup of selected result
}
```

Users construct selectors however they like:

```ts
// Trivial inline selector
const count = useOakSelector(m => m.count)

// Selector that always returns a new object — caller's problem to dedup
const portfolio = useOakSelector(
  m => ({ value: m.value, percent: m.percent }),
  shallowEqual,
)

// Memoized with proxy-memoize, defined once at module scope
import { memoize } from 'proxy-memoize'
const selectExpensive = memoize((m: AppModel) => expensive(m.prices, m.accounts))

function Component() {
  const value = useOakSelector(selectExpensive)
  // ...
}

// Memoized with reselect, same pattern
import { createSelector } from 'reselect'
const selectReselect = createSelector(
  [(m: AppModel) => m.prices, (m: AppModel) => m.accounts],
  (prices, accounts) => derive(prices, accounts),
)

function ComponentB() {
  const value = useOakSelector(selectReselect)
  // ...
}
```

The selector library — if any — is the user's choice, lives in user code, and is wrapped around the user's function *before* it's passed to `useOakSelector`. The view package has zero opinion about which library, or whether any library is used at all.

### Why this matters

Three reasons:

1. **Composability.** A user choosing `proxy-memoize` doesn't drag it into every project that uses `oak-react`. A user choosing nothing pays for nothing.
2. **Future-proofing.** If a new and better selector library comes out in 2027, users adopt it without waiting for `oak-react` to release a new version. If the user has fifty selectors using `proxy-memoize` and wants to swap to something else, the migration is per-selector, not per-app.
3. **Honesty about coupling.** The thing `useOakSelector` actually needs is: a way to read the model, a way to subscribe to changes, and an equality check on the projected value. None of that requires a memoization library. Pretending otherwise would lock the view package to a specific dependency the user might not want.

The minimum guidance the docs provide:

- For trivial selectors that return primitives or that already return the same reference, the default `Object.is` equality is fine.
- For selectors that return new objects each time, pass a structural-equality function as the second argument, OR wrap the selector with a memoizer of your choice.
- `proxy-memoize` is a recommended choice for non-trivial selectors over an immutable model. It tracks property access and caches by what was actually read; usually you don't need to pass a custom equality at all because the memoized function returns the same reference when its tracked inputs are unchanged.
- `reselect` is a fine choice if you already know it.
- If you want a custom equality check without memoization, just pass `eq` to `useOakSelector`.

That's the entire selector story. The view package is small; the user's memoization choice is theirs.

### `useOakSelector` implementation, briefly

```ts
// oak-react

export function useOakSelector<M, Msg, A>(
  selector: (m: M) => A,
  eq: (a: A, b: A) => boolean = Object.is,
): A {
  const kernel = useOakKernel<M, Msg>()
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const { subscribe, getSnapshot } = useMemo(() => {
    let cached = selectorRef.current(kernel.cell.value)
    return {
      subscribe: (onChange: () => void) =>
        kernel.cell.subscribe(() => {
          const next = selectorRef.current(kernel.cell.value)
          if (!eqRef.current(cached, next)) {
            cached = next
            onChange()
          }
        }),
      getSnapshot: () => {
        const next = selectorRef.current(kernel.cell.value)
        if (!eqRef.current(cached, next)) cached = next
        return cached
      },
    }
  }, [kernel])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
```

Notes:

- `Object.is` default is reference-equality (with proper NaN handling). Selectors returning primitives or stable references work out of the box.
- A selector wrapped with `proxy-memoize` returns the same reference when its tracked inputs are unchanged, so `Object.is` works correctly and there's no need to pass an `eq` argument.
- For unmemoized selectors that return fresh objects, the caller passes their own `eq`. This is the explicit-cost path — there's no hidden memoization, what you write is what runs.

The hook is ~30 lines, depends on nothing but React itself, and works against any `OakKernel`.

## Package structure

```
packages/
  oak-core/          — kernel: Cell, makeKernel, types. No async deps.
  oak-runtime-effect/ — Effect runtime: Layer, OakService, Stream-shaped events/diagnostics, Effect/Stream commands/subs.
  oak-runtime-promise/ — Promise runtime: start()/dispose(), Promise commands, listener-set events.
  oak-react/         — React adapter: useOakKernel, useOakState, useOakDispatch, useOakSelector. Selector-library-agnostic.
  example-counter/   — Uses oak-core + oak-runtime-promise + oak-react. No Effect dependency.
  example-http/      — Uses oak-core + oak-runtime-effect + oak-react.
  example-zen-sim/   — The real app. oak-core + oak-runtime-effect + oak-react.
```

Each runtime depends on `oak-core`. The view depends on `oak-core` only. Examples mix and match per use case.

## Migration order

A staged plan that lands the new factoring incrementally.

### Stage 1: extract the kernel

1. Create `oak-core` package.
2. Move `Cell`, kernel construction, kernel types into it. Drop all Effect imports.
3. Implement `makeKernel<M, Msg, Cmd>` with the protocol described above. Test it standalone with a fake `scheduleCommand` that records calls.
4. The existing `oak` package keeps existing examples working by depending on `oak-core` and re-exporting; this is temporary scaffolding.

### Stage 2: build the Effect runtime

1. Create `oak-runtime-effect` package.
2. Move all Effect-specific code from the current `oak` package into it: `OakService` tag, `Layer`, `Stream`-shaped events/diagnostics, command scheduling, subscription runner with `shouldReplace`/`switch: true`.
3. `oak-runtime-effect` depends on `oak-core` for the kernel.
4. Update existing examples to import from `oak-runtime-effect`.

### Stage 3: simplify the React adapter

1. Rewrite `oak-react` to depend on `oak-core` only.
2. Drop `sync-store.ts` (no longer needed — Cell is already synchronous).
3. Implement `useOakSelector` as described, no selector library coupling.
4. Update React examples to wrap selectors with `proxy-memoize` where useful, demonstrating the user-side memoization pattern.

### Stage 4: validate the protocol with a Promise runtime

1. Create `oak-runtime-promise` package.
2. Implement against the same kernel. Write a counter example using it instead of the Effect runtime.
3. The React example should work against the Promise runtime without changes — proving the view adapter is truly runtime-agnostic.
4. If the Promise runtime feels awkward or requires the kernel to bend, the protocol has leaked and needs adjustment. This is the validation gate; do not skip.

### Stage 5: deprecate the legacy `oak` package

1. Once all examples have migrated to `oak-core` + `oak-runtime-effect`, mark `oak` as deprecated and have it re-export from `oak-runtime-effect` for backward compatibility.
2. Eventually remove `oak` entirely or repurpose as a metapackage.

### Stage 6 (optional): more runtimes

If there's appetite, write `oak-runtime-rxjs` or `oak-runtime-signals`. Each is a separate package, a separate decision, can be added or not independently.

## Out of scope

- A unified subscription type at the kernel level. Subs belong to runtimes; the kernel doesn't define them.
- A selector library inside any Oak package. Selector memoization is a user concern.
- Stream/Observable surfaces on the kernel. The kernel's events and diagnostics are listener-set surfaces; each runtime adapts them to its preferred shape.
- Multi-program coordination at the framework level. Multi-Oak is a user-side pattern; programs compose via the runtime's mechanisms (Layer merging for Effect, manual disposal for Promise, etc.).
- Devtools, time-travel, replay. These are downstream consumers of the events listener-set surface; they're libraries someone might build on top of Oak, not part of Oak itself.

## Open questions / decisions

**1. Should the kernel guarantee re-entrance protection on `dispatch`, or rely on hosts to call it only at safe boundaries?**

Recommendation: the kernel guarantees it. The `dispatch` function maintains a processing flag and a pending queue; if `dispatch` is called while another `dispatch` is on the stack, the inner message is queued. This costs ~10 lines and prevents a class of "I called dispatch from inside a sync subscriber and now everything's weird" bugs that the host shouldn't have to defend against.

**2. Should `scheduleCommand` receive a synchronous `dispatch` or only the `deferredDispatch`?**

Recommendation: only `deferredDispatch`. Forcing the host to use the deferred form guarantees no command continuation can re-enter the current dispatch frame, regardless of whether the runtime's machinery happens to yield. The deferred form is internally `(m) => queueMicrotask(() => kernel.dispatch(m))`.

**3. Should the kernel expose a `dispose()` method, or is teardown the runtime's job?**

Recommendation: runtime's job. The kernel has no resources that need disposal — it's just a Cell and some listener sets. Runtimes that fork fibers or start interval timers handle their own cleanup; the kernel doesn't need to know.

**4. Should `Update` return `[Mutation<M>, Cmd[]]` or `[M, Cmd[]]`?**

Recommendation: keep `Mutation<M>` for now. It's optic-friendly and lets users compose updates with `Optic.modify`. Could be revisited later. Either signature is compatible with the kernel.

**5. What's the React adapter's story for SSR?**

Recommendation: same as before — `useOakKernel` returns from a `useState` initializer so the kernel is built once on the client. The synchronous Cell makes SSR trivial: `getServerSnapshot` is the same as `getSnapshot`, both returning `cell.value`. No fibers, no Streams, no async-bridge gymnastics.

**6. How do tests test a kernel without a runtime?**

Answer: write a test runtime that records command calls instead of executing them. The kernel's protocol makes this trivial:

```ts
const calls: Array<{cmd: TestCmd, msg: Msg}> = []
const kernel = makeKernel({
  init, update,
  scheduleCommand: (cmd, msg) => { calls.push({cmd, msg}) },
})
kernel.dispatch({_tag: 'SomeMsg'})
expect(calls).toEqual([...])
```

The kernel is fully deterministic in this mode. A whole test suite can run without ever importing a real runtime.

## Success criteria

- `oak-core` has zero runtime dependencies (no Effect, no RxJS, no nothing). `pnpm view oak-core dependencies` returns empty.
- `oak-runtime-promise` can run the counter example without importing Effect.
- `oak-react` can render the counter example against either runtime without changes to the React code.
- The same `useOakSelector` works with bare functions, `proxy-memoize`-wrapped functions, and `reselect`-wrapped functions, without `oak-react` importing any of them.
- The kernel can be tested in isolation with a fake `scheduleCommand`, no async runtime imported.
- All existing zen-sim and example code continues to work via the migration path.
- The `oak-runtime-effect` package, when imported alone, provides the full current Oak developer experience.

## Summary

Oak is a TEA kernel, a set of runtime adapters, and a set of view adapters. The kernel is plain TypeScript and is generic over command type. Runtimes wire command execution, subscription lifecycles, and events/diagnostics adaptation to their preferred async paradigm. Views talk only to the kernel's synchronous surface and remain runtime-agnostic. Selector memoization is a user concern, satisfied by libraries like `proxy-memoize` wrapped around user-defined selector functions before they reach the view's `useOakSelector` hook.

The result: a small, layered, honest architecture where each piece does one thing and the boundaries are real package boundaries enforced by import graphs, not conventions enforced by discipline. The kernel is provably correct in isolation. Runtimes are leaves, not foundations. Views are portable across runtimes. The whole thing is what `typescript-tea/core` was trying to be, designed with the benefit of the conversations and dead-ends that produced this plan.
