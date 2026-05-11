import { Cause, Context, Effect, type Scope } from 'effect'
import type { DiagnosticSource, ScheduleCommand } from '../core/index.js'

/**
 * Effect-shaped command for the generic kernel.
 *
 * `R = never` means the command requires no Effect environment by default.
 * Commands that need services specify `R` and the program must be provided
 * the matching `Context`.
 */
export type EffectCommand<M, Msg, R = never> = (msg: Msg, model: M) => Effect.Effect<Msg, never, R>

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
 * Builds a kernel-shaped `scheduleCommand` callback that runs `EffectCommand`s
 * in a captured `Context`, forks each into the given scope, and feeds the
 * resulting message back through the kernel's `deferredDispatch`.
 */
export function makeScheduleCommand<M, Msg, R>(
  context: Context.Context<R>,
  scope: Scope.Scope,
): ScheduleCommand<M, Msg, EffectCommand<M, Msg, R>> {
  return (cmd, msg, model, deferredDispatch, reportDiagnostic) => {
    Effect.runFork(
      Effect.suspend(() => cmd(msg, model)).pipe(
        Effect.flatMap((resultMsg) => Effect.sync(() => deferredDispatch(resultMsg))),
        Effect.provide(context),
        Effect.catchAllCause((cause) =>
          Effect.sync(() => reportCause(reportDiagnostic, cause)),
        ),
        Effect.forkIn(scope),
        Effect.asVoid,
        Effect.catchAllCause((cause) =>
          Effect.sync(() => reportCause(reportDiagnostic, cause)),
        ),
      ),
    )
  }
}
