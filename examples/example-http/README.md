# Oak HTTP Service Example

Shows how an Oak program can declare a service requirement on its command
environment (`R`) and stay agnostic to how that service is provided. The
consumer composes the program's `Layer` with a service `Layer` before
handing the result to a runtime.

## What this package ships

- `JokeService` — `Context.GenericTag` describing a service that fetches a
  single dad joke. Acts as the program's HTTP boundary.
- `JokeServiceLive` — calls `https://icanhazdadjoke.com/` via `globalThis.fetch`.
  Use this in the browser.
- `JokeServiceFake(joke)` — returns a canned joke. Use in tests, SSR, or
  local dev for determinism.
- `JokeMsg`, `JokeModel`, `makeJokeProgram` — the Oak program. Its `update`
  references `JokeService` from a command, which propagates into the
  program layer's input requirements.

## Wiring

The program's layer cannot start on its own — it requires `JokeService`.
Compose with a service layer before passing to a runtime:

```ts
import { Layer, ManagedRuntime } from 'effect'
import { makeJokeProgram, JokeServiceLive } from '@oak/example-http'

const program = makeJokeProgram()

const appLayer = program.layer.pipe(Layer.provideMerge(JokeServiceLive))

const runtime = ManagedRuntime.make(appLayer)
```

In a React app, hand `runtime` and `program` to `<OakEffectViewProvider>`
from `@oak/platform-effect-react`. UI code dispatches `JokeMsg.Fetch()`
and never sees the service.

## Why this matters

- Dispatch stays a plain function call. Components never thread an HTTP
  client through props or context.
- Commands can use `JokeService` because the Effect platform captures the
  program's context when its layer is built.
- Swapping `JokeServiceLive` for `JokeServiceFake('a canned joke')` in
  tests is a one-line layer change.
- Adding a second service requirement (logging, retry, auth) follows the
  same pattern: declare it on a command's `R`, provide it at the runtime
  boundary.
