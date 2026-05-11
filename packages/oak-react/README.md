# `@oak/oak-react`

React bindings for Oak programs in interactive React trees.

`@oak/oak-react` is intentionally small. It does three things:

- provides a `ManagedRuntime` to React components
- lets components select Oak state with `useSelector`
- lets components enqueue messages with `useDispatch`

The generic Effect/React runtime lifecycle helper lives in
`@oak/react-effect-provider`; this package reuses it and keeps the Oak-shaped
API for existing app wiring.

It is designed for client-side React first, with the same pattern working in
Next.js as long as runtime creation stays inside a client component.
`@oak/oak-react` is not a server runtime adapter: do not use it to create or
run Oak runtimes in server components, request handlers, static SSR-only
renderers, or other non-interactive server code.

## Install

```sh
pnpm add @oak/oak @oak/oak-react effect react
```

## Vanilla React

### 1. Compose your Oak programs into a layer

```typescript
import { makeOakLayer } from '@oak/oak'
import { counter } from '@oak/example-prog-counter'
import { timer } from '@oak/example-prog-timer'

export const AppLayer = makeOakLayer(counter, timer)
```

`makeOakLayer` returns an Effect `Layer`. Oak keeps that boundary explicit
because the layer starts and owns the running programs' scoped refs, inboxes,
streams, subscriptions, and fibers.

### 2. Create a provider

```tsx
import type { ReactNode } from 'react'
import { OakRuntimeContext, useManagedRuntime } from '@oak/oak-react'
import { AppLayer } from './oak-layer.js'

export function OakProvider({ children }: { readonly children: ReactNode }) {
  const runtime = useManagedRuntime(AppLayer)

  return <OakRuntimeContext.Provider value={runtime}>{children}</OakRuntimeContext.Provider>
}
```

`useManagedRuntime` creates one `ManagedRuntime` from the initial layer and
disposes it when the provider unmounts. Keep the layer identity stable with a
module-level constant, `useMemo`, or a `useState` initializer. If a route,
session, or tenant change should reset Oak state, remount the provider with a
React `key`.

### 3. Read state with `useSelector`

```tsx
import { useSelector } from '@oak/oak-react'
import { counter } from '@oak/example-prog-counter'

export function CounterValue() {
  const count = useSelector(counter.tag, (model) => model.count)
  return <output>{count}</output>
}
```

`useSelector(tag, selector, eq?)`:

- reads from the Oak program identified by `tag`
- re-renders only when the selected value changes
- uses Effect `Equal.equals` by default, or a custom equality guard if you pass `eq`

Components selecting from the same Oak program share a single Effect subscription to that program's state stream.

Small examples can pass `program.tag` directly. In larger apps, prefer
app-local hooks that hide raw program handles from ordinary UI components.

Oak selectors work best when selected aggregate values are Effect data types
with value equality. For example, use `Data.struct` for a multi-field selector
that allocates a new value each render:

```tsx
import { Data } from 'effect'
import { useSelector } from '@oak/oak-react'
import { timer } from '@oak/example-prog-timer'

export function TimerSummary() {
  const summary = useSelector(timer.tag, (model) =>
    Data.struct({ seconds: model.seconds, intervalMs: model.intervalMs }),
  )

  return (
    <output>
      {summary.seconds}s / {summary.intervalMs}ms
    </output>
  )
}
```

If you select a plain JavaScript object, pass a custom equality guard just like
you would with Redux selectors:

```tsx
const summary = useSelector(
  timer.tag,
  (model) => ({ seconds: model.seconds, intervalMs: model.intervalMs }),
  (a, b) => a.seconds === b.seconds && a.intervalMs === b.intervalMs,
)
```

For non-React consumers, use `@oak/oak` directly and subscribe to the raw Effect
state or event streams instead of going through this React connector.

### 4. Send messages with `useDispatch`

```tsx
import { useDispatch } from '@oak/oak-react'
import { counter, CounterMsg } from '@oak/example-prog-counter'

export function CounterButtons() {
  const dispatch = useDispatch(counter.tag)

  return (
    <div>
      <button onClick={() => dispatch(CounterMsg.Decrement())}>-</button>
      <button onClick={() => dispatch(CounterMsg.Increment())}>+</button>
    </div>
  )
}
```

`useDispatch(tag)` returns a stable callback with Redux-like ergonomics: call it from an event handler and Oak enqueues the message into the program.

### 5. Put it together

```tsx
import { OakProvider } from './oak-provider.js'
import { CounterButtons } from './counter-buttons.js'
import { CounterValue } from './counter-value.js'

export function App() {
  return (
    <OakProvider>
      <CounterValue />
      <CounterButtons />
    </OakProvider>
  )
}
```

## API

### `OakRuntimeContext`

React context used to provide the current `ManagedRuntime`.

### `useManagedRuntime(layer)`

Creates and owns a `ManagedRuntime` for the given Oak layer. Returns a
`ManagedRuntime` during the first client render.

Use this at the top of your interactive React tree or inside a dedicated client
provider component. The runtime uses the first `layer` value for the provider's
lifetime. `@oak/oak-react` warns once if that layer identity changes after
mount; use a keyed provider when you want a fresh runtime. Do not call it from
server components.

### `useSelector(tag, selector, eq?)`

Subscribes to a selected slice of Oak state.

The default equality guard is Effect `Equal.equals`, so Effect data types such
as `Data.struct`, `Data.Class`, `Option`, `Either`, and collection values use
value equality. Pass a custom `eq` when selecting plain JavaScript aggregates or
when a domain-specific comparison is cheaper.

Use top-level or otherwise stable selector functions when possible for the best React performance.

### `useDispatch(tag)`

Returns `(message) => void`.

