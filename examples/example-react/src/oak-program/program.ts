import { makeOakEffectProgram } from '@oak/platform-effect'
import type { DiceRoller } from './dice-roller.js'
import type { DiceModel } from './model.js'
import { initialModel } from './model.js'
import { DiceMsg } from './message.js'
import { autoRollSub } from './subscription.js'
import { update } from './update.js'

export { DiceRollerLive } from './dice-roller.js'

export function makeDiceProgram(init: DiceModel = initialModel) {
  return makeOakEffectProgram<DiceModel, DiceMsg, DiceRoller>({
    tagKey: '@oak/example-react/DiceProgram',
    init,
    update,
    subscriptions: [autoRollSub],
  })
}

export const diceProgram = makeDiceProgram()
