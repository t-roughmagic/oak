import { Effect } from 'effect'
import type { Update } from '@oak/core'
import type { EffectCommand } from '@oak/platform-effect'
import type { RandomModel } from './model.js'
import { RandomMsg } from './message.js'

const fetchCmd: EffectCommand<RandomModel, RandomMsg> = () =>
  Effect.sleep('2 seconds').pipe(
    Effect.map(() => RandomMsg.Set({ value: Math.floor(Math.random() * 100) + 1 })),
  )

export const update: Update<RandomModel, RandomMsg, EffectCommand<RandomModel, RandomMsg>> = (
  msg,
) =>
  RandomMsg.$match(msg, {
    Fetch: () => ({
      mutation: (model: RandomModel) => ({ ...model, pending: true }),
      effects: [fetchCmd],
    }),
    Set: ({ value }) => ({
      mutation: () => ({ pending: false, value }),
      effects: [],
    }),
  })
