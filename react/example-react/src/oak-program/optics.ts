import * as Optic from '@fp-ts/optic'
import type { DiceModel, DieId, DieState } from './model.js'

export const diceOptic = Optic.id<DiceModel>().at('dice')
export const dieOptic = (die: DieId) => diceOptic.at(die)

export const dieOneOptic = dieOptic('one')
export const dieTwoOptic = dieOptic('two')
export const dieThreeOptic = dieOptic('three')

export const dieValueOptic = (o: Optic.Lens<DiceModel, DieState>) => o.at('value')
export const dieRollingOptic = (o: Optic.Lens<DiceModel, DieState>) => o.at('rolling')
export const dieErrorOptic = (o: Optic.Lens<DiceModel, DieState>) => o.at('error')

export const dieOneValueOptic = dieValueOptic(dieOneOptic)
export const dieTwoValueOptic = dieValueOptic(dieTwoOptic)
export const dieThreeValueOptic = dieValueOptic(dieThreeOptic)

export const dieOneRollingOptic = dieRollingOptic(dieOneOptic)
export const dieTwoRollingOptic = dieRollingOptic(dieTwoOptic)
export const dieThreeRollingOptic = dieRollingOptic(dieThreeOptic)
