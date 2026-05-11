# Oak Architectural Plan: Synchronous Kernel, Effect at the Edges

## Goal

Move Oak from a fully-Effect kernel (Queue + consumer fiber + `SubscriptionRef` + sync-store bridge) to a **vanilla synchronous kernel** built on a hand-rolled `Cell<M>`, with Effect retained at the boundaries (commands, subscriptions, devtools events, diagnostics, runtime scope).

The change removes the fiber-turn gap between `dispatch(msg)` and `cell.value`, which is the root cause of the React sync-store complexity. The kernel becomes smaller, more honest about TEA's inherently synchronous semantics, and structurally immune to message re-entrance.

## The core insight

TEA's update loop is fundamentally synchronous: `(M, Msg) → [M, Cmd[]]` is a pure function, followed by a state write and a notify. Wrapping it in Effect's runtime adds a fiber turn and a `Queue` hop for no semantic gain — JS's single-threaded execution already enforces "one message at a time" for synchronous code, which is what the `Queue` was previously doing across fibers.

Effect belongs in three places where it earns its keep:
- **Commands** — typed errors, structured concurrency, context, retries, cancellation.
- **Subscriptions** — Stream's operator library, switch-map lifecycle, scoped resources.
- **Runtime scope** — owning program lifetime, providing `Context<S>` to commands and subs.

Effect does **not** belong in the dispatcher. The dispatcher is a leaf computation: synchronous in, synchronous out, no composition, no failure propagation, no cancellation. A function call.

## What stays

- **OakProgram, OakTag, OakService.** The public shape of a program (name, tag, layer) is unchanged.
- **Commands as `Effect<Msg, never, S>`.** Fully Effect-typed; run via `Effect.runFork` with the program's captured context.
- **Subscriptions as `Stream<Msg, never, S>`** with the current `{ shouldReplace, run }` shape. The engine's `flatMap({ switch: true })` lifecycle is unchanged.
- **Events PubSub** for devtools/bus consumers, exposed as `Stream<OakEvent<M, Msg>>`.
- **Diagnostics PubSub** for non-interrupt defects, exposed as `Stream<OakDiagnostic>`.
- **Captured `Context<S>`** via `Effect.context<S>()` at program start.
- **`makeOak` / `makeOakLayer`** entry points and their type signatures.

## What goes

- **`Queue.unbounded<Msg>` inbox.** No longer needed; JS execution serializes synchronous dispatch.
- **`runMessageConsumer` consumer fiber.** No longer needed; dispatch runs in-line.
- **`SubscriptionRef<M>` as model storage.** Replaced by `Cell<M>`. The change-stream view stays available as `cell.changes` for subs and devtools.
- **`packages/oak-react/src/sync-store.ts`.** The generation-guarded fiber-lifecycle bridge becomes unnecessary; React reads the cell directly.
- **The `Effect.gen` wrapping around the update body.** Replaced by a plain function with try/catch.
- **The `Mutation<M>` type as a public concept** (optional — see "Open questions"). Update can return `M` directly; the engine writes whatever `update(msg)` produces.

## The new kernel

### Cell

A synchronous mutable cell with Equal-based dedup, a listener set, and a Stream view. Roughly 30 lines.

```ts
import { Effect, Equal, Stream } from 'effect'

export class Cell<M> {
  private current: M
  private readonly listeners = new Set<(m: M) => void>()

  constructor(initial: M) {
    this.current = initial
  }

  get value(): M {
    return this.current
  }

  set(next: M): void {
    if (Equal.equals(this.current, next)) return
    this.current = next
    for (const listener of this.listeners) listener(next)
  }

  modify<A>(f: (m: M) => readonly [A, M]): A {
    const [a, next] = f(this.current)
    this.set(next)
    return a
  }

  subscribe(listener: (m: M) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  get changes(): Stream.Stream<M> {
    return Stream.async<M>((emit) => {
      const unsub = this.subscribe((m) => { emit.single(m) })
      return Effect.sync(unsub)
    })
  }
}
```

