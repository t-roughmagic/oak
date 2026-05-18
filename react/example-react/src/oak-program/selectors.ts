import * as Optic from '@fp-ts/optic'
import type { AutoRollState, DiceModel, DieState } from './model.js'
import * as o from './optics.js'

type Selector<S, A> = (model: S) => A

export type DieSelector = (model: DiceModel) => DieState

const combineSelectors = <S, A, B, C, R>(
  selectors: readonly [Selector<S, A>, Selector<S, B>, Selector<S, C>],
  combine: (a: A, b: B, c: C) => R,
): Selector<S, R> => {
  return (model) => combine(selectors[0](model), selectors[1](model), selectors[2](model))
}

export const selectDieOne: DieSelector = Optic.get(o.dieOneOptic)

export const selectDieTwo: DieSelector = Optic.get(o.dieTwoOptic)

export const selectDieThree: DieSelector = Optic.get(o.dieThreeOptic)

export const selectAutoRoll = (model: DiceModel): AutoRollState => model.autoRoll

export const selectDieOneValue: (model: DiceModel) => number = Optic.get(o.dieOneValueOptic)

export const selectDieTwoValue: (model: DiceModel) => number = Optic.get(o.dieTwoValueOptic)

export const selectDieThreeValue: (model: DiceModel) => number = Optic.get(o.dieThreeValueOptic)

export const selectDiceSum = combineSelectors(
  [selectDieOneValue, selectDieTwoValue, selectDieThreeValue] as const,
  (one, two, three) => one + two + three,
)
