import { Data } from 'effect'

export interface TimerModel {
  readonly seconds: number
  readonly intervalMs: number
}

export const TimerModel = Data.case<TimerModel>()

export const init = TimerModel({ seconds: 0, intervalMs: 1000 })
