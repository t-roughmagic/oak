import { Data } from 'effect'

export interface CounterModel {
  readonly count: number
}

export const CounterModel = Data.case<CounterModel>()

export const init = CounterModel({ count: 0 })
