import { Effect, Stream } from 'effect'
import type { EffectSub } from '@oak/platform-effect'
import { DeskMsg } from './message'
import type { DeskModel, RefreshState } from './model'

type RefreshSelection = Pick<RefreshState, 'enabled' | 'intervalMs'>

export const refreshSub: EffectSub<DeskModel, DeskMsg, never, RefreshSelection> = {
  select: (model) => ({
    enabled: model.refresh.enabled,
    intervalMs: model.refresh.intervalMs,
  }),
  eq: (prev, curr) => prev.enabled === curr.enabled && prev.intervalMs === curr.intervalMs,
  run: ({ enabled, intervalMs }) =>
    enabled
      ? Stream.repeatEffect(Effect.as(Effect.sleep(intervalMs), DeskMsg.RefreshTick()))
      : Stream.empty,
}
