# Oak ergonomics review (via `react/example-react`)

## Context

`react/example-react` is the canonical demonstration of how the new Oak stack
(`oak-core` + `oak-platform-effect` + `oak-react` + `oak-platform-effect-react`)
composes into a working React app. It's the place we should be reading off the
user-facing ergonomic story. This document is an honest critique of that story,
organized by friction, with concrete (small) suggestions.

**Headline:** the stack is already in good shape. 12 files / ~220 LoC for a
working multi-step async program with a service, typed hooks, and a synchronous
first paint is competitive. The friction left is mostly small papercuts plus
one structural redundancy in the example itself.

---

## What's working

| Concern | Verdict |
|---|---|
| Layer separation (kernel / platform / view / bridge) | Clean. View code has zero Effect imports. |
| `createOakHooks<M, Msg>()` factory | Removes generics from all call sites; matches RTK convention. |
| `<OakEffectViewProvider>` for synchronous first paint | Renders the real `init` model on render 1. No "loading" gymnastics. |
| `program.layer` + `ManagedRuntime` composition | Idiomatic Effect. Services compose with `Layer.provideMerge`. |
| Program file layout (model / message / update / selectors / optics / program / service) | Idiomatic Elm structure. Heavy for a toy example but right for a real app. |

---

## Friction, in priority order

### 1. `example-react/src/runtime.ts` creates a binding it never uses

```ts
export const appRuntime = ManagedRuntime.make(appLayer)
export const { Provider, useRuntime } = createRuntimeBinding(appRuntime, {
  name: 'Dice example runtime',
})
```

Nothing consumes `Provider` or `useRuntime`. `<OakEffectViewProvider>` already
supplies the driver to children; direct runtime access isn't needed here. This
is leftover scaffolding that teaches a confusing extra concept (two providers?
two ways to get state?).

**Fix:** delete the `createRuntimeBinding(...)` call from the example. Keep
only `appRuntime`. This is a 4-line cleanup that removes a misleading pattern
from the flagship example.

`createRuntimeBinding` still has a real use case — apps that talk to Effect
directly outside of an Oak program (e.g. calling `runtime.runPromise(otherEffect)`
from a component) — but `example-react` doesn't have that use case.

### 2. Hand-authored `tagKey` strings

```ts
makeOakEffectProgram({ tagKey: '@oak/example-react/DiceProgram', ... })
```

Effect requires a unique service identifier; the user has to invent one and own
its uniqueness. A typo silently collides with another program. The string
mostly exists to satisfy `Context.GenericTag`'s identity contract.

**Two options to consider** (separate decision per option):

- **Make `tagKey` optional**, defaulting to a fresh `Symbol()` (or a string
  built from a counter + caller info). The common case — one program type, one
  instance — no longer needs the user to think about it. Users who want a
  debug-visible name or who instantiate the same program type multiple times
  can still pass `tagKey`.
- **Keep `tagKey` required** as today, but document the convention:
  `'<pkg-name>/<ProgramName>'`. This is what the current code already does;
  we just need it in the README.

I lean toward making it optional. Effect's `Context.Tag` accepts a `Symbol`
identifier just as well as a string. The cost is one branch in `makeOakTag`;
the win is one less invented string per program.

### 3. `<OakEffectViewProvider>` takes both `runtime` and `program`

```tsx
<OakEffectViewProvider runtime={appRuntime} program={diceProgram}>
```

A program and a runtime are usually 1:1 at the wiring point. Passing both is
technically flexible (one runtime could run two programs) but in practice the
example shows them as a fixed pair. The user has to thread two related values
to the same boundary.

**Two options:**
- **Bundle them.** Add a `bindProgram(runtime, program)` helper that returns
  `{ Provider, useSelector, useDispatch, useDriver }` — one factory call, no
  per-call wiring, fully typed. The example collapses to
  `import { Provider } from './oak'`.
- **Leave as-is** and accept the two-prop API as the price of flexibility.

The bundled form is more ergonomic for the common case; the current API stays
as a lower-level building block. I'd add the helper without removing the
existing API.

### 4. `'use client'` is sprinkled in user code

`app.tsx`, `hooks.ts`, `runtime.ts` all start with `'use client'`. This is a
Next.js App Router requirement on user files that consume client-only modules.
Library packages (`oak-platform-effect-react`, `effect-runtime-react-provider`)
already have `'use client'` at their entry — but the directive does not transit
through imports in Next.js.

