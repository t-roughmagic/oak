# `@oak/example-react`

Flagship React example for Oak's current stack:

- `OakEffectViewProvider` is the single explicit runtime/program boundary.
- `createOakHooks` gives app code typed selectors and dispatch.
- Dice buttons dispatch command-backed rolls through an Effect service.
- Auto-roll is an `EffectSub` that starts and stops from model state, then feeds
  messages back through the same update loop.
