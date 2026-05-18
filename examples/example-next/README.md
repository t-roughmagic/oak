# `@oak/example-next`

Modern Next.js App Router example for Oak.

- Server Components read route params and search params, build a serializable
  seed, and pass it into a Client Component as props.
- The client boundary creates one Oak Effect program and one scoped
  `ManagedRuntime` from that seed, then hands the driver to
  `OakEffectViewProvider`.
- Route links and `useRouter` navigation intentionally change the seed key so
  page navigation remounts the Oak runtime with fresh server state.
- The Oak program includes manual commands, an Effect service, and a
  subscription-driven auto-refresh loop.

Run it with:

```sh
pnpm --filter @oak/example-next dev
```
