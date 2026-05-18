import * as Optic from '@fp-ts/optic'
import type { Update } from '@oak/core'
import type { EffectCommand } from '@oak/platform-effect'
import type { TimerModel } from './model.js'
import { TimerMsg } from './message.js'

const _seconds = Optic.id<TimerModel>().at('seconds')
const _intervalMs = Optic.id<TimerModel>().at('intervalMs')

type TimerCmd = EffectCommand<TimerModel, TimerMsg>

export const update: Update<TimerModel, TimerMsg, TimerCmd> = (msg) =>
  TimerMsg.$match(msg, {
    Tick: () => ({ mutation: Optic.modify(_seconds)((n) => n + 1), effects: [] }),
    Reset: () => ({ mutation: Optic.modify(_seconds)(() => 0), effects: [] }),
    SetInterval: ({ ms }) => ({ mutation: Optic.replace(_intervalMs)(ms), effects: [] }),
  })
