# oak-react — pending work

Pending work only for `@oak/oak-react`. Completed fixes, rejected ideas, and
historical design notes belong in docs, tests, or commit history rather than
this file.

`@oak/oak-react` should stay a small connector. React consumers do two things
with Oak: dispatch messages and subscribe to selected state. Non-React consumers
can use `@oak/oak` directly and work with the raw Effect state/event streams.

---

## 1. Add React-Level Selector And Dispatch Tests

**Problem.** `sync-store` has focused unit coverage, and the example app covers
client-seeded hydration, but `@oak/oak-react` still needs more tests at the
React selector/dispatch boundary.

**Coverage to add.**

- `useSelector` works for multiple subscribers to the same program and stops
  notifying unmounted subscribers.
- `useSelector` avoids re-renders when selecting value-equal Effect data such
  as `Data.struct`.
- `useSelector` accepts a custom `eq` for plain JavaScript aggregate selectors.
- `useDispatch` still works if dispatch crosses an async boundary.

Keep these tests narrow; do not duplicate the Next example's page-seed
hydration coverage unless that behavior moves into `@oak/oak-react` itself.

---

## 2. Package Hygiene Before External Publishing

**Problem.** The package is still private and optimized for workspace usage.
Before publishing, consumers should not get duplicate React installs or exposed
internal implementation details.

**Approach.**

- Move `react` from `dependencies` to `peerDependencies` plus `devDependencies`.
- Keep internal files such as `sync-store` out of the public export surface
  unless the sync bridge is deliberately promoted.
- Recheck README install instructions after the peer dependency change.

**Validation.** Run `pnpm --filter @oak/oak-react typecheck`,
`pnpm --filter @oak/oak-react test`, and a workspace install/build check after
the manifest change.
