import { Context, Effect, Layer } from 'effect'

export interface DiceRoller {
  readonly roll: Effect.Effect<number>
}

export const DiceRoller = Context.GenericTag<DiceRoller>('@oak/oak-v2-example/DiceRoller')

export const DiceRollerLive: Layer.Layer<DiceRoller> = Layer.succeed(
  DiceRoller,
  DiceRoller.of({
    roll: Effect.sync(() => Math.floor(Math.random() * 6) + 1),
  }),
)
