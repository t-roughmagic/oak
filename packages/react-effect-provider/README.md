# `@oak/react-effect-provider`

Small React helpers for owning an Effect `ManagedRuntime` inside a React tree.

This package is intentionally not Oak-specific. It solves the React/Next.js
lifecycle problem: create one client-side `ManagedRuntime` from a stable Effect
`Layer`, provide it through context, and dispose it without breaking React
development StrictMode's setup/cleanup replay.

The package entry is a client component module (`'use client'`), so use it from
client boundaries in Next.js.

## Basic Usage

```tsx
'use client'

import { Layer } from 'effect'
import { EffectRuntimeProvider, useEffectRuntime } from '@oak/react-effect-provider'
import type { ReactNode } from 'react'

const AppLayer = Layer.empty

export function Providers({ children }: { readonly children: ReactNode }) {
  return <EffectRuntimeProvider layer={AppLayer}>{children}</EffectRuntimeProvider>
}

function SomeButton() {
  const runtime = useEffectRuntime()
  // runtime.runFork(...), runtime.runPromise(...), etc.
}
```

Compose application layers before passing them to the provider:

```tsx
const AppLayer = ProgramLayer.pipe(Layer.provideMerge(ServiceLive))
```

This package does not know whether a layer runs Oak, HTTP clients, test doubles,
or any other Effect service. It only manages the React lifecycle of the
`ManagedRuntime`.

## Hook API

```ts
const runtime = useManagedRuntime(layer)
```

The runtime is created during the first render so child hooks can read it
immediately. The initial `layer` is sticky. If the layer identity changes after
mount, the hook warns once; remount with a React `key` to create a fresh runtime.

Cleanup is deferred by one microtask so React development StrictMode does not
dispose the runtime during effect replay for the same mounted tree.

## Next.js

For strict client-only runtime creation, use `ClientEffectRuntimeProvider`.
It renders `fallback` until the component has mounted in the browser, then
creates the `ManagedRuntime`.

```tsx
'use client'

export function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <ClientEffectRuntimeProvider layer={AppLayer} fallback={null}>
      {children}
    </ClientEffectRuntimeProvider>
  )
}
```

Use this when the Effect layer must not be constructed during server prerender.
Use `EffectRuntimeProvider` when you want the runtime available during the
first client render and your layer construction is safe in that environment.

## Convenience Hooks

```ts
const runPromise = useRunPromise<MyServices>()
const runFork = useRunFork<MyServices>()
```

These hooks read the runtime from context and return stable callbacks around
`runtime.runPromise` and `runtime.runFork`.
