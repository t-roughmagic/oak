import { Effect } from 'effect'
import { makeOakEffectProgram, type EffectCommand } from '../../../src/platform-effect/index.js'
import type { RandomModel } from './model.js'
import { initialModel } from './model.js'
import { RandomMsg } from './message.js'

type RandomCommand = EffectCommand<RandomModel, RandomMsg>

const fetchRandom: RandomCommand = () =>
  Effect.sleep('250 millis').pipe(
    Effect.map(() => Math.floor(Math.random() * 100) + 1),
    Effect.map((value) => RandomMsg.Set({ value })),
    Effect.catchAll((error) => Effect.succeed(RandomMsg.Failed({ message: String(error) }))),
  )

export function makeRandomProgram(init: RandomModel = initialModel) {
  return makeOakEffectProgram<RandomModel, RandomMsg>({
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
