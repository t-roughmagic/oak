import { Chunk, Effect, Fiber, Layer, ManagedRuntime, Stream, SubscriptionRef } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeEffectSyncStore, type SyncEffectRunner } from '../src/sync-store.js'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function eventually(assertion: () => void, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await delay(5)
    }
  }

  if (lastError) {
    throw lastError
  }
  assertion()
}

function makeSubscriptionFixture(initial: number) {
  const runtime = ManagedRuntime.make(Layer.empty)
  const state = runtime.runSync(SubscriptionRef.make(initial))
  const store = makeEffectSyncStore(runtime, {
    read: SubscriptionRef.get(state),
    changes: Effect.succeed(state.changes),
  })

  return { runtime, state, store }
}

describe('makeEffectSyncStore', () => {
  it('reads the initial synchronous snapshot', async () => {
    const { runtime, store } = makeSubscriptionFixture(42)

    try {
      expect(store.getSnapshot()).toBe(42)
    } finally {
      await runtime.dispose()
    }
  })

  it('fans out state changes to multiple listeners', async () => {
    const { runtime, state, store } = makeSubscriptionFixture(0)
    const seenA: Array<number> = []
    const seenB: Array<number> = []
    const unsubscribeA = store.subscribe(() => seenA.push(store.getSnapshot()))
    const unsubscribeB = store.subscribe(() => seenB.push(store.getSnapshot()))

    try {
      runtime.runSync(SubscriptionRef.set(state, 1))

      await eventually(() => {
        expect(seenA).toContain(1)
        expect(seenB).toContain(1)
      })
    } finally {
      unsubscribeA()
      unsubscribeB()
      await runtime.dispose()
    }
  })

  it('removes unsubscribed listeners without stopping remaining listeners', async () => {
    const { runtime, state, store } = makeSubscriptionFixture(0)
    const seenA: Array<number> = []
    const seenB: Array<number> = []
    const unsubscribeA = store.subscribe(() => seenA.push(store.getSnapshot()))
    const unsubscribeB = store.subscribe(() => seenB.push(store.getSnapshot()))

    try {
      runtime.runSync(SubscriptionRef.set(state, 1))
      await eventually(() => {
        expect(seenA).toContain(1)
        expect(seenB).toContain(1)
      })

      unsubscribeA()
      const seenAAfterUnsubscribe = seenA.length
      runtime.runSync(SubscriptionRef.set(state, 2))

      await eventually(() => {
        expect(seenB).toContain(2)
      })
      await delay(25)

      expect(seenA.slice(seenAAfterUnsubscribe)).toEqual([])
    } finally {
      unsubscribeA()
      unsubscribeB()
      await runtime.dispose()
    }
  })

  it('interrupts the stream when the last listener unsubscribes', async () => {
    const runtime = ManagedRuntime.make(Layer.empty)
    let starts = 0
    let finalizers = 0
    const store = makeEffectSyncStore(runtime, {
      read: Effect.succeed(0),
      changes: Effect.sync(() => {
        starts++
        return Stream.never.pipe(
          Stream.ensuring(
            Effect.sync(() => {
              finalizers++
            }),
          ),
        )
      }),
    })

    try {
      const unsubscribe = store.subscribe(() => {})

      await eventually(() => {
        expect(starts).toBe(1)
      })
      unsubscribe()

      await eventually(() => {
        expect(finalizers).toBe(1)
      })
    } finally {
      await runtime.dispose()
    }
  })

  it('does not need the original runner to stop a subscription', async () => {
    const realRuntime = ManagedRuntime.make(Layer.empty)
    let forkCount = 0
    let finalizers = 0
    const runner: SyncEffectRunner<never> = {
      runSync: (effect) => realRuntime.runSync(effect),
      runFork: (effect) => {
        forkCount++
        if (forkCount > 1) {
          throw new Error('runner disposed')
        }
        return realRuntime.runFork(effect)
      },
    }
    const store = makeEffectSyncStore(runner, {
      read: Effect.succeed(0),
      changes: Effect.succeed(
        Stream.never.pipe(
          Stream.ensuring(
            Effect.sync(() => {
              finalizers++
            }),
          ),
        ),
      ),
    })

    try {
      const unsubscribe = store.subscribe(() => {})
      unsubscribe()

      await eventually(() => {
        expect(finalizers).toBe(1)
      })
    } finally {
      await realRuntime.dispose()
    }
  })

  it('ignores emissions from a stale stream after rapid resubscribe', async () => {
    const realRuntime = ManagedRuntime.make(Layer.empty)
    const actualFibers: Array<Fiber.RuntimeFiber<unknown, unknown>> = []
    const returnedFibers: Array<Fiber.RuntimeFiber<unknown, unknown>> = []
    const emitters: Array<(value: number) => void> = []
    let snapshot = 0

    const runtime: SyncEffectRunner<never> = {
      runSync: (effect) => realRuntime.runSync(effect),
      runFork: (effect) => {
        const actualFiber = realRuntime.runFork(effect)
        actualFibers.push(actualFiber as Fiber.RuntimeFiber<unknown, unknown>)

        const returnedFiber =
          returnedFibers.length === 0 ? realRuntime.runFork(Effect.never) : actualFiber

        returnedFibers.push(returnedFiber as Fiber.RuntimeFiber<unknown, unknown>)
        return returnedFiber
      },
    }

    const store = makeEffectSyncStore(runtime, {
      read: Effect.sync(() => snapshot),
      changes: Effect.sync(() =>
        Stream.async<number>((emit) => {
          emitters.push((value) => emit(Effect.succeed(Chunk.of(value))))
          return Effect.void
        }),
      ),
    })

    const seenA: Array<number> = []
    const seenB: Array<number> = []

    try {
      const unsubscribeA = store.subscribe(() => seenA.push(store.getSnapshot()))
      await eventually(() => {
        expect(emitters).toHaveLength(1)
      })

      snapshot = 1
      emitters[0](1)
      await eventually(() => {
        expect(seenA).toContain(1)
      })

      unsubscribeA()
      const unsubscribeB = store.subscribe(() => seenB.push(store.getSnapshot()))
      await eventually(() => {
        expect(emitters).toHaveLength(2)
      })

      snapshot = 2
      emitters[1](2)
      await eventually(() => {
        expect(seenB).toContain(2)
      })

      snapshot = 999
      emitters[0](999)
      await delay(25)

      expect(store.getSnapshot()).toBe(2)
      expect(seenB).not.toContain(999)

      unsubscribeB()
    } finally {
      for (const fiber of [...actualFibers, ...returnedFibers]) {
        await realRuntime.runPromise(Fiber.interrupt(fiber))
      }
      await realRuntime.dispose()
    }
  })
})
