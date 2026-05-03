import * as Optic from '@fp-ts/optic'
import type { Update } from '@oak/oak'
import type { TimerModel } from './model.js'
import { TimerMsg } from './message.js'

const _seconds = Optic.id<TimerModel>().at('seconds')
const _intervalMs = Optic.id<TimerModel>().at('intervalMs')

export const update: Update<TimerModel, TimerMsg, never> = TimerMsg.$match({
  Tick: () => [Optic.modify(_seconds)((n) => n + 1), []] as const,
  Reset: () => [Optic.modify(_seconds)(() => 0), []] as const,
  SetInterval: ({ ms }) => [Optic.replace(_intervalMs)(ms), []] as const,
})
