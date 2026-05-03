import { Effect } from 'effect'
import type { Cmd, Update } from '@oak/oak'
import type { RandomModel } from './model.js'
import { RandomMsg } from './message.js'

const fetchCmd: Cmd<RandomModel, RandomMsg, never> = () =>
  Effect.sleep('2 seconds').pipe(
    Effect.map(() => RandomMsg.Set({ value: Math.floor(Math.random() * 100) + 1 })),
  )

export const update: Update<RandomModel, RandomMsg, never> = RandomMsg.$match({
  Fetch: () => [(_m: RandomModel) => ({ ..._m, pending: true }), [fetchCmd]] as const,
  Set: ({ value }) => [() => ({ pending: false, value }), []] as const,
})
