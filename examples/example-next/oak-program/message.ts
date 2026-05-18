import { Data } from 'effect'
import type { DeskFilter, RefreshResult, TaskStatus } from './model'

export type DeskMsg = Data.TaggedEnum<{
  SelectTask: { readonly id: string }
  SetFilter: { readonly filter: DeskFilter }
  SetTaskStatus: { readonly id: string; readonly status: TaskStatus }
  ToggleAutoRefresh: object
  RefreshRequested: object
  RefreshTick: object
  RefreshSucceeded: { readonly result: RefreshResult }
  RefreshFailed: { readonly message: string }
}>

export const DeskMsg = Data.taggedEnum<DeskMsg>()
