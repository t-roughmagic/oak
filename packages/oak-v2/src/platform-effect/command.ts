import { Cause, Context, Effect, type Scope } from 'effect'
import type { DiagnosticSource, ScheduleCommand } from '../core/index.js'

/**
 * Effect-shaped instruction for the Effect platform.
 *
 * `R = never` means the effect requires no Effect environment by default.
 * `E = unknown` allows typed Effect failures; the platform reports failures
 * through Oak diagnostics.
 */
export type EffectCommand<M, Msg, R = never, E = unknown> = (
  msg: Msg,
  model: M,
) => Effect.Effect<Msg, E, R>

function reportCause(
  reportDiagnostic: (source: DiagnosticSource, error: unknown) => void,
  cause: Cause.Cause<unknown>,
): void {
  if (Cause.isInterruptedOnly(cause)) {
    return
  }
  reportDiagnostic('command', cause)
}

/**
 * Builds the internal `scheduleCommand` callback that runs `EffectCommand`s
 * in a captured `Context`, forks each into the given scope, and feeds the
 * resulting message back through the platform's deferred dispatch path.
 */
export function makeScheduleCommand<M, Msg, R, E>(
  context: Context.Context<R>,
  scope: Scope.Scope,
): ScheduleCommand<M, Msg, EffectCommand<M, Msg, R, E>> {
  return (cmd, msg, model, deferredDispatch, reportDiagnostic) => {
    Effect.runFork(
      Effect.suspend(() => cmd(msg, model)).pipe(
        Effect.flatMap((resultMsg) => Effect.sync(() => deferredDispatch(resultMsg))),
        Effect.provide(context),
        Effect.catchAllCause((cause) => Effect.sync(() => reportCause(reportDiagnostic, cause))),
        Effect.forkIn(scope),
        Effect.asVoid,
        Effect.catchAllCause((cause) => Effect.sync(() => reportCause(reportDiagnostic, cause))),
      ),
    )
  }
}
