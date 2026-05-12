import { Context, Effect, Layer } from 'effect'
import { makeOakEffectProgram, type EffectCommand } from '../../../src/platform-effect/index.js'
import type { RandomModel } from './model.js'
import { initialModel } from './model.js'
import { RandomMsg } from './message.js'

type RandomCommand = EffectCommand<RandomModel, RandomMsg, RandomNumberService>

export interface RandomNumberService {
  readonly nextInt: Effect.Effect<number>
}

export const RandomNumberService = Context.GenericTag<RandomNumberService>(
  '@oak/oak-v2-example/RandomNumberService',
)

export const RandomNumberLive: Layer.Layer<RandomNumberService> = Layer.succeed(
  RandomNumberService,
  RandomNumberService.of({
    nextInt: Effect.sync(() => Math.floor(Math.random() * 100) + 1),
  }),
)

const fetchRandom: RandomCommand = () =>
  Effect.sleep('250 millis').pipe(
    Effect.flatMap(() => RandomNumberService),
    Effect.flatMap((random) => random.nextInt),
    Effect.map((value) => RandomMsg.Set({ value })),
    Effect.catchAll((error) => Effect.succeed(RandomMsg.Failed({ message: String(error) }))),
  )

export function makeRandomProgram(init: RandomModel = initialModel) {
  return makeOakEffectProgram<RandomModel, RandomMsg, RandomNumberService>({
    name: 'ReactEffectCommands',
    init,
    update: (msg) => {
      switch (msg._tag) {
        case 'Fetch':
          return {
            mutation: (model) => ({ ...model, pending: true, error: null }),
            effects: [fetchRandom],
          }
        case 'Set':
          return {
            mutation: () => ({
              pending: false,
              value: msg.value,
              error: null,
            }),
            effects: [],
          }
        case 'Failed':
          return {
            mutation: (model) => ({
              ...model,
              pending: false,
              error: msg.message,
            }),
            effects: [],
          }
      }
    },
  })
}

export const randomProgram = makeRandomProgram()
