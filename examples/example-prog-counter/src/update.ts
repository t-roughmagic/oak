import * as Optic from '@fp-ts/optic'
import type { Update } from '@oak/core'
import type { EffectCommand } from '@oak/platform-effect'
import type { CounterModel } from './model.js'
import { CounterMsg } from './message.js'

const _count = Optic.id<CounterModel>().at('count')

type CounterCmd = EffectCommand<CounterModel, CounterMsg>

export const update: Update<CounterModel, CounterMsg, CounterCmd> = (msg) =>
  CounterMsg.$match(msg, {
    Increment: () => ({ mutation: Optic.modify(_count)((n) => n + 1), effects: [] }),
    Decrement: () => ({ mutation: Optic.modify(_count)((n) => n - 1), effects: [] }),
  })
