# Oak V3 Prototype

This directory is an experiment in making Oak a small synchronous kernel with
runner-specific harnesses around it.

## Core Idea

The kernel is not an Effect service. It is a plain store:

```ts
const oak = makeOakKernel({
  name: 'counter',
  init: { count: 0 },
  handle: (msg, model) => ({
    mutation: (state) => ({ count: state.count + 1 }),
  }),
})

oak.dispatch({ _tag: 'Increment' })
oak.state.value
oak.state.subscribe((model) => {})
```

Dispatch is synchronous. It calls the handler with the pre-mutation model,
applies the returned mutation, emits an event, and emits any generic effect
instructions.

The kernel does not run those effect instructions. It only publishes them:

```ts
type Fx = { readonly _tag: 'Log'; readonly text: string }

const oak = makeOakKernel<Model, Msg, Fx>({
  name: 'counter',
  init,
  handle: () => ({
    mutation: (model) => model,
    effects: [{ _tag: 'Log', text: 'clicked' }],
  }),
})

oak.effects.subscribe(({ effect }) => {
  console.log(effect)
})
```

That is the main boundary: Oak decides state transitions; a harness decides how
to run effects.

## Why Effects Are Generic

Earlier Oak versions made commands part of the core type:

```ts
Cmd<M, Msg, Env> = (msg, model) => Effect<Msg, never, Env>
```

That made Oak inherently Effect-shaped. V3 instead has:

```ts
MsgHandler<M, Msg, Fx> = (msg, model) => {
  mutation: Mutation<M>
  effects?: ReadonlyArray<Fx>
}
```

For the Effect harness, `Fx` happens to be:

```ts
EffectCommand<M, Msg, Env> = (msg, model) => Effect.Effect<Msg, never, Env>
```

A Promise harness could use Promise-returning commands. An RxJS harness could
use Observables. A browser harness could use callback instructions. The kernel
does not care.

## Effect Runner

`runOakEffect` attaches an Effect harness to a kernel:

```ts
const oak = makeOakKernel<Model, Msg, EffectCommand<Model, Msg>>({
  name: 'counter',
  init,
  handle,
})

const running = runOakEffect(oak)

oak.dispatch({ _tag: 'Start' })

await running.dispose()
```

The runner owns:

- subscribing to `oak.effects`
- running Effect commands
- running Effect subscriptions
- dispatching produced messages back into the kernel
- scope/fiber disposal
- adapting kernel events and diagnostics to Effect `Stream`s

`EffectCommand` defaults `Env` to `never`:

```ts
type EffectCommand<M, Msg, Env = never> = (msg: Msg, model: M) => Effect.Effect<Msg, never, Env>
```

In Effect, `Env = never` means the command requires no services. Commands that
need services specify an environment and the runner receives a matching
`Context`.

```ts
type Command = EffectCommand<Model, Msg, HttpClient>

runOakEffect(oak, { context })
```

The current prototype keeps `context` optional for simplicity. A stricter API
could require `context` when `Env` is not `never`.

## Subscriptions

Subscriptions live in the Effect harness, not the kernel:

```ts
const tickSub: EffectSubscription<Model, Msg, never, number> = {
  select: (model) => model.intervalMs,
  run: (intervalMs) => Stream.repeatEffect(Effect.as(Effect.sleep(intervalMs), Msg.Tick())),
}

runOakEffect(oak, { subscriptions: [tickSub] })
```

The harness watches `oak.state`, selects a dependency value, deduplicates
adjacent values with `eq ?? Equal.equals`, switches the stream when the
dependency changes, and dispatches each emitted message.

This keeps subscription policy out of the kernel while preserving the important
Oak behavior: subscription streams emit messages.

## React

React integration is direct because the kernel already has the shape React
wants:

```ts
function Counter() {
  const count = useSelector(oak, (model) => model.count)
  const dispatch = useDispatch(oak)

  return <button onClick={() => dispatch(Msg.Increment())}>{count}</button>
}
```

There is no `ManagedRuntime`, no tag lookup, and no Effect bridge in React. If an
Effect harness is needed for commands or subscriptions, start it outside the
view tree or in a small app provider.

## Practical Tradeoffs

- Effects emitted before a harness subscribes are not queued. Start the harness
  before dispatching messages that produce effects.
- The kernel uses callback emitters, not Streams. Harnesses adapt callbacks to
  their own effect model.
- The model is not deeply readonly yet. That is a future type-system tightening.
- Diagnostics are plain `unknown` errors in the kernel. The Effect runner reports
  Effect `Cause`s through the same diagnostic channel.

The result is a smaller core with more possible runtimes: Effect, Promise, RxJS,
or plain browser APIs can all be built around the same synchronous kernel.
