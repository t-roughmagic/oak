import { Effect, Stream } from 'effect'
import type { EffectSub } from '@oak/platform-effect'
import type { TimerModel } from './model.js'
import { TimerMsg } from './message.js'

/**
 * Ticks at the interval stored in model state. The new `EffectSub` shape
 * splits "what value to watch" (`select`) from "how to compare it" (`eq`),
 * which the platform uses to switch the running stream when the selected
 * value changes.
 */
export const tickSub: EffectSub<TimerModel, TimerMsg, never, number> = {
  select: (model) => model.intervalMs,
  run: (intervalMs) =>
    Stream.repeatEffect(Effect.as(Effect.sleep(intervalMs), TimerMsg.Tick())),
}