Notes:
- `set` is a no-op if `Equal.equals` matches. This preserves the existing semantics where redundant writes don't notify.
- Listeners fire synchronously in `set`. This is the property that makes the React read path trivial.
- `changes` is a derived stream view, not the source of truth. It exists for the Sub system, devtools, and anything else that wants stream operators on state evolution. Stream consumers receive emissions on a fiber turn, never inside `set`'s synchronous notify.

### Synchronous `dispatch`

The kernel's dispatcher is a vanilla function. It runs the update, writes the cell, publishes the event, and forks commands. No Effect wrapping.

```ts
function dispatch(msg: Msg): void {
  let nextModel: M
  let commands: ReadonlyArray<Cmd<M, Msg, S>>

  try {
    const result = def.update(msg, cell.value)
    nextModel = result[0]
    commands = result[1]
  } catch (err) {
    reportDiagnostic('message', Cause.die(err))
    return
  }

  try {
    cell.set(nextModel)
  } catch (err) {
    reportDiagnostic('message', Cause.die(err))
    return
  }

  Effect.runFork(PubSub.publish(events, { message: msg, model: nextModel }))

  for (const cmd of commands) {
    scheduleCommand(cmd, msg, nextModel)
  }
}
```

Notes:
- Defects in `update` and `cell.set` are caught with try/catch and reported to the diagnostics PubSub. This preserves the existing diagnostic surface without an Effect runtime around the body.
- The event publish is fire-and-forget. Consumers read via `Stream.fromPubSub(events)` and naturally cross a fiber boundary.
- `scheduleCommand` fork-runs the command with deferred-dispatch on its result (next section).

### Deferred dispatch and command scheduling

Commands and subs need a way to dispatch that doesn't risk re-entering the synchronous frame they were scheduled from. The mechanism is a microtask boundary on the inner dispatch:

```ts
const dispatchDeferred = (msg: Msg): Effect.Effect<void> =>
  Effect.sync(() => { queueMicrotask(() => dispatch(msg)) })

function scheduleCommand(
  cmd: Cmd<M, Msg, S>,
  msg: Msg,
  model: M,
): void {
  Effect.runFork(
    Effect.suspend(() => cmd(msg, model)).pipe(
      Effect.flatMap(dispatchDeferred),
      Effect.provide(context),
      Effect.catchAllCause((cause) => reportDiagnosticEff('command', cause)),
    ),
  )
}
```

The `queueMicrotask` is structural defense: most commands cross an async boundary internally (HTTP, sleep, stream pull) and won't ever land their continuation in the same call frame, but `Effect.runFork` does not *guarantee* an async boundary for purely synchronous Effects. The microtask makes the guarantee explicit at the framework layer so command authors don't have to think about it.

### Subscription runner

Subscriptions stream into `dispatchDeferred` for the same reason:

```ts
function runSub<M, Msg, S>(
  sub: Sub<M, Msg, S>,
): Effect.Effect<void, never, S> {
  return cell.changes.pipe(
    Stream.zipWithPrevious,
    Stream.filter(([prev, curr]) =>
      Option.match(prev, {
        onSome: (p) => sub.shouldReplace(p, curr),
        onNone: () => true,
      }),
    ),
    Stream.map(([, curr]) => curr),
    Stream.flatMap((model) => sub.run(model), { switch: true }),
    Stream.runForEach(dispatchDeferred),
  )
}
```

This is structurally identical to the current `runSub`, with `store.changes` (from `SubscriptionRef`) replaced by `cell.changes` (Stream view of the cell) and the terminal `dispatch` replaced by `dispatchDeferred`. The `switch: true` lifecycle and `shouldReplace` semantics are unchanged.

### Why re-entrance is now impossible

There were three theoretical paths to re-entrance:

