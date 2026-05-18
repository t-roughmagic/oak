# Agent Instructions

Oak is a "The Elm Architecture"-style state library: a small synchronous kernel with platforms
(Effect today, others later) and view bindings (React today) layered on top.

## Repository layout

- `oak/oak-core` — pure-TS synchronous kernel. No Effect, no DOM. `makeKernel`,
  `OakState`, `OakViewDriver`, `Diagnostic`, `OakEvent`, `Update`,
  `HandlerResult`, `Mutation`, `ScheduleCommand`.
- `oak/oak-platform-effect` — Effect platform: `makeOakEffectProgram`,
  `EffectCommand`, `EffectSub`, `OakService`, `OakTag`, `makeOakTag`.
- `react/oak-react` — view layer over `OakViewDriver`. `OakProvider`,
  `useOakDriver`, `useOakSelector`, `useOakDispatch`, `createOakHooks`.
- `react/oak-platform-effect-react` — bridge from Effect program to React.
  `OakEffectViewProvider`, `useOakEffectViewDriver`.
- `react/effect-runtime-react-provider` — independent React glue for a
  `ManagedRuntime` (typed `Provider` + `useRuntime`, plus `useScopedRuntime`).
- `examples/example-react` — flagship React example (dice rollers, Effect service,
  typed hooks).
- `examples/example-next` — modern Next.js App Router example with server-seeded
  Oak state, navigation, Effect commands, and subscriptions.
- `examples/*` — additional examples (`example-prog-counter`,
  `example-prog-cmd`, `example-prog-timer`, `example-http`).
- `vendor/effect-ts` — vendored Effect source, **never** a build input.

`pnpm-workspace.yaml` globs `oak/*`, `react/*`, `examples/*`. There used to be
a `packages/*` glob with a legacy `@oak/oak` + `@oak/oak-v2` core; both are
deleted. Don't recreate `packages/`.

## Architecture seam (read this before changing layers)

```
oak-core                 oak-platform-effect          oak-react           oak-platform-effect-react
─────────────────────    ─────────────────────────    ────────────────    ──────────────────────────
makeKernel({init, ◄────  makeOakEffectProgram         OakProvider ◄────── OakEffectViewProvider
  update, scheduleCmd})    └ wraps kernel               └ context for      └ runtime.runSync(tag),
  OakState (sync)          └ Layer.scoped(tag, ...)       OakViewDriver       hands driver to OakProvider
  OakViewDriver            └ EffectCommand schedule    useOakSelector,
  dispatch (sync)            via Effect.runFork +        useOakDispatch,
  events / diagnostics       Effect.forkIn(scope)        createOakHooks
                           EffectSub via Stream
                             switchMap on select()
```

Invariants:

- `oak-core` has **no Effect import**. Anywhere. If you find yourself reaching
  for `Effect.*` in `oak-core`, you're solving the wrong problem.
- `oak-react` has **no Effect import** and **no `oak-platform-*` import**. It
  only knows about `OakViewDriver` from `oak-core`.
- The kernel is synchronous: after `dispatch(msg)`, `state.value` reflects the
  post-message model in the same call frame.
- Nested dispatches (from inside a state listener, or from a command's
  resulting message) are deferred via `queueMicrotask` so re-entrance is
  structurally impossible.

## Authoring conventions

- **Update return shape is an object**, not a tuple:
  `{ mutation: Mutation<M>, effects: ReadonlyArray<Cmd> }`. The legacy
  `[Mutation, Cmd[]]` tuple is gone; TypeScript inference on object literals is
  dramatically better.
- **Program `tagKey` convention**: `'<package-name>/<TagName>'`, e.g.
  `'@oak/example-react/DiceProgram'`. Must be unique across the running
  process — Effect uses it as the service identity.
- **Service tag keys** follow the same shape:
  `'@oak/example-react/DiceRoller'`.
