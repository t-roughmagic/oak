import { Effect, Equal, Stream } from 'effect'
import type { OakKernel, OakState } from '../core/index.js'

/**
 * Effect-Stream subscription. The runtime watches `select(model)`, switches
 * the running stream when its value changes (per `eq` / `Equal.equals`), and
 * dispatches every emitted message back into the kernel.
 *
 * Subscriptions are a runtime concept, not a kernel concept — different
 * runtimes use different async paradigms (Effect Stream, RxJS Observable,
 * Promise polling, …). This shape is specific to the Effect runtime.
 */
export interface EffectSub<M, Msg, R = never, A = unknown> {
  select(model: M): A
  run(value: A): Stream.Stream<Msg, never, R>
  eq?(prev: A, curr: A): boolean
}

/** Lifts the kernel's read-only `OakState` into an Effect `Stream` of model values. */
export function stateStream<M>(state: OakState<M>): Stream.Stream<M> {
  return Stream.asyncPush<M>((emit) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        emit.single(state.value)
        return state.subscribe((model) => {
          emit.single(model)
        })
      }),
      (unsubscribe) => Effect.sync(unsubscribe),
    ),
  )
}

export function runEffectSub<M, Msg, R, A>(
  kernel: OakKernel<M, Msg>,
  sub: EffectSub<M, Msg, R, A>,
): Effect.Effect<void, never, R> {
  const eq = sub.eq ?? Equal.equals

  return stateStream(kernel.state).pipe(
    Stream.map((model) => sub.select(model)),
    Stream.zipWithPrevious,
    Stream.filter(([prev, curr]) => (prev._tag === 'None' ? true : !eq(prev.value, curr))),
    Stream.map(([, curr]) => curr),
    Stream.flatMap((value) => sub.run(value), { switch: true }),
    Stream.runForEach((message) =>
      Effect.sync(() => {
        kernel.dispatch(message)
      }),
    ),
  )
}
