# Oak

A TEA-style state library: a small synchronous kernel, with Effect at the
boundaries (commands, subscriptions, services) and React bindings on top.

## At a glance

```ts
import { makeOakEffectProgram } from '@oak/oak-platform-effect'
import { createOakHooks, OakProvider } from '@oak/oak-react'
import { OakEffectViewProvider } from '@oak/oak-platform-effect-react'
import { ManagedRuntime } from 'effect'

const counter = makeOakEffectProgram<{ count: number }, { _tag: 'Inc' }>({
  tagKey: '@my-app/Counter',
  init: { count: 0 },
  update: () => ({ mutation: (m) => ({ count: m.count + 1 }), effects: [] }),
})

const runtime = ManagedRuntime.make(counter.layer)
const { useSelector, useDispatch } = createOakHooks<
  { count: number },
  { _tag: 'Inc' }
>()

function App() {
  return (
    <OakEffectViewProvider runtime={runtime} program={counter}>
      <Counter />
    </OakEffectViewProvider>
  )
}

function Counter() {
  const count = useSelector((m) => m.count)
  const dispatch = useDispatch()
  return <button onClick={() => dispatch({ _tag: 'Inc' })}>{count}</button>
}
```

First paint renders the real `init` model — no loading flicker.

## Workspace layout

| Package | What it is |
|---|---|
| [`oak/oak-core`](oak/oak-core) | Pure-TS synchronous kernel. No Effect, no DOM. |
| [`oak/oak-platform-effect`](oak/oak-platform-effect) | Effect platform: commands, subscriptions, `Layer`. |
| [`react/oak-react`](react/oak-react) | React view layer over `OakViewDriver`. Typed hooks. |
| [`react/oak-platform-effect-react`](react/oak-platform-effect-react) | Bridge from Effect program to React. |
| [`react/effect-runtime-react-provider`](react/effect-runtime-react-provider) | Generic React glue for an Effect `ManagedRuntime`. |
| [`react/example-react`](react/example-react) | Flagship React example (dice rollers, Effect service). |
| [`examples/*`](examples) | Program-only examples (counter, command, timer, http). |

## Design

- **Synchronous kernel.** `dispatch(msg)` runs `update`, applies the mutation,
  and notifies subscribers in the same call frame. After `dispatch` returns,
  `state.value` reflects the new model.
- **Effect at the edges.** Commands are `Effect<Msg, E, R>`; subscriptions are
  `Stream<Msg, never, R>` with switch-map lifecycle. The kernel itself has no
  Effect dependency.
- **No re-entrance.** Nested dispatches (from a listener, from a command's
  resulting message) are queued via `queueMicrotask`. Re-entrance is
  structurally impossible.
- **React reads the kernel directly.** `useOakSelector` is a thin wrapper over
  `useSyncExternalStore`. No fibers, no streams, no generation guards in the
  read path.

## Commands

```sh
pnpm build         # tsc -b
pnpm typecheck     # same; convenience alias
pnpm test          # vitest run across all packages
pnpm lint          # eslint
pnpm format        # prettier --write
```

## See also

- [`AGENTS.md`](AGENTS.md) — invariants, conventions, and pitfalls for
  contributors.
- [`docs/oak-ergonomics-review.md`](docs/oak-ergonomics-review.md) — current
  critique of the DX with prioritized improvement ideas.
- [`vendor/effect-ts`](vendor/effect-ts) — vendored Effect source for API
  reference. **Not a build input.**