- **Subscriptions are `EffectSub`**: `{ select(model), run(value), eq? }`. The
  legacy `{ shouldReplace, run }` form is gone. Platform handles
  `select`-then-`eq` dedup and switch-maps the inner stream when the selected
  value changes.
- **React hooks**: prefer the typed factory.
  ```ts
  // hooks.ts (per program)
  export const { useSelector, useDispatch } = createOakHooks<Model, Msg>()
  // app.tsx
  const count = useSelector((m) => m.count)
  const dispatch = useDispatch()
  ```
  Direct `useOakSelector` / `useOakDispatch` exist for code that doesn't have
  fixed `Model`/`Msg` types.

## Development workflow

- Package manager: `pnpm`. The repo pins `pnpm@11.1.2` via the
  `packageManager` field.
- Module system: ESM. Internal relative imports use `.js` extensions even from
  `.ts` source.
- TypeScript: `strict`, `exactOptionalPropertyTypes`, `noUnusedLocals`,
  `composite`. Project references wire each package; the root `tsconfig.json`
  lists them.
- Comments: write very few. Only when the _why_ is non-obvious (a subtle
  invariant, a workaround, a microtask-deferral rationale). Identifiers should
  carry the _what_.

## Validation

Run the narrowest check that proves the change, broaden when warranted:

- `pnpm typecheck` — typechecks all references.
- `pnpm build` — `tsc -b` across all packages.
- `pnpm test` — root vitest config picks up `oak/*`, `react/*`,
  `examples/*`. Currently 50 tests across 5 files.
- `pnpm lint` / `lint:fix` — ESLint.
- `pnpm format:check` / `format` — Prettier.

If you add tests for a package that doesn't have them yet:

1. Add `vitest` to the package's `devDependencies` (catalog version).
2. Add a `vitest.config.ts` with `include: ['test/**/*.test.ts']` (or `.tsx`).
3. Add a `"test": "vitest run"` script.
4. The root `vitest.config.ts`'s `projects` glob picks it up automatically.

## `vendor/effect-ts` discipline

The vendored Effect source is a reference, not a build input.

**What it is for:**

- Verifying Effect APIs and JSDoc against actual source.
- Reading internals when behavior matters.
- Finding canonical usage in `vendor/effect-ts/packages/*/test`.

**Search and read rules:**

- Default search scope is the Oak packages. Only widen into `vendor/` when you
  explicitly need Effect source.
- Target a specific subtree — usually
  `vendor/effect-ts/packages/effect/src/`. Don't grep the whole `vendor/` tree.
- Search by symbol or path, not speculative directory listing.
- Read only the file you need. Don't browse adjacent files.

**Never:**

- Add a `paths` alias, `include` glob, or `references` entry that reaches into
  `vendor/`. The "ghost sidecar" framing exists because of past compiler pain.
- Run Effect's own build/test/lint from `vendor/effect-ts`. Use Oak's commands
  at the repo root.
- Modify files under `vendor/effect-ts` unless the user asks. It's a submodule.
- Treat vendored source as authoritative — `node_modules/effect` (the version
  pinned in the pnpm catalog) is. Match those APIs before copying patterns.

## Common pitfalls

- **`'use client'` in Next.js**: every user file that imports a hook or
  Provider needs `'use client'`. Oak library entries intentionally do not carry
  framework-specific directives.
- **Synchronous first paint relies on a synchronously-buildable layer.**
  `useOakEffectViewDriver` calls `runtime.runSync(program.tag)` during render.
  If the layer build is async (a service `Layer.effect` that yields async
  work), `runSync` throws. Keep service layers sync where possible.
- **`tagKey` collisions are silent.** Two `makeOakEffectProgram` calls with
  the same `tagKey` produce conflicting `Context.Tag`s and Effect picks one.
  Use the `'<package-name>/<TagName>'` convention.
- **Cmd error reporting**: failed commands emit a `Diagnostic` with
  `source: 'command'`. Interrupt-only causes (scope close) are filtered out.
  Don't treat the absence of a diagnostic as proof a command completed.
