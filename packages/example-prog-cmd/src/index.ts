import { makeOak } from '@oak/oak'
import { init } from './model.js'
import { update } from './update.js'

export type { RandomModel } from './model.js'
export { RandomMsg } from './message.js'

export function makeRandomProgram(initial = init) {
  return makeOak({
    name: 'RandomCommand',
    init: initial,
    update,
  })
}

export const random = makeRandomProgram()
