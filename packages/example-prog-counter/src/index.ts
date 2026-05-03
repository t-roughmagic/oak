import { makeOak } from '@oak/oak'
import { init } from './model.js'
import { update } from './update.js'

export type { CounterModel } from './model.js'
export { CounterMsg } from './message.js'

export function makeCounterProgram(initial = init) {
  return makeOak({
    name: 'CounterExample',
    init: initial,
    update,
  })
}

export const counter = makeCounterProgram()
