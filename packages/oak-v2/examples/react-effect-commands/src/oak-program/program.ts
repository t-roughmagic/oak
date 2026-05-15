import { makeOakEffectProgram } from '../../../../src/platform-effect/index.js'
import type { DiceRoller } from './dice-roller.js'
import type { DiceModel } from './model.js'
import { initialModel } from './model.js'
import { DiceMsg } from './message.js'
import { update } from './update.js'

export { DiceRollerLive } from './dice-roller.js'

export function makeDiceProgram(init: DiceModel = initialModel) {
  return makeOakEffectProgram<DiceModel, DiceMsg, DiceRoller>({
    tagKey: '@oak/oak-v2-example/ReactEffectDiceCommands',
    init,
    update,
  })
}

export const diceProgram = makeDiceProgram()
