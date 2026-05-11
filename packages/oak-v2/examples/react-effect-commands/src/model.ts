import { Data } from 'effect'

export interface RandomModel {
  readonly pending: boolean
  readonly value: number | null
  readonly error: string | null
}

export const RandomModel = Data.case<RandomModel>()

export const initialModel = RandomModel({
  pending: false,
  value: null,
  error: null,
})
