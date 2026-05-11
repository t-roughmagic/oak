/** Equality used to deduplicate state writes or selected values. */
export type Equality<A> = (prev: A, curr: A) => boolean

/** A state transition. The internal kernel applies this after `update` returns. */
export type Mutation<M> = (model: M) => M

/**
 * Result of handling one message.
 *
 * `effects` is intentionally generic. Every Oak platform defines its own
 * effect instruction shape: Effect commands, Promises, Observables, etc.
 */
export interface HandlerResult<M, Fx> {
  readonly mutation: Mutation<M>
  readonly effects: ReadonlyArray<Fx>
}

/** The TEA update function: handle one message against the pre-mutation model. */
export type Update<M, Msg, Fx> = (msg: Msg, model: M) => HandlerResult<M, Fx>

/** Synchronous read-only state surface exposed by a running Oak program. */
export interface OakState<M> {
  readonly value: M
  subscribe(listener: (model: M) => void): () => void
}

/**
 * Platform-neutral view surface for a running Oak program.
 *
 * Platforms create this from their private program machinery. View adapters use
 * it for synchronous selection and dispatch without knowing how effects run.
 */
export interface OakViewDriver<M, Msg> {
  readonly name: string
  readonly state: OakState<M>
  dispatch(msg: Msg): void
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

/** Non-fatal failure captured by the internal kernel or a platform. */
export interface Diagnostic {
  readonly source: DiagnosticSource
  readonly error: unknown
}
