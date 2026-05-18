import { Data } from 'effect'

export const dieIds = ['one', 'two', 'three'] as const

export type DieId = (typeof dieIds)[number]

export interface DieState {
  readonly value: number
  readonly rolling: boolean
  readonly error: string | null
}

export type DiceById = {
  readonly [Id in DieId]: DieState
}

export interface AutoRollState {
  readonly enabled: boolean
  readonly intervalMs: number
  readonly ticks: number
}

export interface DiceModel {
  readonly dice: DiceById
  readonly autoRoll: AutoRollState
}

export const DieState = Data.case<DieState>()
export const AutoRollState = Data.case<AutoRollState>()
export const DiceModel = Data.case<DiceModel>()

const initialDie = (value: number): DieState =>
  DieState({
    value,
    rolling: false,
    error: null,
  })

export const initialModel = DiceModel({
  dice: {
    one: initialDie(1),
    two: initialDie(1),
    three: initialDie(1),
  },
  autoRoll: AutoRollState({
    enabled: false,
    intervalMs: 2_000,
    ticks: 0,
  }),
})
