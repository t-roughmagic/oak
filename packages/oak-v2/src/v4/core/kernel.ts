import { Cell } from './cell.js'
import type {
  Diagnostic,
  DiagnosticSource,
  Equality,
  OakEvent,
  OakState,
  Update,
} from './types.js'

/**
 * The generic Oak kernel.
 *
 * Plain synchronous TypeScript. No dependency on Effect, RxJS, Promises, or any
 * async machinery. The kernel owns:
 *   - the model `M` and its synchronous mutation via `dispatch`
 *   - listener-set surfaces for events and diagnostics
 *
 * It does NOT run commands. A runtime adapter supplies `scheduleCommand` at
 * construction time and is responsible for executing the command and feeding
 * the resulting message back through `deferredDispatch`.
 */
export interface OakKernel<M, Msg> {
  readonly name: string
  readonly state: OakState<M>
  dispatch(msg: Msg): void
  /** Publish a diagnostic from runtime code (subscription failures, etc.). */
  reportDiagnostic(source: DiagnosticSource, error: unknown): void
  subscribeEvents(listener: (event: OakEvent<M, Msg>) => void): () => void
  subscribeDiagnostics(listener: (diagnostic: Diagnostic) => void): () => void
  dispose(): void
}

/**
 * Host-supplied command scheduler.
 *
 * Called synchronously inside `dispatch`, once per command produced by
 * `update`. The host MUST NOT call `deferredDispatch` synchronously from
 * inside `scheduleCommand` itself — it must be deferred to a microtask,
 * fiber turn, Promise resolution, or other async boundary. The kernel
 * already wraps the supplied `deferredDispatch` with `queueMicrotask`,
 * so simply calling it on success is safe and correct.
 */
export type ScheduleCommand<M, Msg, Cmd> = (
  cmd: Cmd,
  msg: Msg,
  model: M,
  deferredDispatch: (msg: Msg) => void,
  reportDiagnostic: (source: DiagnosticSource, error: unknown) => void,
) => void

export interface KernelConfig<M, Msg, Cmd = never> {
  readonly name: string
  readonly init: M
  readonly update: Update<M, Msg, Cmd>
  readonly eq?: Equality<M>
  readonly scheduleCommand?: ScheduleCommand<M, Msg, Cmd>
}

interface ListenerSet<A> {
  readonly subscribe: (listener: (value: A) => void) => () => void
  readonly emit: (value: A) => void
}

function listenerSet<A>(onListenerError: (error: unknown) => void): ListenerSet<A> {
  const listeners = new Set<(value: A) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(value) {
      for (const listener of Array.from(listeners)) {
        try {
          listener(value)
        } catch (error) {
          onListenerError(error)
        }
      }
    },
  }
}

export function makeKernel<M, Msg, Cmd = never>(
  config: KernelConfig<M, Msg, Cmd>,
): OakKernel<M, Msg> {
  let active = true
  let isDispatching = false

  const diagnostics = listenerSet<Diagnostic>((error) => {
    console.error('Oak diagnostic listener failed', error)
  })

  const reportDiagnostic = (source: DiagnosticSource, error: unknown): void => {
    diagnostics.emit({ source, error })
  }

  const cellOptions =
    config.eq === undefined
      ? { onListenerError: (error: unknown) => reportDiagnostic('state-listener', error) }
      : {
          eq: config.eq,
          onListenerError: (error: unknown) => reportDiagnostic('state-listener', error),
        }
  const cell = new Cell(config.init, cellOptions)

  const events = listenerSet<OakEvent<M, Msg>>((error) =>
    reportDiagnostic('event-listener', error),
  )

  const dispatch = (message: Msg): void => {
    if (!active) {
      return
    }

    if (isDispatching) {
      queueMicrotask(() => {
        dispatch(message)
      })
      return
    }

    isDispatching = true
    try {
      const currentModel = cell.value
      let result
      try {
        result = config.update(message, currentModel)
      } catch (error) {
        reportDiagnostic('update', error)
        return
      }

      let nextModel: M
      try {
        nextModel = result.mutation(currentModel)
        cell.set(nextModel)
      } catch (error) {
        reportDiagnostic('mutation', error)
        return
      }

      events.emit({ message, model: nextModel })

      if (result.effects && result.effects.length > 0) {
        const scheduler = config.scheduleCommand
        if (scheduler !== undefined) {
          for (const effect of result.effects) {
            try {
              scheduler(effect, message, nextModel, deferredDispatch, reportDiagnostic)
            } catch (error) {
              reportDiagnostic('command', error)
            }
          }
        }
      }
    } finally {
      isDispatching = false
    }
  }

  const deferredDispatch = (message: Msg): void => {
    queueMicrotask(() => {
      dispatch(message)
    })
  }

  const state: OakState<M> = {
    get value() {
      return cell.value
    },
    subscribe: (listener) => cell.subscribe(listener),
  }

  return {
    name: config.name,
    state,
    dispatch,
    reportDiagnostic,
    subscribeEvents: events.subscribe,
    subscribeDiagnostics: diagnostics.subscribe,
    dispose: () => {
      active = false
    },
  }
}