1. **Command continuation lands synchronously.** Closed by `queueMicrotask` in `dispatchDeferred`. Even an `Effect.succeed(Msg.Foo())` command can't dispatch inside its scheduler's frame.
2. **Sub stream emits synchronously into `runForEach`.** Already not a problem — `Stream.runForEach` callbacks fire on a fiber turn, not inside the cell's notify. Belt-and-suspenders via `dispatchDeferred` anyway.
3. **A direct sync caller (React handler) dispatches from inside another dispatch.** This would require user code to call `dispatch` from within a `cell.subscribe` listener — which is something users can't do through the framework's public API (subs use streams, not direct cell subscriptions). If a user wires this up out-of-band, document that direct dispatch is not re-entrant and they should use a Sub.

The net effect: the kernel has no queue, no flag, no guard, and is structurally serial.

## The Effect boundary, concretely

### Commands

No public API change. `Cmd<M, Msg, S> = (msg: Msg, model: M) => Effect<Msg, never, S>` as today. Command authors write Effects the same way. The only difference is internal: the resulting message goes through `dispatchDeferred` instead of `dispatch` directly. Invisible to the author.

### Subscriptions

No public API change. `Sub<M, Msg, S> = { shouldReplace, run }` as today. The engine reads from `cell.changes` instead of `SubscriptionRef.changes` — identical Stream shape.

### Events and devtools

`OakService.events: Stream<OakEvent<M, Msg>>` unchanged. Internally backed by a `PubSub<OakEvent>` published to *inside* the synchronous dispatch (after `cell.set`, before commands fork). Subscribers consume on fiber turns; merging across programs (`Stream.mergeAll`) works as today.

### Diagnostics

`OakService.diagnostics: Stream<OakDiagnostic>` unchanged. Two changes internally:
- Sync defects in `update` and `cell.set` are caught via try/catch and reported.
- `reportDiagnostic` has two forms: a synchronous one for use inside the dispatcher, and an Effect-shaped `reportDiagnosticEff` for use inside command/sub error handlers.

```ts
function reportDiagnostic(source: OakDiagnosticSource, cause: Cause.Cause<unknown>): void {
  if (Cause.isInterruptedOnly(cause)) return
  Effect.runFork(PubSub.publish(diagnostics, { source, cause }))
  Effect.runFork(logProgramCause(cause, def, source))
}

const reportDiagnosticEff = (source: OakDiagnosticSource, cause: Cause.Cause<unknown>) =>
  Effect.sync(() => reportDiagnostic(source, cause))
```

### Runtime scope

`OakProgram.layer` is still a `Layer.scoped(tag, ...)`. The layer's scoped Effect:
1. Creates the `Cell<M>` (vanilla, no Effect).
2. Creates the PubSubs for events and diagnostics.
3. Captures `Effect.context<S>()`.
4. Captures `Effect.scope` for forking commands.
5. Forks the subscription runners via `Effect.forkScoped`.
6. Returns the `OakService` with `state`, `events`, `diagnostics`, `dispatch`.

`OakService.state` exposes a read-only view of the cell rather than a `SubscriptionRef`. Concretely: `{ get value(): M; subscribe(listener): () => void; readonly changes: Stream<M> }`. The current `SubscriptionRef` shape leaks Effect's writability into the public type, which we don't want — the only legitimate way to mutate state is `dispatch`.

`OakService.dispatch` retains its current type `Dispatch<Msg, never> = (msg: Msg) => Effect<void>`. Internally this is `(msg) => Effect.sync(() => dispatch(msg))`. This preserves the Effect-shaped public dispatch for code that's already Effect-ful, while the internal sync function is what actually does the work.

## React layer

The React package becomes substantially smaller. `sync-store.ts` is deleted. The hooks collapse.

### `useOakSelector`

