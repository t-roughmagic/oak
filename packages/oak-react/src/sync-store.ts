import { Effect, Fiber, Stream } from 'effect'

/**
 * The synchronous store shape React expects from `useSyncExternalStore`.
 *
 * Oak state lives behind Effect services and streams, but React render must be
 * able to synchronously read the latest snapshot. This tiny interface is the
 * boundary between those two worlds.
 */
export interface SyncStore<A> {
  readonly getSnapshot: () => A
  readonly subscribe: (listener: () => void) => () => void
}

/**
 * The minimum Effect runner needed by the sync bridge.
 *
 * This deliberately avoids depending on `ManagedRuntime`: React may own and
 * dispose a managed runtime, but the state bridge only needs to synchronously
 * read Effect state and fork a stream observer.
 */
export interface SyncEffectRunner<R> {
  readonly runSync: <A, E>(effect: Effect.Effect<A, E, R>) => A
  readonly runFork: <A, E>(effect: Effect.Effect<A, E, R>) => Fiber.RuntimeFiber<A, E>
}

/**
 * Converts an Effect state read plus an Effect change stream into a synchronous
 * external store.
 *
 * The store starts observing on the first listener and interrupts the observer
 * after the last unsubscribe. That keeps React mount/unmount churn cheap while
 * still sharing a single stream subscription across all selector consumers.
 */
export function makeEffectSyncStore<R, A>(
  runner: SyncEffectRunner<R>,
  options: {
    readonly read: Effect.Effect<A, never, R>
    readonly changes: Effect.Effect<Stream.Stream<A, never, R>, never, R>
  },
): SyncStore<A> {
  let currentSnapshot = runner.runSync(options.read)
  const listeners = new Set<() => void>()
  let fiber: Fiber.RuntimeFiber<void, never> | null = null
  let generation = 0

  const notify = (activeGeneration: number) =>
    Effect.flatMap(options.read, (snapshot) =>
      Effect.sync(() => {
        // Fiber interruption is asynchronous. During StrictMode or Next.js
        // page transitions, a new subscription can start before the old fiber
        // has fully stopped. The generation check makes stale emissions inert.
        if (activeGeneration !== generation) {
          return
        }

        currentSnapshot = snapshot
        for (const listener of listeners) {
          listener()
        }
      }),
    )

  const start = () => {
    if (fiber !== null) {
      return
    }

    const activeGeneration = ++generation
    fiber = runner.runFork(
      // The stream is only the wake-up signal. Re-read the snapshot so React
      // observes the authoritative current state, including any update that
      // landed between subscription startup and the first emission.
      Stream.unwrap(options.changes).pipe(Stream.runForEach(() => notify(activeGeneration))),
    )
  }

  const stop = () => {
    if (fiber === null) {
      return
    }

    const currentFiber = fiber
    fiber = null
    generation++
    // Do not use the injected runner to interrupt. React may be unmounting the
    // provider and disposing its ManagedRuntime at the same time this cleanup
    // runs; interrupting an existing Fiber does not need that runtime.
    Effect.runFork(Fiber.interrupt(currentFiber))
  }

  return {
    getSnapshot: () => currentSnapshot,
    subscribe: (listener) => {
      let subscribed = true

      listeners.add(listener)
      start()
      currentSnapshot = runner.runSync(options.read)

      return () => {
        if (!subscribed) {
          return
        }

        subscribed = false
        listeners.delete(listener)
        if (listeners.size === 0) {
          stop()
        }
      }
    },
  }
}