**No good fix at the library level.** This is Next's contract. Worth one
paragraph in a "Using Oak with Next.js" README so users know which of *their*
files need it.

### 5. No demonstration of subscriptions, events, or diagnostics in the React example

The flagship React example uses commands but never:
- a subscription (timer ticks, websocket, mouse drag — the killer feature of
  TEA's `Sub`)
- the events stream (devtools, analytics)
- the diagnostics stream (error toasts, logging)

`example-prog-timer` has a subscription, but it's program-only and never wired
to a UI. A user reading `example-react` could reasonably conclude subscriptions
don't exist.

**Fix:** extend `example-react` with a small subscription-driven feature (e.g.
an auto-roll timer that rolls every N seconds, with a stop/start button) and a
tiny dev panel that consumes the events/diagnostics streams. This costs maybe
60 lines and demonstrates 100% of the platform surface.

### 6. Selector + optic boilerplate in the program

`example-react/src/oak-program/optics.ts` (9 lens declarations + 2 factories)
plus `selectors.ts` (7 `Optic.get` calls + a hand-rolled `combineSelectors`) is
a lot of structural code relative to the model.

This is a *user* choice — Oak doesn't mandate optics. But the example is the
de-facto convention, so it telegraphs heaviness.

**Fix (light touch):** consider a brief "you don't need optics" alternative
example, e.g. using `structuredClone` + spread, or an Immer-style helper.
Don't change the existing example; just show another path in docs.

### 7. Two dispatch surfaces on `OakService`

`service.dispatch(msg): Effect<void>` and `service.driver.dispatch(msg): void`.
The Effect version exists for symmetry with Effect-shaped callers; the sync
version is what React uses. This is fine — both have reasons to exist — but
the doc story should make clear which one to use when.

**Fix:** README note. Not a code change.

### 8. Open question: `tagKey` namespace conventions

Even if `tagKey` becomes optional, when users do supply one, what's the
convention? Look at the codebase:
- `'@oak/example-react/DiceProgram'`
- `'@oak/example-react/DiceRoller'`
- `'@oak/example-http/JokeProgram'`
- `'@oak/example-prog-counter/CounterProgram'`

Pattern is `'<package-name>/<TagName>'`. Worth documenting as the convention
so we don't drift.

---

## Files most likely to change if we act on this

If priorities 1–3 land:
- `react/example-react/src/runtime.ts` — drop unused binding
- `oak/oak-platform-effect/src/program.ts`, `service.ts` — `tagKey` becomes optional
- `react/oak-platform-effect-react/src/index.ts` — add `bindProgram` helper
- README in `react/example-react/` or a new top-level `README.md` — convention + Next.js note

If priorities 4–6 land:
- `react/example-react/src/oak-program/` — add a `tick-sub.ts` and wire to the UI
- `react/example-react/src/app.tsx` — small dev-panel section
- Maybe a new `examples/example-program-imperative/` showing a non-optic program

---

## What I'd NOT change

- The four-package split (`oak-core` / `oak-platform-effect` / `oak-react` /
  `oak-platform-effect-react`). It earns its keep.
- `createOakHooks<M, Msg>()`. RTK has trained users for this pattern; it works.
- The TEA structure (init / update / subscriptions / commands). It's the point.
- The synchronous `runSync(program.tag)` first-paint trick. It's load-bearing
  for the "no flash of loading state" promise.

---

## Verification (if we act on any of this)

- `pnpm build` — clean.
- `pnpm test` — 50 tests still green.
- Open `react/example-react` in a Vite dev server and click each die roller —
  initial paint shows `1`s, no flicker; rolls land with brief "rolling..."
  pending state; total updates.
- If `tagKey` becomes optional: a program created with and without an explicit
  `tagKey` both work and are independently addressable; two programs without
  explicit keys do not collide.
- If `bindProgram` is added: example-react's `app.tsx` consumes the bundled
  Provider with no `runtime`/`program` props and renders identically.

---

## Recommendation

Pick a subset to act on right now. The most leveraged items are:

1. **#1 (delete unused binding in example-react)** — pure cleanup, ~10 minutes.
2. **#5 (add subscription + dev panel to example-react)** — biggest payoff for
   "is this library useful?" question; ~1 hour.
3. **#3 `bindProgram` helper** — small new API, removes the most visible
   wiring ceremony.

`#2` (optional `tagKey`) is a real ergonomic win but it's a library API change
that wants a tiny design memo before landing. The others (`#4`, `#6`, `#7`,
`#8`) are documentation work and can wait until a README pass.
