import * as Optic from '@fp-ts/optic'
import type { Update } from '@oak/oak'
import type { CounterModel } from './model.js'
import { CounterMsg } from './message.js'

const _count = Optic.id<CounterModel>().at('count')

export const update: Update<CounterModel, CounterMsg, never> = CounterMsg.$match({
  Increment: () => [Optic.modify(_count)((n) => n + 1), []] as const,
  Decrement: () => [Optic.modify(_count)((n) => n - 1), []] as const,
})
