# Oak React Example

This package shows how to wire `@oak/oak` to React with `@oak/oak-react`.

The app uses the client-seeded provider pattern:

- example packages export `make*Program(initial)` factories
- `src/oak-provider.tsx` receives initial state, constructs programs once, composes one runtime, and exposes app-local hooks
- UI components call hooks like `useCounterSelector` and `useCounterDispatch` instead of importing raw Oak programs
- `src/app.tsx` passes non-default initial values to demonstrate that selector components mount from the supplied seed
- `src/hydration.test.tsx` models two server-fed pages and records selector commits from `useLayoutEffect` to prove no default-init value reaches a pre-paint Oak commit

The same shape maps to SSR frameworks: server code fetches data and passes a serializable initial-state object into the client provider; Oak starts on the client from that state.
