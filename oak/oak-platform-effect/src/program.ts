import { Cause, Effect, Layer, type Scope, Stream } from 'effect'
import {
  makeKernel,
  type Diagnostic,
  type OakEvent,
  type OakViewDriver,
  type Update,
} from '@oak/core'
import { type EffectCommand, makeScheduleCommand } from './command.js'
import { type EffectSub, runEffectSub } from './subscription.js'
import { makeOakTag, type OakService, type OakTag } from './service.js'

export type AnyEffectSub<M, Msg, R = never> = EffectSub<M, Msg, R, unknown>

export interface OakProgramConfig<M, Msg, R = never, E = unknown> {
  readonly tagKey: string
  readonly init: M
  readonly update: Update<M, Msg, EffectCommand<M, Msg, R, E>>
  readonly subscriptions?: ReadonlyArray<AnyEffectSub<M, Msg, R>>
}

export interface OakEffectProgram<M, Msg, R = never> {
  readonly tag: OakTag<M, Msg>
  readonly layer: Layer.Layer<OakService<M, Msg>, never, R>
  view(service: OakService<M, Msg>): OakViewDriver<M, Msg>
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
 * Builds an Effect-platform Oak program: a `Layer` providing an `OakService`,
 * the matching `Tag` for service lookup, and a view-driver adapter.
 *
 * The caller composes this Layer into a `ManagedRuntime` (or another Effect
 * runtime), extracts the service, and passes `program.view(service)` to a view
 * adapter. The internal kernel is not an Oak authoring or view surface.
 */
export function makeOakEffectProgram<M, Msg, R = never, E = unknown>(
  config: OakProgramConfig<M, Msg, R, E>,
): OakEffectProgram<M, Msg, R> {
  const tag = makeOakTag<M, Msg>(config.tagKey)

  const service: Effect.Effect<OakService<M, Msg>, never, R | Scope.Scope> = Effect.gen(
    function* () {
      const context = yield* Effect.context<R>()
      const scope = yield* Effect.scope

      const scheduleCommand = makeScheduleCommand<M, Msg, R, E>(context, scope)

      const kernel = makeKernel<M, Msg, EffectCommand<M, Msg, R, E>>({
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
      const driver: OakViewDriver<M, Msg> = {
        state: kernel.state,
        dispatch: (msg: Msg) => {
          kernel.dispatch(msg)
        },
      }

      return {
        state: kernel.state,
        dispatch: (msg: Msg) =>
          Effect.sync(() => {
            kernel.dispatch(msg)
          }),
        driver,
        events,
        diagnostics,
      }
    },
  )

  return {
    tag,
    layer: Layer.scoped(tag, service),
    view: (service) => service.driver,
  }
}
