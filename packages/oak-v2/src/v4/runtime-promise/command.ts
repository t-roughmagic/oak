import type { ScheduleCommand } from '../core/index.js'

/**
 * Promise-shaped command for the generic kernel.
 *
 * A command is a function that, given the message that produced it and the
 * model after mutation, returns a Promise of the next message to dispatch.
 * Rejections are caught and reported through the kernel's diagnostics.
 */
export type PromiseCommand<M, Msg> = (msg: Msg, model: M) => Promise<Msg>

/**
 * Kernel-shaped `scheduleCommand` for Promise commands.
 *
 * Runs the command and forwards the resulting message through
 * `deferredDispatch`. Rejections are reported as `'command'` diagnostics.
 */
export function makeScheduleCommand<M, Msg>(): ScheduleCommand<M, Msg, PromiseCommand<M, Msg>> {
  return (cmd, msg, model, deferredDispatch, reportDiagnostic) => {
    cmd(msg, model).then(
      (resultMsg) => {
        deferredDispatch(resultMsg)
      },
      (error: unknown) => {
        reportDiagnostic('command', error)
      },
    )
  }
}
