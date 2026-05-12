# React Effect Dice Commands Example

This scratchpad example shows the v2 shape for a standalone Effect-platform Oak
program hosted in React.

It demonstrates:

- defining a model and message type
- writing an Effect command that rolls one die after a timeout and returns the
  next Oak message
- exporting one Effect-platform Oak program artifact
- composing the Oak program layer with the app's service layers
- creating an Effect `ManagedRuntime` through `@oak/react-effect-provider`
- handing the running program's view driver to Oak's React adapter
- selecting three independent die states and composing a derived selector for
  the total
- keeping the Oak program behind `src/oak-program/index.ts`, so React imports
  only the program artifact, service layer, messages, selectors, and small view
  types
- keeping update logic in `src/oak-program/update.ts`, where Optics and `pipe`
  compose the nested die-state mutations

The important split:

- `diceProgram.layer` is composed with `DiceRollerLive` before runtime creation.
- `src/oak-program/index.ts` is the app-facing export boundary for the Oak
  program.
- `EffectRuntimeProvider` only manages the generic Effect runtime lifecycle.
- `OakEffectViewProvider` resolves the Oak service from that runtime and passes
  its driver to `<OakProvider />`.
- React components use `useOakSelector` and `useOakDispatch`; they never see the
  Effect service or the internal kernel.

Typecheck this example with:

```sh
pnpm exec tsc --noEmit -p packages/oak-v2/examples/react-effect-commands/tsconfig.json
```