```ts
export function useOakSelector<I, M, Msg, A>(
  tag: Context.Tag<I, OakService<M, Msg>>,
  selector: (model: M) => A,
  eq: (a: A, b: A) => boolean = Equal.equals,
): A {
  const runtime = useOakRuntime<I>()
  const service = useMemo(
    () => runtime.runSync(Effect.flatMap(tag, Effect.succeed)),
    [runtime, tag],
  )

  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const { subscribe, getSnapshot } = useMemo(() => {
    let last = selectorRef.current(service.state.value)
    return {
      subscribe: (onChange: () => void) =>
        service.state.subscribe(() => {
          const next = selectorRef.current(service.state.value)
          if (!eqRef.current(last, next)) {
            last = next
            onChange()
          }
        }),
      getSnapshot: () => {
        const next = selectorRef.current(service.state.value)
        if (!eqRef.current(last, next)) last = next
        return last
      },
    }
  }, [service])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
```

Notes:
- No fibers, no Stream subscriptions, no generation guards.
- Selectors are pure `M → A` functions, applied inside `getSnapshot`.
- The "last selected" cache exists only for selector-result equality, not for sync bridging.

### `useDispatch`

```ts
export function useDispatch<I, M, Msg>(
  tag: Context.Tag<I, OakService<M, Msg>>,
): (message: Msg) => void {
  const runtime = useOakRuntime<I>()
  const service = useMemo(
    () => runtime.runSync(Effect.flatMap(tag, Effect.succeed)),
    [runtime, tag],
  )
  return useCallback((msg: Msg) => { service.dispatchSync(msg) }, [service])
}
```

If we expose `dispatchSync` on `OakService` (see "Open questions"), this is one line. If not, we keep the current `runtime.runFork(Effect.flatMap(tag, svc => svc.dispatch(msg)))` shape, which still works — it just routes through `Effect.sync(() => dispatch(msg))` instead of `Queue.offer`.

### `useManagedRuntime` and provider

Unchanged. The runtime still owns layer lifecycle, command fibers, sub fibers, and program scope. Only the state-read path is simplified.

## File-by-file impact

**`packages/oak/src/types.ts`**
- Add `Cell<M>` interface (or class type).
- Replace `state: SubscriptionRef<M>` on `OakService` with a read-only `Cell`-shaped view: `state: { readonly value: M; subscribe: (l: (m: M) => void) => () => void; readonly changes: Stream<M> }`.
- Consider whether `Mutation<M>` and `Update<M, Msg, S>` should be revised. Current shape: `(msg) => [Mutation<M>, Cmd[]]`. Could be simplified to `(msg, model) => [M, Cmd[]]` — directly returning the next model. This collapses the optic-style mutation indirection but is a public API change. **Defer this decision to a follow-up.**

**`packages/oak/src/oak.ts`**
- Rewrite `processMessage` as vanilla `dispatch`.
- Delete `runMessageConsumer` and the `Queue` machinery.
- Replace `SubscriptionRef.make` with `new Cell(def.init)`.
- Adjust `forkCommand` to use `dispatchDeferred`.
- Adjust `runSub` to read from `cell.changes` and feed `dispatchDeferred`.
- Add try/catch around the synchronous update body, route to `reportDiagnostic`.
- Add `dispatchSync` to `OakService` (optional, see "Open questions").

**`packages/oak/src/index.ts`**
- Export `Cell` if we want it as a public type. Probably yes, for consumers who might want a cell-shaped read API at the top of their program tree.

**`packages/oak-react/src/sync-store.ts`**
- Delete.

**`packages/oak-react/src/index.ts`**
- Rewrite `useOakSelector` (currently `useSelector`) to use `useSyncExternalStore` directly over `cell.subscribe` / `cell.value`.
- Rewrite `useDispatch` to call the sync dispatch.
- Drop the `stateStoreCache` WeakMap and `getOakStateStore` machinery.
- `useManagedRuntime` and `OakRuntimeContext` stay as-is.

**`packages/oak-react/test/sync-store.test.ts`**
- Delete.

**`packages/oak-react/test/use-managed-runtime.test.ts`**
- Likely keep with minor adjustments.

**`packages/oak/test/make-oak-layer.test.ts`**
- Keep; the layer-composition surface is unchanged.

