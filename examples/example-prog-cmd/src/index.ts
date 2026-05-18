import { makeOakEffectProgram } from '@oak/platform-effect'
import { init, type RandomModel } from './model.js'
import type { RandomMsg } from './message.js'
import { update } from './update.js'

export type { RandomModel } from './model.js'
export { RandomMsg } from './message.js'

export function makeRandomProgram(initial: RandomModel = init) {
  return makeOakEffectProgram<RandomModel, RandomMsg>({
    tagKey: '@oak/example-prog-cmd/RandomProgram',
    init: initial,
    update,
  })
}

export const random = makeRandomProgram()
