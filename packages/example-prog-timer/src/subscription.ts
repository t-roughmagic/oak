import { Effect, Stream } from 'effect'
import type { Sub } from '@oak/oak'
import type { TimerModel } from './model.js'
import type { TimerMsg } from './message.js'
import { TimerMsg as Msg } from './message.js'

/**
 * A subscription that ticks at the interval stored in model state.
 *
 * - `shouldReplace` fires when `intervalMs` changes, tearing down the
 *   old loop and starting a new one with the updated interval.
 * - `run` reads `model.intervalMs` and builds an Effect-based loop
 *   that sleeps, then emits `Tick`, forever.
 */
export const tickSub: Sub<TimerModel, TimerMsg, never> = {
  shouldReplace: (prev, curr) => prev.intervalMs !== curr.intervalMs,
  run: (model) => Stream.repeatEffect(Effect.as(Effect.sleep(model.intervalMs), Msg.Tick())),
}