**Examples (`example-prog-counter`, `example-prog-timer`, `example-prog-cmd`, `example-http`, `oak-react-example`, `oak-next-example`)**
- No change required if `update` signature is preserved.
- If `Update` is simplified to return `M` directly, update each example's `update.ts`.

## Migration order

A safe, incremental path that doesn't break the world between steps:

1. **Land `Cell`.** Add `packages/oak/src/cell.ts`, export from `index.ts`. Pure addition, no consumers yet.
2. **Land `dispatch` + `dispatchDeferred` as internal functions** inside `oak.ts`, alongside the existing `processMessage`. New kernel coexists with old.
3. **Switch the runtime resources to use `Cell` instead of `SubscriptionRef`.** Update `OakService.state` shape. This breaks `oak-react`'s `sync-store.ts`, so:
4. **Rewrite `oak-react`** to read directly from `cell.value` / `cell.subscribe`. Delete `sync-store.ts` and its test.
5. **Remove the `Queue` and consumer fiber from `oak.ts`.** Cut over to the synchronous `dispatch`.
6. **Verify examples.** Counter, timer, command, HTTP, React, Next — each runs.
7. **Update tests.** Existing kernel tests that asserted on queue behavior or `SubscriptionRef` shape get rewritten against the new API.
8. **Optional cleanup pass on `Update` signature.** If we want to collapse `[Mutation, Cmd[]]` to `[M, Cmd[]]`, do it here as a separate commit. This is the only step that touches example code.

Steps 1–2 are additive and safe. Steps 3–5 are coupled; do them in one PR. Step 6 is verification. Steps 7–8 are follow-up.

## What's NOT in scope

- **`@effect-atom/atom` adoption.** Discussed but deliberately deferred. The `Cell` is private machinery; bringing in Atom would either duplicate that with `AtomRef`, or expose atom-graph concepts that aren't part of Oak's vocabulary. Revisit when there's a concrete need for fine-grained slice reactivity (which is the only thing Atom's Registry gives us that a single Cell doesn't).
- **Fine-grained slice reactivity.** A program is one `Cell<M>`. Multiple components selecting different parts of `M` all subscribe to the same cell and dedup via `Equal.equals` on selector output. If profiling later shows this is expensive for a large model with many selectors, that's the trigger to revisit Atom or a slice abstraction. Not now.
- **`OakRegistry` / global aggregator.** Already deferred. Bus consumers continue to merge program buses manually via `Stream.mergeAll`.
- **Synchronous `Cmd`s.** Commands stay Effect-typed. If a user wants "synchronous follow-up to a message," they should encode it as a follow-up message in the same update — that's TEA-idiomatic and avoids a class of "sometimes sync, sometimes async" confusion.
- **Time-travel debugging.** A natural future devtools feature that benefits from event PubSub + Cell snapshots, but not part of this work.

## Open questions / decisions

A short list of choices to make explicitly before or during implementation.

**1. Should `OakService.dispatch` return `Effect<void>` or be split into two?**

Today: `dispatch: Dispatch<Msg, never> = (msg) => Effect<void>`. After this change, the kernel is sync, so there are two reasonable shapes:

- *Single Effect-shaped dispatch.* Keep `dispatch: (msg) => Effect.sync(() => syncDispatch(msg))`. Sync callers wrap with `Effect.runSync`. React's `useDispatch` does `runtime.runSync(...)` instead of `runFork`.
- *Two methods on the service.* `dispatchSync: (msg) => void` for direct callers (React), `dispatch: (msg) => Effect<void>` for Effect-ful callers. The Effect version is `Effect.sync(() => dispatchSync(msg))`.

Recommendation: the two-method version. It makes the synchronous nature visible in the type, and React's hook becomes simpler. The Effect-shaped version still exists for symmetry with the rest of Effect.

**2. Should `Update` return `M` directly or keep `[Mutation<M>, Cmd[]]`?**

