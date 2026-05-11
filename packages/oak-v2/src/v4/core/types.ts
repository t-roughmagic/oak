/** Equality used to deduplicate state writes or selected values. */
export type Equality<A> = (prev: A, curr: A) => boolean

/** A pure state transition. The kernel applies this after `update` returns. */
export type Mutation<M> = (model: M) => M

/**
 * Result of handling one message.
 *
 * `effects` is intentionally generic. The kernel only emits these instructions;
 * a runtime decides whether they are Effect commands, Promises, Observables, or
 * something else.
 */
export interface HandlerResult<M, Cmd> {
  readonly mutation: Mutation<M>
  readonly effects?: ReadonlyArray<Cmd>
}

/** The TEA update function: handle one message against the pre-mutation model. */
export type Update<M, Msg, Cmd = never> = (msg: Msg, model: M) => HandlerResult<M, Cmd>

/** Synchronous read-only state surface. The kernel's public state view. */
export interface OakState<M> {
  readonly value: M
  subscribe(listener: (model: M) => void): () => void
}

/** Published after a message mutation is applied. */
export interface OakEvent<M, Msg> {
  readonly message: Msg
  readonly model: M
}

export type DiagnosticSource =
  | 'update'
  | 'mutation'
  | 'state-listener'
  | 'event-listener'
  | 'diagnostic-listener'
  | 'command'
  | 'subscription'

/** Non-fatal failure captured by the kernel or a runtime. */
export interface Diagnostic {
  readonly source: DiagnosticSource
  readonly error: unknown
}
