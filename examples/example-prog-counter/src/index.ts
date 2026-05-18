import { makeOakEffectProgram } from '@oak/platform-effect'
import { init, type CounterModel } from './model.js'
import type { CounterMsg } from './message.js'
import { update } from './update.js'

export type { CounterModel } from './model.js'
export { CounterMsg } from './message.js'

export function makeCounterProgram(initial: CounterModel = init) {
  return makeOakEffectProgram<CounterModel, CounterMsg>({
    tagKey: '@oak/example-prog-counter/CounterProgram',
    init: initial,
    update,
  })
}

export const counter = makeCounterProgram()
