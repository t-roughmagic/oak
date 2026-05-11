import { makeKernel, type OakKernel, type Update } from '../core/index.js'
import { type PromiseCommand, makeScheduleCommand } from './command.js'
import { type PromiseSub, startPromiseSub } from './subscription.js'

export interface PromiseProgramConfig<M, Msg> {
  readonly name: string
  readonly init: M
  readonly update: Update<M, Msg, PromiseCommand<M, Msg>>
  readonly subscriptions?: ReadonlyArray<PromiseSub<M, Msg, unknown>>
}

export interface PromiseProgramInstance<M, Msg> {
  readonly kernel: OakKernel<M, Msg>
  dispose(): void
}

export interface PromiseProgram<M, Msg> {
  readonly name: string
  start(): PromiseProgramInstance<M, Msg>
}

/**
 * Builds a Promise-runtime Oak program. The program is a factory — call
 * `start()` to instantiate a running kernel + subscriptions, and `dispose()`
 * on the result to tear everything down.
 *
 * Distinct from the Effect runtime, there is no Layer/Tag/Service. The
 * caller gets a synchronous `kernel` they can hand to any view (React, CLI,
 * test harness) — the same kernel shape the Effect runtime produces.
 */
export function makeOakPromiseProgram<M, Msg>(
  config: PromiseProgramConfig<M, Msg>,
): PromiseProgram<M, Msg> {
  return {
    name: config.name,
    start(): PromiseProgramInstance<M, Msg> {
      const kernel = makeKernel<M, Msg, PromiseCommand<M, Msg>>({
        name: config.name,
        init: config.init,
        update: config.update,
        scheduleCommand: makeScheduleCommand<M, Msg>(),
      })

      const subDisposers: Array<() => void> = []
      for (const sub of config.subscriptions ?? []) {
        subDisposers.push(startPromiseSub(kernel, sub as PromiseSub<M, Msg, unknown>))
      }

      return {
        kernel,
        dispose() {
          for (const disposer of subDisposers) {
            disposer()
          }
          subDisposers.length = 0
          kernel.dispose()
        },
      }
    },
  }
}