This is the normal UI entrypoint for Oak. Dispatch from click handlers, form handlers, effects, or any other React event boundary.

## Next.js and SSR

The main rule for Next.js and SSR is simple:

- the server may fetch data and choose initial model values
- the client provider creates Oak programs, layers, and the managed runtime
- Oak runtime state is not shared between the server render and the browser

`useManagedRuntime` is a React client hook. Keep it inside a client component
boundary and build its programs/layer from serializable seed data passed through
props. Oak runtimes own fibers, scopes, subscriptions, inboxes, and dispatch
loops; those are interactive lifetime concerns, not module-level server
singletons.

- put your Oak provider in a file with `'use client'`
- call `useManagedRuntime(...)` only from that client provider
- pass only serializable seed data across the server/client boundary
- create request-specific Oak programs from factories in the client provider
- do not call `ManagedRuntime.make(...)` directly in server code
- do not keep request-specific programs or runtimes in module-level singletons

### Client-only provider

```tsx
'use client'

import type { ReactNode } from 'react'
import { makeOakLayer } from '@oak/oak'
import { OakRuntimeContext, useManagedRuntime } from '@oak/oak-react'
import { counter } from './counter-program.js'

const AppLayer = makeOakLayer(counter)

export function OakProvider({ children }: { readonly children: ReactNode }) {
  const runtime = useManagedRuntime(AppLayer)

  return <OakRuntimeContext.Provider value={runtime}>{children}</OakRuntimeContext.Provider>
}
```

Then render that provider from your Next app tree in a client boundary. The
provider and its children are client components; server components should pass
serializable seed data into that boundary instead of creating an Oak runtime.

### State hydration from server data

Oak does not need a special hydration API. Fetch data on the server with normal
server tools, build a serializable initial-state object, pass it into a client
provider, and create Oak programs from that state on the client.

Think of the value crossing the server/client boundary as an Oak seed, not an
Oak store. The actual Oak store is the client-side running program inside a
client-side `ManagedRuntime`.

The important pattern is:

- fetch data on the server
- pass that data into a client component as props
- create Oak programs from those values before selector components mount
- provide raw Oak programs through an app-local React context
- provide the `ManagedRuntime` through `OakRuntimeContext`
- hide raw Oak programs behind app-local hooks

That means request-specific initial state should come from program factories, not from module-level singleton programs.

#### Server page

```tsx
import { SessionOakProvider } from './session-oak-provider.js'
import { SessionClientPage } from './session-client-page.js'
import { loadSession } from './data.js'

export default async function Page() {
  const session = await loadSession()

  return (
    <SessionOakProvider session={session}>
      <SessionClientPage />
    </SessionOakProvider>
  )
}
```

#### Program factory

```typescript
import { makeOak } from '@oak/oak'
import type { Session } from './session.js'
import { initModel } from './model.js'
import { update } from './update.js'

export function makeSessionProgram(session: Session) {
  return makeOak({
    name: 'SessionProgram',
    init: initModel(session),
    update,
  })
}
```

#### Client provider

```tsx
'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { OakRuntimeContext, useManagedRuntime } from '@oak/oak-react'
import { makeSessionProgram } from './session-program.js'
import type { Session, SessionModel } from './session.js'

const SessionProgramContext = createContext<ReturnType<typeof makeSessionProgram> | null>(null)

export function SessionOakProvider({
  session,
  children,
}: {
  readonly session: Session
  readonly children: ReactNode
}) {
  const [program] = useState(() => makeSessionProgram(session))
  const runtime = useManagedRuntime(program.layer)

  return (
    <SessionProgramContext.Provider value={program}>
      <OakRuntimeContext.Provider value={runtime}>{children}</OakRuntimeContext.Provider>
    </SessionProgramContext.Provider>
  )
}
```

Then export app-local hooks that hide the program object from ordinary components:

```tsx
import { useDispatch, useSelector } from '@oak/oak-react'

function useSessionProgram() {
  const program = useContext(SessionProgramContext)
  if (program === null) throw new Error('SessionOakProvider is missing')
  return program
}

export function useSessionSelector<A>(selector: (model: SessionModel) => A): A {
  const program = useSessionProgram()
  return useSelector(program.tag, selector)
}

export function useSessionDispatch() {
  const program = useSessionProgram()
  return useDispatch(program.tag)
}
```

This keeps runtime creation client-only while still letting the server decide the initial model values. `session` is a mount-time seed; if a route change should reset Oak state, remount the provider with a `key`. If an already-running Oak session should react to new props, dispatch an explicit message after mount.

### SSR considerations

Server rendering is request-scoped. An Oak runtime is app-instance-scoped. If you
try to share one runtime between server rendering and the browser, or keep a
request-specific runtime in module scope, you can create cross-request state
leaks, duplicated command/subscription work, fibers that outlive the request, or
hydration mismatches.

For that reason, `@oak/oak-react` does not try to run Oak inside a
non-interactive server render. It lets the server choose serializable seed data,
then lets the browser own the interactive Oak runtime.

If you need fully server-rendered markup for the same data, render that markup
from plain serializable props outside Oak hooks. The interactive Oak tree can
then mount on the client from the same seed, but it is still a separate client
runtime.

## Guidance

- Keep `dispatch` in UI event handlers; do not reach into the advanced runtime surface directly from components.
- Prefer stable selectors over creating new expensive selector functions inline.
- If you need request-specific initial state, build Oak programs from factories instead of exporting a singleton `const program = makeOak(...)`.
- Treat server-fetched props as mount-time seeds. Key the provider when a route or identity change should create a fresh Oak runtime.
- If mounted Oak state should react to changing props without resetting, dispatch an explicit message after mount.
- Use the core program runtime's `events` and `diagnostics` streams for devtools or diagnostics, not React effects inside UI components.
