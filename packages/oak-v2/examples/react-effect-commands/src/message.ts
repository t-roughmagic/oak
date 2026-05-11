import { Data } from 'effect'

export type RandomMsg = Data.TaggedEnum<{
  Fetch: {}
  Set: { readonly value: number }
  Failed: { readonly message: string }
}>

export const RandomMsg = Data.taggedEnum<RandomMsg>()
