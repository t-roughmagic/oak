import { Effect, Stream } from 'effect'
import type { EffectSub } from '@oak/oak-platform-effect'
import { DiceMsg } from './message.js'
import type { AutoRollState, DiceModel } from './model.js'

type AutoRollSelection = Pick<AutoRollState, 'enabled' | 'intervalMs'>

export const autoRollSub: EffectSub<DiceModel, DiceMsg, never, AutoRollSelection> = {
  select: (model) => ({
    enabled: model.autoRoll.enabled,
    intervalMs: model.autoRoll.intervalMs,
  }),
  eq: (prev, curr) => prev.enabled === curr.enabled && prev.intervalMs === curr.intervalMs,
  run: ({ enabled, intervalMs }) =>
    enabled
      ? Stream.repeatEffect(Effect.as(Effect.sleep(intervalMs), DiceMsg.AutoRollTick()))
      : Stream.empty,
}
