import { Effect, ManagedRuntime, SubscriptionRef } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeOak, makeOakLayer, type Update } from '../src/index.js'

type NoopMsg = {
  readonly _tag: 'Noop'
}

const noopUpdate =
  <M>(): Update<M, NoopMsg, never> =>
  () => [(model) => model, []]

describe('makeOakLayer', () => {
  it('composes multiple Oak programs into one managed runtime layer', async () => {
    const counter = makeOak({
      name: 'MakeOakLayerCounter',
      init: { count: 1 },
      update: noopUpdate<{ readonly count: number }>(),
    })
    const timer = makeOak({
      name: 'MakeOakLayerTimer',
      init: { seconds: 2 },
      update: noopUpdate<{ readonly seconds: number }>(),
    })
    const runtime = ManagedRuntime.make(makeOakLayer(counter, timer))

    try {
      const [counterModel, timerModel] = runtime.runSync(
        Effect.all([
          Effect.flatMap(counter.tag, (svc) => SubscriptionRef.get(svc.state)),
          Effect.flatMap(timer.tag, (svc) => SubscriptionRef.get(svc.state)),
        ]),
      )

      expect(counterModel).toEqual({ count: 1 })
      expect(timerModel).toEqual({ seconds: 2 })
    } finally {
      await runtime.dispose()
    }
  })
})
