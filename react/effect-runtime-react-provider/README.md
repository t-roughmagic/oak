# `@oak/effect-runtime-react-provider`

Typed React glue for an Effect `ManagedRuntime`. The package does not create,
own, or dispose the runtime — it only carries an existing runtime through
React context with full type-parameter capture.

## Pattern

Construct the runtime at module load in a plain TypeScript file, then bind it
to a React Provider + hook with `createRuntimeBinding`:

```ts
// runtime.ts
'use client'

import { ManagedRuntime, Layer } from 'effect'
import { createRuntimeBinding } from '@oak/effect-runtime-react-provider'
import { AppServiceLive } from './services.js'

const appLayer = Layer.mergeAll(AppServiceLive)

export const appRuntime = ManagedRuntime.make(appLayer)

export const {
  Provider: AppRuntimeProvider,
  useRuntime: useAppRuntime,
} = createRuntimeBinding(appRuntime, { name: 'App runtime' })
```

```tsx
// app.tsx
'use client'

import { AppRuntimeProvider, useAppRuntime } from './runtime.js'

function SomeButton() {
  const runtime = useAppRuntime()
  // runtime.runPromise(...), runtime.runFork(...), runtime.runSync(...)
}

export function App() {
  return (
    <AppRuntimeProvider>
      <SomeButton />
    </AppRuntimeProvider>
  )
}
```

The runtime is a regular module export — usable from server actions, test
helpers, CLI scripts, anywhere TypeScript runs. The Provider only exists so
React subtrees can call `useAppRuntime()` to obtain it.

## Why a factory

Each `createRuntimeBinding(runtime)` call captures `R` and `E` once at the
factory site, so `useAppRuntime()` returns a fully-typed runtime with no
generics at the call site. Separate factory calls produce independent
contexts, so an app can compose multiple typed runtimes without collision.

## SSR / Next.js

The module is `'use client'`. For Next.js, put `'use client'` at the top of
your own `runtime.ts` and any component that imports from it. The runtime
constructs once per browser session and lives for the rest of it.

If your layer needs the browser DOM/window during construction, gate the
provider behind a client-mounted check at the app level rather than building
it into this package.

## Two patterns

**Canonical: module-scope runtime + `createRuntimeBinding`.** Use when the
layer doesn't depend on per-mount data. No React lifecycle, no leak risk,
no StrictMode considerations.

**Per-mount: `useScopedRuntime(layer)`.** Use when the layer depends on
props passed into a component (route seed, per-user composition). The hook
creates the runtime during the first render and disposes it on real
unmount, surviving StrictMode's simulated unmount/remount via deferred
cleanup + a generation counter.

```tsx
'use client'

import { useScopedRuntime } from '@oak/effect-runtime-react-provider'
import { Layer } from 'effect'
import { useState } from 'react'

export function OakPageProvider({ seed, children }) {
  const [layer] = useState(() => makeProgramLayer({ ...defaults, ...seed }))
  const runtime = useScopedRuntime(layer)
  return (
    <OakRuntimeProvider runtime={runtime}>{children}</OakRuntimeProvider>
  )
}
```

For SSR hydration the canonical move is to merge `defaults` with the
server `seed` and pass the result into the program factory's `init`. That
mirrors Redux Toolkit's `configureStore({ preloadedState })`. The seeded
state is in place before the first render, so children paint with
hydrated content immediately.

If you can, use module scope. Reach for `useScopedRuntime` only when the
layer genuinely needs per-mount input.

## Disposal

The runtime owner is responsible for disposal. For most apps the browser
session is the runtime's lifetime and no explicit disposal is needed. For
tests, dispose explicitly:

```ts
afterEach(async () => {
  await appRuntime.dispose()
})
```

Or use your test runner's module-isolation mode so each test imports a fresh
`runtime.ts`.

## StrictMode / concurrent mode

The runtime isn't created or owned by a React hook, so React's lifecycle
behaviors (StrictMode double-mount, concurrent abandoned renders, Suspense
retries) cannot affect it. The Provider just hands the existing runtime to
context — there is nothing to dispose, recreate, or guard against.
