# Oak v4

A prototype of a layered TEA (The Elm Architecture) framework for TypeScript,
factored as a protocol with pluggable runtimes.

## Architecture

Three layers, separated by package boundaries enforced by import graph:

- **`core/`** — the kernel: synchronous TEA loop in vanilla TypeScript. No
  dependency on Effect, RxJS, or any async runtime. Produces and consumes
  `OakKernel<M, Msg>`, the universal interchange value.
- **`runtime-effect/`** / **`runtime-promise/`** — host harnesses. Each
  defines its own command and subscription shape, runs them in its async
  paradigm, and wraps a kernel with a runtime-shaped lifecycle. Runtimes
  know nothing about views.
- **`react/`** — view adapter. Takes an `OakKernel<M, Msg>` via context and
  exposes `useOakSelector` / `useOakDispatch`. Knows nothing about Effect,
  Promises, or any runtime. Works against any kernel.

The kernel is an **interchange format**, not an authoring surface. Program
authors write against a runtime; the kernel appears only at the handoff to
a view.

## Writing an Effect-runtime program

```ts
import { Effect, Stream } from 'effect'
import {
  makeOakEffectProgram,
  type EffectCommand,
  type EffectSub,
} from './runtime-effect/index.js'

type Model = { readonly count: number; readonly loading: boolean }
type Msg =
  | { _tag: 'Inc' }
  | { _tag: 'Load' }
  | { _tag: 'Loaded'; value: number }

type Cmd = EffectCommand<Model, Msg, never>
const fetchValue: Cmd = () =>
  Effect.succeed({ _tag: 'Loaded' as const, value: 42 })

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
        return { mutation: (m) => ({ ...m, count: m.count + 1 }) }
      case 'Load':
        return { mutation: (m) => ({ ...m, loading: true }), effects: [fetchValue] }
      case 'Loaded':
        return { mutation: (m) => ({ ...m, loading: false, count: msg.value }) }
    }
  },
  subscriptions: [tickSub],
})
// counter.layer, counter.tag, counter.name
```

The returned `counter` is `{ name, tag, layer }`. The Layer is the
distribution unit — composable into any `ManagedRuntime` or `Runtime`.

## Writing a Promise-runtime program

```ts
import {
  makeOakPromiseProgram,
  type PromiseCommand,
  type PromiseSub,
} from './runtime-promise/index.js'

type Cmd = PromiseCommand<Model, Msg>
const fetchValue: Cmd = async () => ({ _tag: 'Loaded', value: 42 })

const tickSub: PromiseSub<Model, Msg, number> = {
  select: (m) => m.count,
  run: (_value, dispatch) => {
    const id = setInterval(() => dispatch({ _tag: 'Inc' }), 100)
    return () => clearInterval(id)
  },
}

export const counter = makeOakPromiseProgram<Model, Msg>({
  name: 'counter',
  init: { count: 0, loading: false },
  update: /* same as above */,
  subscriptions: [tickSub],
})
// counter.start() returns { kernel, dispose }
```

Same authoring shape, different return: `start()` instead of a Layer,
returning `{ kernel, dispose }` synchronously.

## Connecting to a React view

The React adapter is runtime-agnostic. Extract the kernel from whatever
runtime you used and hand it to `OakProvider`:

```tsx
import { ManagedRuntime, Effect } from 'effect'
import { OakProvider, useOakDispatch, useOakSelector } from './react/index.js'
import { counter } from './counter.js'

// Effect runtime
const runtime = ManagedRuntime.make(counter.layer)
const service = await runtime.runPromise(Effect.flatMap(counter.tag, Effect.succeed))

// Or Promise runtime:
//   const instance = counter.start()
//   const kernel = instance.kernel

function Counter() {
  const count = useOakSelector<Model, number>((m) => m.count)
  const dispatch = useOakDispatch<Msg>()
  return (
    <button onClick={() => dispatch({ _tag: 'Inc' })}>{count}</button>
  )
}

function App() {
  return (
    <OakProvider kernel={service.kernel}>
      <Counter />
    </OakProvider>
  )
}
```

The same `<Counter />` component renders against any kernel — Effect,
Promise, or one built directly with `makeKernel` for tests.

## Distribution patterns

Three patterns for shipping an Oak program as a library.

### 1. Single-runtime library (most common)

The library targets one runtime; ship a runtime-shaped artifact.

```
my-counter-effect/
└── src/index.ts   →  exports `program` ({ name, tag, layer })
```

Consumer does `import { program } from 'my-counter-effect'` and composes
the Layer into their own runtime. This mirrors the Redux / Zustand /
Recoil convention: the library names its framework dependency.

### 2. Multi-runtime library (sharing logic)

Cover Effect and Promise consumers without forking. Use subpath exports:

```
my-counter/
├── package.json  →  exports: { "./types", "./effect", "./promise" }
└── src/
    ├── types.ts    →  Model, Msg                       [pure]
    ├── effect.ts   →  makeOakEffectProgram wrapping    [Effect]
    └── promise.ts  →  makeOakPromiseProgram wrapping   [Promise]
```

Pure `init` and `update` (when they have no commands) can live in a
shared `logic.ts`. Once commands are introduced, the runtime-specific
files carry their own update copy — runtime command types differ.

### 3. Logic-only distribution (rare)

A pure state machine with no commands or subs. Ship just types and
`update`; consumer wires into any runtime. Useful for tiny presentational
state (form fields, drawers, accordions).

## File reference

### `core/`

| File           | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `cell.ts`      | Internal `Cell<M>` — synchronous mutable state.        |
| `types.ts`     | Public types: `Update`, `Mutation`, `OakState`, `OakEvent`, `Diagnostic`. |
| `kernel.ts`    | `makeKernel` + `OakKernel` interface.                  |
| `index.ts`     | Public exports.                                        |

### `runtime-effect/`

| File              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `command.ts`      | `EffectCommand` type + `scheduleCommand` impl.     |
| `subscription.ts` | `EffectSub` + `runEffectSub` (state-driven switch). |
| `service.ts`      | `OakService` Effect-shaped surface + `OakTag`.     |
| `program.ts`      | `makeOakEffectProgram` → `{ name, tag, layer }`.   |
| `index.ts`        | Public exports.                                    |

### `runtime-promise/`

| File              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `command.ts`      | `PromiseCommand` type + `scheduleCommand` impl.    |
| `subscription.ts` | `PromiseSub` (callback-based) + `startPromiseSub`. |
| `program.ts`      | `makeOakPromiseProgram` → `{ name, start }`.       |
| `index.ts`        | Public exports.                                    |

### `react/`

| File          | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `context.ts`  | `OakProvider` + `useOakKernel`.                      |
| `hooks.ts`    | `useOakSelector` + `useOakDispatch`.                 |
| `index.ts`    | Public exports.                                      |

## Selector memoization

`useOakSelector(fn, eq?)` is intentionally unaware of memoization. For
trivial selectors (returning primitives or stable references), the default
`Object.is` equality is fine. For selectors returning fresh objects each
call, either pass a structural `eq` or wrap the selector with
`proxy-memoize` / `reselect` / your tool of choice. The view package
imports zero memoization libraries.

## Design rationale

See `oak-protocol-plan.md` in this directory for the protocol design and
the reasoning behind the three-layer factoring.
