import { makeOak } from '@oak/oak'
import { init } from './model.js'
import { tickSub } from './subscription.js'
import { update } from './update.js'

export type { TimerModel } from './model.js'
export { TimerMsg } from './message.js'

export function makeTimerProgram(initial = init) {
  return makeOak({
    name: 'TimerExample',
    init: initial,
    update,
    subscriptions: [tickSub],
  })
}

export const timer = makeTimerProgram()
