import { Cause, Effect, Layer, type Scope, Stream } from 'effect'
import { makeKernel, type Diagnostic, type OakEvent, type Update } from '../core/index.js'
import { type EffectCommand, makeScheduleCommand } from './command.js'
import { type EffectSub, runEffectSub } from './subscription.js'
import { makeOakTag, type OakService, type OakTag } from './service.js'

export interface OakProgramConfig<M, Msg, R = never> {
  readonly name: string
  readonly init: M
  readonly update: Update<M, Msg, EffectCommand<M, Msg, R>>
  readonly subscriptions?: ReadonlyArray<EffectSub<M, Msg, R>>
}

export interface OakProgram<M, Msg, R = never> {
  readonly name: string
  readonly tag: OakTag<M, Msg>
  readonly layer: Layer.Layer<OakService<M, Msg>, never, R>
}

function subscribableStream<A>(
  subscribe: (listener: (value: A) => void) => () => void,
): Stream.Stream<A> {
  return Stream.asyncPush<A>((emit) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        subscribe((value) => {
          emit.single(value)
        }),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    ),
  )
}

/**
 * Builds an Effect-runtime Oak program: a `Layer` providing an `OakService`,
 * plus the matching `Tag` for service lookup.
 *
 * The caller composes this Layer into a `ManagedRuntime` (or any other Effect
 * runtime), runs it, and extracts the service. The `service.kernel` is the
 * runtime-agnostic interchange point: hand it to any view adapter (React,
 * CLI, …) or to any other consumer that needs synchronous dispatch.
 */
export function makeOakEffectProgram<M, Msg, R = never>(
  config: OakProgramConfig<M, Msg, R>,
): OakProgram<M, Msg, R> {
  const tag = makeOakTag<M, Msg>(config.name)

  const service: Effect.Effect<OakService<M, Msg>, never, R | Scope.Scope> = Effect.gen(function* () {
    const context = yield* Effect.context<R>()
    const scope = yield* Effect.scope

    const scheduleCommand = makeScheduleCommand<M, Msg, R>(context, scope)

    const kernel = makeKernel<M, Msg, EffectCommand<M, Msg, R>>({
      name: config.name,
      init: config.init,
      update: config.update,
      scheduleCommand,
    })

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        kernel.dispose()
      }),
    )

    for (const sub of config.subscriptions ?? []) {
      yield* runEffectSub(kernel, sub).pipe(
        Effect.provide(context),
        Effect.catchAllCause((cause) =>
          Cause.isInterruptedOnly(cause)
            ? Effect.void
            : Effect.sync(() => {
                kernel.reportDiagnostic('subscription', cause)
              }),
        ),
        Effect.forkScoped,
      )
    }

    const events: Stream.Stream<OakEvent<M, Msg>> = subscribableStream(kernel.subscribeEvents)
    const diagnostics: Stream.Stream<Diagnostic> = subscribableStream(kernel.subscribeDiagnostics)

    return {
      name: config.name,
      kernel,
      state: kernel.state,
      dispatch: (msg: Msg) =>
        Effect.sync(() => {
          kernel.dispatch(msg)
        }),
      events,
      diagnostics,
    }
  })

  return {
    name: config.name,
    tag,
    layer: Layer.scoped(tag, service),
  }
}
