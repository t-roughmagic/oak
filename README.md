# Oak Workspace

Reactive state library.

Inspired by Elm.

Built with Effect.

## `@oak/oak`

Core exports come from `packages/oak/src/index.ts`.

### Main concepts

- `Mutation<M>`: `(model: M) => M`
- `Cmd<M, Msg, S>`: `(msg, model) => Effect<Msg, never, S>`
- `Update<M, Msg, S>`: `(msg) => [Mutation<M>, Cmd[]]`
- `Sub<M, Msg, S>`: `{ shouldReplace(prev, curr), run(model) }`
- `makeOak({ name, init, update, subscriptions? })`: creates an `OakProgram`
- `makeOakLayer(program, ...)`: composes Oak programs into one Effect `Layer`

### `OakProgram`

`makeOak(...)` returns:

- `name`: string identifier
- `tag`: typed runtime address for the running program
- `layer`: scoped Effect `Layer` that starts and owns the program runtime

### `OakService`

Advanced integrations can use the running program surface exposed by `tag`:

- `state`: `SubscriptionRef<Model>`
- `events`: `Stream<{ message, model }>`
- `dispatch(message)`: `Effect<void>`

Oak exposes this as an Effect service for runtime addressing and lifecycle
composition. The application-level abstraction is still the Oak program.

### Runtime semantics

- Each program owns its own FIFO inbox.
- `dispatch` enqueues a message.
- The consumer loop calls `update(message)`, applies the returned mutation atomically, publishes `{ message, model }` to `events`, then forks returned commands in program scope.
- Commands receive the triggering message and the post-mutation model, then return the next message to enqueue.
- Subscriptions watch `state.changes`; when `shouldReplace(prev, curr)` is `true`, Oak interrupts the previous stream and starts `run(curr)`.
- There is no `onChange` callback in the current core API.

## `@oak/oak-react`

React exports live in `packages/oak-react/src/index.ts`.

### Public API

- `OakRuntimeContext`: React context for a `ManagedRuntime`
- `useOakRuntime()`: reads the runtime from context
- `useManagedRuntime(layer)`: creates a `ManagedRuntime` during first client render and disposes on unmount
- `useSelector(tag, selector, eq?)`: subscribes to selected Oak state via `useSyncExternalStore`
- `useDispatch(tag)`: returns `(message) => void`

### React integration notes

- Components should normally interact with Oak via `useSelector` and `useDispatch`.
- `useSelector` caches one model subscription per runtime/program pair and only re-renders when the selected value changes.
- `useDispatch` forks an Effect that calls the running program's `dispatch`.
- For server-fetched initial data, create Oak programs from client-provider props before selector components mount; do not dispatch a hydrate message for mount-time state.

## Workspace commands

- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format`

## Guidance For LLMs

- Treat `packages/oak` as the source of truth for core API and runtime behavior.
- Treat `packages/oak-react` as the source of truth for React usage.
- Use the example packages for composition patterns, not as normative API definitions.
