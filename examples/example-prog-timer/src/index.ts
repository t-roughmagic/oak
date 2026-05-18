import { makeOakEffectProgram } from '@oak/oak-platform-effect'
import { init, type TimerModel } from './model.js'
import type { TimerMsg } from './message.js'
import { tickSub } from './subscription.js'
import { update } from './update.js'

export type { TimerModel } from './model.js'
export { TimerMsg } from './message.js'

export function makeTimerProgram(initial: TimerModel = init) {
  return makeOakEffectProgram<TimerModel, TimerMsg>({
    tagKey: '@oak/example-prog-timer/TimerProgram',
    init: initial,
    update,
    subscriptions: [tickSub],
  })
}

export const timer = makeTimerProgram()
