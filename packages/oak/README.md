# Oak

Oak is a small reactive state library built on [Effect-TS](https://effect.website). It follows an Elm-style shape:

- `Model` is your state
- `Msg` is your message union
- `Update` turns a message into a pure `Mutation` plus follow-up commands
- `subscriptions` are long-lived streams that emit messages

Programs are isolated units with their own state, dispatch, inbox, and subscriptions. They compose with Effect `Layer` and run inside a `ManagedRuntime`.

## Core Types

```typescript
type Mutation<M> = (model: M) => M

type Cmd<M, Msg, S> = (msg: Msg, model: M) => Effect<Msg, never, S>

type Update<M, Msg, S> = (msg: Msg) => readonly [Mutation<M>, ReadonlyArray<Cmd<M, Msg, S>>]
```

`Update` does not receive the current model directly. Instead, it returns a pure mutation function. Oak applies that mutation atomically to the current state, then runs the returned commands with the triggering message and the post-mutation model.

## Defining Messages

Oak does not generate messages for you. Define them explicitly. Effect's `Data.TaggedEnum` works well:

```typescript
import { Data } from 'effect'

export type CounterMsg = Data.TaggedEnum<{
  Increment: {}
  Decrement: {}
}>

export const CounterMsg = Data.taggedEnum<CounterMsg>()
```

## Defining a Program

```typescript
import { Data, Schedule, Stream } from 'effect'
import { makeOak, type Update } from '@oak/oak'

type SimMsg = Data.TaggedEnum<{
  Play: {}
  Pause: {}
  Ticked: {}
}>

const SimMsg = Data.taggedEnum<SimMsg>()

type SimModel = {
  readonly status: 'paused' | 'playing'
  readonly tick: number
}

const update: Update<SimModel, SimMsg, never> = SimMsg.$match({
  Play: () => [(model) => ({ ...model, status: 'playing' }), []],
  Pause: () => [(model) => ({ ...model, status: 'paused' }), []],
  Ticked: () => [(model) => ({ ...model, tick: model.tick + 1 }), []],
})

const sim = makeOak({
  name: 'SimProgram',
  init: { status: 'paused', tick: 0 } satisfies SimModel,
  update,
  subscriptions: [
    {
      shouldReplace: (prev, curr) => prev.status !== curr.status,
      run: (model) =>
        model.status === 'paused'
          ? Stream.empty
          : Stream.repeat(SimMsg.Ticked()).pipe(Stream.schedule(Schedule.spaced('1 seconds'))),
    },
  ],
})
```

`makeOak` returns a program handle:

- `sim.layer` — the scoped Effect `Layer` that starts and owns the program runtime
- `sim.tag` — the typed runtime address for locating this running program in an Effect environment
- `sim.name` — the program identifier and exact Effect tag key

The advanced runtime surface available from the tag has:

- `state` — the program `SubscriptionRef<Model>`
- `events` — a read-only `Stream<{ message, model }>` for observability
- `diagnostics` — a read-only stream of non-interruption failures/defects observed by the program
- `dispatch(message)` — an `Effect<void>` that enqueues a message into the program

`makeOak` uses `name` exactly as the `Context.GenericTag` key. If multiple Oak programs are
provided to the same runtime, give each one a unique name. Oak does not add automatic namespacing.

Oak uses Effect services here as a runtime addressing mechanism, not because
application code is expected to swap program implementations through dependency
injection. The user-facing unit is still the Oak program; the service is the
running program surface inside an Effect environment.

## Composing Programs

Use `makeOakLayer` to compose one or more program handles into the Effect layer
your application runtime will provide:

```typescript
import { makeOakLayer } from '@oak/oak'
import { counter } from '@oak/example-prog-counter'
import { timer } from '@oak/example-prog-timer'

export const AppLayer = makeOakLayer(counter, timer)
```

`makeOakLayer` is an Oak-shaped wrapper around `Layer.mergeAll`. It keeps the
Effect lifecycle boundary explicit while avoiding repeated `.layer` plumbing in
application setup code.

## Commands

Commands run after Oak has applied the mutation:

```typescript
const update: Update<Model, Msg, SearchApi> = Msg.$match({
  Search: ({ query }) => [
    (model) => ({ ...model, loading: true }),
    [
      (_msg, model) =>
        Effect.gen(function* () {
          const api = yield* SearchApi
          const results = yield* api.search(query, model.filters)
          return Msg.SearchResults({ results })
        }),
    ],
  ],
  SearchResults: ({ results }) => [(model) => ({ ...model, loading: false, results }), []],
})
```

Commands receive:

- the triggering message
- the model after the mutation has been applied

They return the next message to enqueue into the program.

## Subscriptions

Subscriptions watch state and emit messages:

```typescript
interface Sub<Model, Msg, S> {
  shouldReplace: (prev: Model, curr: Model) => boolean
  run: (model: Model) => Stream<Msg, never, S>
}
```

When `shouldReplace` returns `true`, Oak interrupts the previous stream and starts a new one by calling `run` with the current model.

## Dispatch Semantics

Dispatch is queue-backed and ordered:

1. `dispatch(message)` enqueues the message into the program inbox
2. A single scoped consumer loop dequeues messages in FIFO order
3. Oak calls `update(message)` to get a mutation and commands
4. Oak applies the mutation via `SubscriptionRef.modify`
5. Oak publishes an event `{ message, model }` to the program's read-only event stream
6. Oak forks commands in the program scope
7. each command's returned message is enqueued back into the same program

Services required by commands are captured at startup with `Effect.context<S>()`, so `dispatch` itself stays `Effect<void>` from the consumer's point of view even when commands need additional dependencies.

Non-interruption failures or defects in message processing are published to the running program's `diagnostics` stream and the inbox consumer continues with the next queued message. Scope interruption is not treated as a diagnostic.

## Events

Running Oak programs expose a read-only event stream for devtools and diagnostics:

```typescript
interface OakEvent<Model, Msg> {
  readonly message: Msg
  readonly model: Model
}
```

Each consumer of `events` gets its own subscription to the underlying broadcast channel.

## Diagnostics

Running Oak programs expose a diagnostics stream for failures and defects observed inside the program:

```typescript
interface OakDiagnostic {
  readonly source: 'command' | 'dispatch' | 'message' | 'subscription'
  readonly cause: Cause.Cause<unknown>
}
```

Diagnostics are emitted for non-interruption causes from the message consumer, command fibers, subscriptions, and dispatch enqueue failures.
