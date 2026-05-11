import { Cause, Context, Effect, Equal, ExecutionStrategy, Exit, Scope, Stream } from 'effect'
import type {
  OakDiagnostic,
  OakEvent,
  OakKernel,
  OakState,
  ProducedEffect,
  Subscribable,
} from './kernel.js'

/**
 * Effect-backed command instruction for the generic kernel.
 *
 * `R = never` means the command requires no Effect environment by default.
 * Commands that need services should specify `R` and provide a matching
 * `Context` to the runner.
 */
export type EffectCommand<M, Msg, R = never> = (msg: Msg, model: M) => Effect.Effect<Msg, never, R>

/** Effect Stream subscription that emits messages back into the kernel. */
export interface EffectSubscription<M, Msg, R = never, A = unknown> {
  select(model: M): A
  run(value: A): Stream.Stream<Msg, never, R>
  eq?(prev: A, curr: A): boolean
}

/** Running Effect harness attached to a generic Oak kernel. */
export interface RunningOakEffect<M, Msg> {
  readonly events: Stream.Stream<OakEvent<M, Msg>>
  readonly diagnostics: Stream.Stream<OakDiagnostic>
  readonly disposeEffect: Effect.Effect<void>
  dispose(): Promise<void>
}

/** Options for attaching the Effect harness outside an existing Effect scope. */
export interface RunOakEffectOptions<M, Msg, R> {
  readonly context?: Context.Context<R>
  readonly subscriptions?: ReadonlyArray<EffectSubscription<M, Msg, R>>
}

interface StartOakEffectOptions<M, Msg, R> extends RunOakEffectOptions<M, Msg, R> {
  readonly scope: Scope.Scope
  readonly closeScope?: Scope.CloseableScope
}

function subscribableStream<A>(source: Subscribable<A>): Stream.Stream<A> {
  return Stream.asyncPush<A>((emit) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        source.subscribe((value) => {
          emit.single(value)
        }),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    ),
  )
}

function stateStream<M>(state: OakState<M>): Stream.Stream<M> {
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

function reportCause<M, Msg, Fx>(
  oak: OakKernel<M, Msg, Fx>,
  source: 'effect' | 'subscription',
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> {
  if (Cause.isInterruptedOnly(cause)) {
    return Effect.void
  }

  return Effect.sync(() => {
    oak.reportDiagnostic(source, cause)
  })
}

function dispatchDeferred<M, Msg, Fx>(
  oak: OakKernel<M, Msg, Fx>,
  message: Msg,
): Effect.Effect<void> {
  return Effect.sync(() => {
    queueMicrotask(() => {
      oak.dispatch(message)
    })
  })
}

function scheduleCommand<M, Msg, R>(
  oak: OakKernel<M, Msg, EffectCommand<M, Msg, R>>,
  produced: ProducedEffect<M, Msg, EffectCommand<M, Msg, R>>,
  context: Context.Context<R>,
  scope: Scope.Scope,
): void {
  Effect.runFork(
    Effect.suspend(() => produced.effect(produced.message, produced.model)).pipe(
      Effect.flatMap((message) => dispatchDeferred(oak, message)),
      Effect.provide(context),
      Effect.catchAllCause((cause) => reportCause(oak, 'effect', cause)),
      Effect.forkIn(scope),
      Effect.asVoid,
      Effect.catchAllCause((cause) => reportCause(oak, 'effect', cause)),
    ),
  )
}

function runSubscription<M, Msg, R, A>(
  oak: OakKernel<M, Msg, EffectCommand<M, Msg, R>>,
  subscription: EffectSubscription<M, Msg, R, A>,
): Effect.Effect<void, never, R> {
  const eq = subscription.eq ?? Equal.equals

  return stateStream(oak.state).pipe(
    Stream.map((model) => subscription.select(model)),
    Stream.zipWithPrevious,
    Stream.filter(([prev, curr]) => (prev._tag === 'None' ? true : !eq(prev.value, curr))),
    Stream.map(([, curr]) => curr),
    Stream.flatMap((value) => subscription.run(value), { switch: true }),
    Stream.runForEach((message) => dispatchDeferred(oak, message)),
  )
}

function startOakEffect<M, Msg, R>(
  oak: OakKernel<M, Msg, EffectCommand<M, Msg, R>>,
  options: StartOakEffectOptions<M, Msg, R>,
): RunningOakEffect<M, Msg> {
  const context = options.context ?? (Context.empty() as Context.Context<R>)
  let disposed = false
  const unsubscribeEffects = oak.effects.subscribe((produced) => {
    if (!disposed) {
      scheduleCommand(oak, produced, context, options.scope)
    }
  })

  for (const subscription of options.subscriptions ?? []) {
    Effect.runFork(
      runSubscription(oak, subscription).pipe(
        Effect.provide(context),
        Effect.catchAllCause((cause) => reportCause(oak, 'subscription', cause)),
        Effect.forkIn(options.scope),
        Effect.asVoid,
        Effect.catchAllCause((cause) => reportCause(oak, 'subscription', cause)),
      ),
    )
  }

  const disposeEffect = Effect.gen(function* () {
    if (disposed) {
      return
    }

    disposed = true
    unsubscribeEffects()
    if (options.closeScope) {
      yield* Scope.close(options.closeScope, Exit.succeed(undefined))
    }
  })

  return {
    events: subscribableStream(oak.events),
    diagnostics: subscribableStream(oak.diagnostics),
    disposeEffect,
    dispose: () => Effect.runPromise(disposeEffect),
  }
}

export function runOakEffect<M, Msg, R = never>(
  oak: OakKernel<M, Msg, EffectCommand<M, Msg, R>>,
  options: RunOakEffectOptions<M, Msg, R> = {},
): RunningOakEffect<M, Msg> {
  const scope = Effect.runSync(Scope.make(ExecutionStrategy.sequential))

  return startOakEffect(oak, {
    ...options,
    scope,
    closeScope: scope,
  })
}

export function runOakEffectScoped<M, Msg, R = never>(
  oak: OakKernel<M, Msg, EffectCommand<M, Msg, R>>,
  options: Omit<RunOakEffectOptions<M, Msg, R>, 'context'> = {},
): Effect.Effect<RunningOakEffect<M, Msg>, never, R | Scope.Scope> {
  return Effect.gen(function* () {
    const context = yield* Effect.context<R>()
    const scope = yield* Effect.scope
    const running = startOakEffect(oak, {
      ...options,
      context,
      scope,
    })

    yield* Effect.addFinalizer(() => running.disposeEffect)

    return running
  })
}
