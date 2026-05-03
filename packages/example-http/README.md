# Oak HTTP Layer Example

This example shows how an Oak program can depend on Effect services such as an
HTTP client or a custom JSON-RPC client, while leaving the concrete service
layers to the application that runs the program.

The pattern is:

- the Oak program declares service requirements through its command and
  subscription environment type (`S`)
- the program layer keeps those requirements in its input type
- the consumer composes the Oak program layer with the service layers it wants
  to provide
- React or another runtime receives the fully provided application layer

## What This Package Ships

- `JokeService` — a `Context.GenericTag` describing a service that fetches a
  single dad joke. Acts as the program's HTTP boundary.
- `JokeServiceLive` — calls `https://icanhazdadjoke.com/` with `globalThis.fetch`
  and parses the response. Use this in the browser app.
- `JokeServiceFake(joke)` — returns a canned joke without touching the network.
  Use this in tests, SSR, or local dev when you want determinism.
- `JokeMsg`, `JokeModel`, `makeJokeProgram` — the Oak program itself. Its
  `update` references `JokeService` from a command, which propagates into the
  program layer's `RIn`.

## Wiring It Up

The program's layer cannot start on its own — it requires `JokeService`. The
consumer composes the Oak layer with a service layer before handing it to the
runtime:

```typescript
import { Layer } from 'effect'
import { makeOakLayer } from '@oak/oak'
import { makeJokeProgram, JokeServiceLive } from '@oak/example-http'

const program = makeJokeProgram()

// makeOakLayer keeps `JokeService` in the layer's RIn until we provide it.
const appLayer = makeOakLayer(program).pipe(Layer.provide(JokeServiceLive))

// `appLayer` now has RIn = never and can be passed to useManagedRuntime,
// ManagedRuntime.make, or any Effect runtime.
```

In `oak-react-example/src/oak-provider.tsx` this is composed alongside the
other example programs, and `JokeServiceLive` is provided once at the React
provider boundary. UI code never sees the service:

```typescript
dispatch(JokeMsg.Fetch())
```

## Why This Matters

- Dispatch stays a plain function call from React. Components never thread an
  HTTP client (or any service) through props or context.
- The command can still use `JokeService` because Oak captures the program's
  Effect context when its layer starts.
- Swapping `JokeServiceLive` for `JokeServiceFake('a canned joke')` in tests is
  a one-line layer change. The program is unchanged.
- Adding a second service requirement (logging, retry policy, auth) is the same
  pattern: declare it on a command, provide it at the runtime boundary.
