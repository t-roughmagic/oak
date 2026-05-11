# Oak v2 Scratchpad

This directory sketches a platform-owned Oak program API.

Oak is Elm-style TEA for TypeScript. Program authors always target a platform,
because commands and subscriptions are part of the program and are shaped by
the platform that runs them: Effect, Promise, Observable, etc.

The internal kernel is not an authoring surface. It is a small implementation
detail used by platforms to apply mutations synchronously, schedule effects,
publish events, and expose state to view drivers.

## Architecture

- **Program authoring** targets one Oak platform.
- **Platform code** owns effect execution, subscription lifecycles, diagnostics,
  and the private kernel.
- **View adapters** consume an `OakViewDriver<M, Msg>` with synchronous
  `state` and `dispatch`. They do not know whether Effect, Promise, or another
  platform is running the program.

The handoff to React is a view driver, not a kernel:

```tsx
<OakProvider driver={program.view(service)}>
  <App />
</OakProvider>
```

## Writing an Effect-platform program

```ts
import { Effect, Stream } from 'effect'
import {
  makeOakEffectProgram,
  type EffectCommand,
  type EffectSub,
} from './platform-effect/index.js'

type Model = { readonly count: number; readonly loading: boolean }
type Msg =
  | { readonly _tag: 'Inc' }
  | { readonly _tag: 'Load' }
  | { readonly _tag: 'Loaded'; readonly value: number }

type Fx = EffectCommand<Model, Msg>

const fetchValue: Fx = () => Effect.succeed({ _tag: 'Loaded' as const, value: 42 })

const tickSub: EffectSub<Model, Msg, never, number> = {
  select: (m) => m.count,
  run: () => Stream.succeed({ _tag: 'Inc' as const }),
}

export const counter = makeOakEffectProgram<Model, Msg>({
  name: 'counter',
  init: { count: 0, loading: false },
  update: (msg) => {
    switch (msg._tag) {
      case 'Inc':
        return {
          mutation: (m) => ({ ...m, count: m.count + 1 }),
          effects: [],
        }
      case 'Load':
        return {
          mutation: (m) => ({ ...m, loading: true }),
          effects: [fetchValue],
        }
      case 'Loaded':
        return {
          mutation: (m) => ({ ...m, loading: false, count: msg.value }),
          effects: [],
        }
    }
  },
  subscriptions: [tickSub],
})
```

The returned artifact is the unit a library exports:

```ts
counter.name
counter.tag
counter.layer
counter.view(service)
```

`layer` is provided to an Effect runtime. `tag` retrieves the running
`OakService`. `view(service)` creates the driver that React or another view
adapter consumes.

## Connecting to React

```tsx
import { Effect, ManagedRuntime } from 'effect'
import { OakProvider, useOakDispatch, useOakSelector } from './react/index.js'
import { counter } from './counter.js'

const runtime = ManagedRuntime.make(counter.layer)
const service = await runtime.runPromise(Effect.flatMap(counter.tag, Effect.succeed))

function Counter() {
  const count = useOakSelector<Model, number>((m) => m.count)
  const dispatch = useOakDispatch<Msg>()
  return (
    <button type="button" onClick={() => dispatch({ _tag: 'Inc' })}>
      {count}
    </button>
  )
}

function App() {
  return (
    <OakProvider driver={counter.view(service)}>
      <Counter />
    </OakProvider>
  )
}
```

React sees only the driver:

```ts
interface OakViewDriver<M, Msg> {
  readonly name: string
  readonly state: OakState<M>
  dispatch(msg: Msg): void
}
```

## Promise Platform

The Promise platform is a second platform sketch, not evidence that a bare
kernel is a valid Oak program.

```ts
import {
  makeOakPromiseProgram,
  type PromiseCommand,
  type PromiseSub,
} from './platform-promise/index.js'

type Fx = PromiseCommand<Model, Msg>

const fetchValue: Fx = async () => ({ _tag: 'Loaded', value: 42 })

const tickSub: PromiseSub<Model, Msg, number> = {
  select: (m) => m.count,
  run: (_value, dispatch) => {
    const id = setInterval(() => dispatch({ _tag: 'Inc' }), 100)
    return () => clearInterval(id)
  },
}

export const counter = makeOakPromiseProgram<Model, Msg>({
  name: 'counter',
  init,
  update,
  subscriptions: [tickSub],
})

const instance = counter.start()
const driver = counter.view(instance)
```

## Internal Files

| Area                | Purpose                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `core/`             | Private synchronous dispatch engine and shared types.                                 |
| `platform-effect/`  | Effect platform: commands, subscriptions, `Layer`, service, view driver.              |
| `platform-promise/` | Promise platform sketch: commands, subscriptions, `start()`/`dispose()`, view driver. |
| `react/`            | View adapter over `OakViewDriver`, not over platform services or kernels.             |

`core/makeKernel` exists for platform implementation and internal tests. Do
not document it as an application API or pass it to views.

## Selector Memoization

`useOakSelector(fn, eq?)` does not bundle a memoization library.

- Selectors returning primitives or stable references can use default
  `Object.is`.
- Selectors returning fresh objects should pass a structural `eq`, or be
  wrapped with `proxy-memoize`, `reselect`, or another selector tool before
  passing them to `useOakSelector`.
