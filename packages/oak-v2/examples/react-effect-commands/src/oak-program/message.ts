import { Data } from 'effect'
import type { DieId } from './model.js'

export type DiceMsg = Data.TaggedEnum<{
  Roll: { readonly die: DieId }
  Rolled: { readonly die: DieId; readonly value: number }
  Failed: { readonly die: DieId; readonly message: string }
}>

export const DiceMsg = Data.taggedEnum<DiceMsg>()
