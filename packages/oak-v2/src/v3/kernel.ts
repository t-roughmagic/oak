/** Equality used to deduplicate state writes or selected values. */
export type Equality<A> = (prev: A, curr: A) => boolean

/** A pure state transition. The kernel applies this after the handler returns. */
export type Mutation<M> = (model: M) => M

/**
 * Result of handling a message.
 *
 * `effects` is intentionally generic. The kernel only emits these instructions;
 * a harness decides whether they are Effect commands, Promises, RxJS work, or
 * something else.
 */
export interface HandlerResult<M, Fx> {
  readonly mutation: Mutation<M>
  readonly effects?: ReadonlyArray<Fx>
}

/** Handles one message against the pre-mutation model. */
export type MsgHandler<M, Msg, Fx = never> = (msg: Msg, model: M) => HandlerResult<M, Fx>

/** Synchronous message dispatch. */
export type Dispatch<Msg> = (msg: Msg) => void

/** Synchronous state surface consumed directly by React and other view layers. */
export interface OakState<M> {
  readonly value: M
  subscribe(listener: (model: M) => void): () => void
}

/** Published after a message mutation is applied. */
export interface OakEvent<M, Msg> {
  readonly message: Msg
  readonly model: M
}

/** A generic effect instruction emitted by a successful dispatch. */
export interface ProducedEffect<M, Msg, Fx> {
  readonly message: Msg
  readonly model: M
  readonly effect: Fx
}

export type OakDiagnosticSource =
  | 'handler'
  | 'mutation'
  | 'state-listener'
  | 'event-listener'
  | 'effect-listener'
  | 'diagnostic-listener'
  | 'effect'
  | 'subscription'

/** Kernel diagnostics are plain callback events, not Effect causes. Harnesses may wrap richer errors. */
export interface OakDiagnostic {
  readonly source: OakDiagnosticSource
  readonly error: unknown
}

/** Minimal callback subscription shape used throughout the kernel. */
export interface Subscribable<A> {
  subscribe(listener: (value: A) => void): () => void
}

export interface EmitterOptions {
  readonly onListenerError?: (error: unknown) => void
}

/** Small synchronous emitter. Harnesses can adapt this to Streams, Observables, or EventTargets. */
export class Emitter<A> implements Subscribable<A> {
  private readonly listeners = new Set<(value: A) => void>()
  private readonly onListenerError: ((error: unknown) => void) | undefined

  constructor(options: EmitterOptions = {}) {
    this.onListenerError = options.onListenerError
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  subscribe(listener: (value: A) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(value: A): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(value)
      } catch (error) {
        this.onListenerError?.(error)
      }
    }
  }
}

export interface CellOptions<M> {
  readonly eq?: Equality<M>
  readonly onListenerError?: (error: unknown) => void
}

/** Synchronous mutable cell with deduplicated writes and callback subscribers. */
export class Cell<M> implements OakState<M> {
  private current: M
  private readonly eq: Equality<M>
  private readonly listeners = new Set<(model: M) => void>()
  private readonly onListenerError: ((error: unknown) => void) | undefined

  constructor(initial: M, options: CellOptions<M> = {}) {
    this.current = initial
    this.eq = options.eq ?? Object.is
    this.onListenerError = options.onListenerError
  }

  get value(): M {
    return this.current
  }

  set(next: M): void {
    if (this.eq(this.current, next)) {
      return
    }

    this.current = next

    for (const listener of Array.from(this.listeners)) {
      try {
        listener(next)
      } catch (error) {
        this.onListenerError?.(error)
      }
    }
  }

  subscribe(listener: (model: M) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

/**
 * The generic Oak kernel.
 *
 * This object has no dependency on Effect. It owns only state, synchronous
 * dispatch, and callback emitters for events, effect instructions, and
 * diagnostics.
 */
export interface OakKernel<M, Msg, Fx = never> {
  readonly name: string
  readonly state: OakState<M>
  readonly events: Subscribable<OakEvent<M, Msg>>
  readonly effects: Subscribable<ProducedEffect<M, Msg, Fx>>
  readonly diagnostics: Subscribable<OakDiagnostic>
  readonly dispatch: Dispatch<Msg>
  reportDiagnostic(source: OakDiagnosticSource, error: unknown): void
  dispose(): void
}

/** Configuration for the generic kernel. */
export interface OakKernelConfig<M, Msg, Fx = never> {
  readonly name: string
  readonly init: M
  readonly handle: MsgHandler<M, Msg, Fx>
  readonly eq?: Equality<M>
}

/**
 * Creates an Oak kernel.
 *
 * The returned kernel is immediately usable: dispatch synchronously updates
 * state, emits an event, and emits any generic effect instructions. Running
 * those effect instructions is intentionally left to a harness.
 */
export function makeOakKernel<M, Msg, Fx = never>(
  config: OakKernelConfig<M, Msg, Fx>,
): OakKernel<M, Msg, Fx> {
  let active = true
  let isDispatching = false

  const diagnostics = new Emitter<OakDiagnostic>({
    onListenerError: (error) => {
      console.error('Oak diagnostic listener failed', error)
    },
  })
  const reportDiagnostic = (source: OakDiagnosticSource, error: unknown): void => {
    diagnostics.emit({ source, error })
  }
  const state =
    config.eq === undefined
      ? new Cell(config.init, {
          onListenerError: (error) => reportDiagnostic('state-listener', error),
        })
      : new Cell(config.init, {
          eq: config.eq,
          onListenerError: (error) => reportDiagnostic('state-listener', error),
        })
  const events = new Emitter<OakEvent<M, Msg>>({
    onListenerError: (error) => reportDiagnostic('event-listener', error),
  })
  const effects = new Emitter<ProducedEffect<M, Msg, Fx>>({
    onListenerError: (error) => reportDiagnostic('effect-listener', error),
  })

  const dispatch: Dispatch<Msg> = (message) => {
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
      const currentModel = state.value
      let result: HandlerResult<M, Fx>
      try {
        result = config.handle(message, currentModel)
      } catch (error) {
        reportDiagnostic('handler', error)
        return
      }

      let model: M
      try {
        model = result.mutation(currentModel)
        state.set(model)
      } catch (error) {
        reportDiagnostic('mutation', error)
        return
      }

      events.emit({ message, model })

      for (const effect of result.effects ?? []) {
        effects.emit({ message, model, effect })
      }
    } finally {
      isDispatching = false
    }
  }

  return {
    name: config.name,
    state,
    events,
    effects,
    diagnostics,
    dispatch,
    reportDiagnostic,
    dispose: () => {
      active = false
    },
  }
}
