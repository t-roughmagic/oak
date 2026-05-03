# Agent Instructions

This is the Oak workspace: an Elm-style state runtime built on Effect, with React bindings and small example programs.

## Repository Layout

- `packages/oak`: core Oak runtime, public types, and `makeOak`.
- `packages/oak-react`: React context, runtime, selector, and dispatch hooks.
- `packages/example-prog-counter`: simple counter program.
- `packages/example-prog-timer`: subscription-driven timer example.
- `packages/example-prog-cmd`: async command example.
- `packages/oak-react-example`: Vite app that composes the example programs in React.
- `packages/oak-next-example`: Next.js App Router example for SSR hydration.
- `vendor/effect-ts`: vendored Effect repository (git submodule), kept as a "ghost sidecar" — present on disk for in-repo source lookup, never part of any build.

The root `pnpm-workspace.yaml` includes only `packages/*`. The vendored Effect checkout is intentionally outside the Oak workspace, outside every package's `tsconfig.json` `include`, and absent from `paths`. Imports of `effect` resolve through `node_modules/effect` (the published package) — never through `vendor/`.

## How To Use `vendor/effect-ts`

The vendored Effect source is a reference, not a build input or a default search target. Use it deliberately and narrowly so it doesn't flood agent context.

**What it is for:**

- Verifying Effect APIs, signatures, and JSDoc against actual source instead of guessing from memory.
- Reading implementation details when behavior under the hood matters.
- Finding canonical usage patterns in `vendor/effect-ts/packages/*/test`.

**Search and read discipline:**

- Default search scope is **the Oak packages** (`packages/`). Only widen into `vendor/` when you explicitly need to consult Effect source.
- When searching `vendor/`, **target a specific subtree** — almost always `vendor/effect-ts/packages/effect/src/` for core APIs, or a specific sub-package (`packages/platform/`, `packages/schema/`, etc.). Do not grep the whole `vendor/` tree.
- Search by symbol or path (`grep -r "export const gen" vendor/effect-ts/packages/effect/src`), not by speculative directory listing.
- Read **only the file you need**. Do not browse adjacent files speculatively or dump file lists into your reasoning.
- When citing what you found, reference the path (e.g. `vendor/effect-ts/packages/effect/src/Effect.ts:1234`); do not paste long excerpts back unless the user asks for them.

**Never:**

- Add a `paths` alias, `include` glob, or `references` entry that reaches into `vendor/`. The compiler problem this caused was the entire reason for the "ghost sidecar" framing.
- Run Effect's own build, test, or lint commands from `vendor/effect-ts`. Use Oak's commands at the repo root.
- Modify files under `vendor/effect-ts` unless the user explicitly asks. It is a submodule pinned to an upstream commit.
- Treat vendored source as authoritative for Oak's runtime behavior. The authoritative source is `node_modules/effect` (the version pinned via the pnpm catalog). Match those APIs before copying patterns from the vendor checkout — versions can drift.

## Development Workflow

- Use `pnpm` as the package manager.
- Keep changes scoped to the package or example relevant to the task.
- Follow existing TypeScript style before introducing new abstractions.
- Relative TypeScript imports in this ESM workspace use `.js` extensions.
- Avoid editing generated build output such as `dist` or `*.tsbuildinfo`.
- Do not add comments unless they explain non-obvious runtime behavior or Effect interactions.

## Validation

Run the narrowest command that proves the change, then broaden when the touched surface warrants it.

- `pnpm typecheck`: typecheck all workspace packages.
- `pnpm build`: build all workspace packages.
- `pnpm lint`: lint the repository.
- `pnpm lint:fix`: apply ESLint fixes when useful.
- `pnpm format:check`: check Prettier formatting.
- `pnpm format`: apply Prettier formatting.

There is no root test script at the time of writing. If you add tests, follow the local package's established tooling or add the necessary script deliberately.

## Oak Runtime Notes

- `packages/oak/src/index.ts` is the public core export surface.
- `makeOak({ name, init, update, subscriptions? })` creates an Oak program with a unique Effect `Context.Tag` and scoped `Layer`.
- Each program owns a FIFO message inbox.
- `dispatch(message)` enqueues a message.
- The runtime consumes messages, calls `update(message)`, applies the returned mutation atomically, publishes `{ message, model }` to `events`, and forks returned commands in the program scope.
- Commands receive the triggering message and post-mutation model, then return the next message to dispatch.
- Subscriptions observe state changes and restart their stream when `shouldReplace(prev, curr)` returns `true`.

## React Notes

- `packages/oak-react/src/index.ts` is the public React export surface.
- Use `OakRuntimeContext` to provide a `ManagedRuntime`.
- `useManagedRuntime(layer)` creates and disposes a runtime for a React tree.
- `useSelector(tag, selector, eq?)` subscribes React to selected Oak state.
- `useDispatch(tag)` returns a synchronous React callback that dispatches into the managed runtime.
- Server-fetched initial state should be passed into a client provider and used to construct Oak programs before subscribers mount; avoid hydrate-dispatch patterns for mount-time state.

## Examples

Use the example packages as composition references, not as alternate definitions of the core API.

- Counter shows simple update/mutation shape.
- Timer shows subscriptions.
- Command example shows async command flow.
- React example shows wiring programs into a Vite React application.
