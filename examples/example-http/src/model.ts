import { Data } from 'effect'

export interface JokeModel {
  readonly pending: boolean
  readonly joke: string | null
  readonly error: string | null
}

export const JokeModel = Data.case<JokeModel>()

export const init = JokeModel({ pending: false, joke: null, error: null })
