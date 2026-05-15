import {
  makeKernel,
  type Diagnostic,
  type OakEvent,
  type OakState,
  type OakViewDriver,
  type Update,
} from '../core/index.js'
import { type PromiseCommand, makeScheduleCommand } from './command.js'
import { type PromiseSub, startPromiseSub } from './subscription.js'

export type AnyPromiseSub<M, Msg> = PromiseSub<M, Msg, unknown>

export interface PromiseProgramConfig<M, Msg> {
  readonly init: M
  readonly update: Update<M, Msg, PromiseCommand<M, Msg>>
  readonly subscriptions?: ReadonlyArray<AnyPromiseSub<M, Msg>>
}

export interface PromiseProgramInstance<M, Msg> {
  readonly state: OakState<M>
  readonly driver: OakViewDriver<M, Msg>
  dispatch(msg: Msg): void
  subscribeEvents(listener: (event: OakEvent<M, Msg>) => void): () => void
  subscribeDiagnostics(listener: (diagnostic: Diagnostic) => void): () => void
  dispose(): void
}

export interface PromiseProgram<M, Msg> {
  start(): PromiseProgramInstance<M, Msg>
  view(instance: PromiseProgramInstance<M, Msg>): OakViewDriver<M, Msg>
}

/**
 * Builds a Promise-platform Oak program. The program is a factory — call
 * `start()` to instantiate the running program and subscriptions, then
 * `dispose()` on the result to tear everything down.
 *
 * Distinct from the Effect platform, there is no Layer/Tag/Service. Views
 * receive a driver through `program.view(instance)`.
 */
export function makeOakPromiseProgram<M, Msg>(
  config: PromiseProgramConfig<M, Msg>,
): PromiseProgram<M, Msg> {
  return {
    start(): PromiseProgramInstance<M, Msg> {
      const kernel = makeKernel<M, Msg, PromiseCommand<M, Msg>>({
        init: config.init,
        update: config.update,
        scheduleCommand: makeScheduleCommand<M, Msg>(),
      })

      const subDisposers: Array<() => void> = []
      for (const sub of config.subscriptions ?? []) {
        subDisposers.push(startPromiseSub(kernel, sub))
      }

      const driver: OakViewDriver<M, Msg> = {
        state: kernel.state,
        dispatch: (msg: Msg) => {
          kernel.dispatch(msg)
        },
      }

      return {
        state: kernel.state,
        driver,
        dispatch: (msg: Msg) => {
          kernel.dispatch(msg)
        },
        subscribeEvents: kernel.subscribeEvents,
        subscribeDiagnostics: kernel.subscribeDiagnostics,
        dispose() {
          for (const disposer of subDisposers) {
            disposer()
          }
          subDisposers.length = 0
          kernel.dispose()
        },
      }
    },
    view(instance) {
      return instance.driver
    },
  }
}