The `Mutation<M> = (M) => M` indirection exists so users can write `[Optic.modify(_count)(n => n+1), []]`-style updates. With the engine now writing `cell.set(mutation(currentModel))`, the indirection is no longer architecturally meaningful — the engine could just as well take the new model directly.

Two options:
- *Keep `Mutation<M>`.* Examples don't change. Optic-friendly.
- *Change to `(msg, model) => [M, Cmd[]]`.* More Elm-faithful. Examples become `(msg, model) => [{ ...model, count: model.count + 1 }, []]`. Loses optic ergonomics.

Recommendation: keep `Mutation<M>` for now (it's orthogonal to this work) and revisit as a separate change. Optionally allow *both* by accepting `M | Mutation<M>` in the position and detecting at runtime — but that adds a type-discrimination cost and probably isn't worth it.

**3. Where is the events PubSub published — sync or scheduled?**

Two options:
- *Sync inside `dispatch`.* `Effect.runFork(PubSub.publish(events, ...))` after `cell.set`. The fork is fire-and-forget; consumers see it on a fiber turn.
- *Scheduled via `queueMicrotask`.* Defer the publish to after the call stack unwinds.

Recommendation: sync inside `dispatch`. PubSub publication itself doesn't re-enter the dispatcher (consumers are always on fiber turns), so the microtask hop adds nothing. Plus this gives devtools the "tightest" event timing relative to state change.

**4. Should `Cell` be public API?**

If users want to expose a derived read-only view of program state at the top of their app (e.g., for non-React consumers), exporting `Cell` makes that ergonomic. If not, keep it internal.

Recommendation: export it. Cost of doing so is negligible; flexibility gained is real.

**5. Should `cell.subscribe` listeners receive the new model as an argument, or just a "changed" signal?**

Current sketch passes the new model: `subscribe(listener: (m: M) => void)`. React doesn't use the argument — it re-reads `cell.value`. But other consumers might.

Recommendation: pass the model. Costs nothing, and aligns with what `Stream.async`'s `emit.single` wants.

**6. Equal-based dedup in `cell.set` — is it always wanted?**

`Equal.equals` is structural; for plain JS objects it's reference equality. A model that's a plain object with a single field changed will *not* match `Equal.equals` to the prior value, so dedup is harmless. A model built from Effect data types (Schema-decoded, HashMap, etc.) gets free value equality.

The risk: a buggy `update` that returns a new object with the same contents would silently dedup. This is probably what we want, but worth being aware of.

Recommendation: keep the Equal.equals dedup. Document it.

## Success criteria

The refactor is done when:

- `packages/oak/src/oak.ts` has no `Queue`, no `runMessageConsumer`, no `SubscriptionRef`.
- `packages/oak-react/src/sync-store.ts` is deleted.
- `packages/oak-react/src/index.ts` is roughly half its current size.
- All examples (counter, timer, cmd, http, react-example, next-example) run.
- All existing tests pass (with updates).
- After `dispatch(msg)`, the next synchronous read of `cell.value` reflects the post-message state. (Add a test for this.)
- Re-entrance is structurally impossible: an attempt to call `dispatch` synchronously from inside a sub or command continuation lands on a microtask, not inside the original frame. (Add a test for this — e.g., a sub whose stream synchronously emits a message; verify ordering.)
- The kernel handles defects in `update` and `cell.set` without crashing the program, reporting via `diagnostics`. (Add a test for this.)

## Summary

Oak's identity is "TEA on Effect." This refactor sharpens that to "TEA in vanilla JS, with Effect at the boundaries where it's pulling weight." The kernel — Cell plus a synchronous dispatcher — is ~50 lines of plain code with no fibers, no queues, no streams. The Effect boundary handles what Effect is good at: commands as typed concurrent computations, subscriptions as scoped streams, devtools and diagnostics as PubSub-backed streams. React reads the Cell directly, eliminating the impedance bridge.

The change is local: most public types are unchanged, all examples keep working, and the migration is incremental. The benefits are immediate: simpler React integration, structurally serial dispatch, faster post-dispatch reads, and a smaller framework story to explain.
