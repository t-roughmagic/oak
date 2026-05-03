# `@oak/oak-next-example`

Next.js App Router example for server-seeded Oak state.

The important trick is to not build a server-side Oak runtime. The server
fetches data and passes plain serializable seed values to a client provider. The
client provider creates the Oak program, creates the `ManagedRuntime`, and owns
the interactive store for the lifetime of that mounted React subtree.

## Flow

1. The server route loads page data in `src/app/[page]/page.tsx`.
2. That route returns `<DemoPage page={...} seed={...} />`.
3. `DemoPage` is a client component and remounts `OakPageProvider` when the
   route key changes.
4. `OakPageProvider` turns the seed into a fresh Oak program with
   `makeCounterProgram(seed.counter)`.
5. The provider creates a browser-owned `ManagedRuntime` and passes it through
   `OakRuntimeContext`.
6. Client components read state with `useCounterValue()` and dispatch messages
   with `useCounterDispatch()`.

The server never creates an Oak store. It only chooses the initial model values.

## Why

Server rendering is request-scoped. Oak runtimes are interactive app instances:
they own fibers, inboxes, subscriptions, command execution, and disposal. Trying
to share one runtime between server rendering and the browser makes ownership
unclear and risks duplicated effects, stale request data, cross-request state
leaks, or hydration mismatches.

This example keeps the boundary simple:

- server code produces serializable seeds
- client code creates Oak programs from those seeds
- client code owns runtime disposal
- route changes that should reset Oak state remount the provider with `key`

If you need non-interactive HTML for server rendering, render it from the same
plain data props outside Oak hooks. Then let the client Oak tree mount from that
seed when the browser becomes interactive.

## Files

- `src/app/[page]/page.tsx`: server route that loads serializable seed data.
- `src/app/demo-page.tsx`: client page wrapper that keys the Oak provider by
  route.
- `src/app/page-client.tsx`: client provider, runtime ownership, and app-local
  Oak hooks.
- `src/app/counter-program.ts`: Oak program factory used by the client provider.

## Run

```sh
pnpm --filter @oak/oak-next-example dev
pnpm --filter @oak/oak-next-example build
```
