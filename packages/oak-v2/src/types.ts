import type { Cause, Effect, Stream } from 'effect'

/** A mutation is a pure synchronous function that transforms state. */
export type Mutation<M> = (model: M) => M

/** Dispatch sends a message through the synchronous Oak update loop. */
export type Dispatch<Msg> = (msg: Msg) => void

/** A command receives the triggering message and post-mutation model, then returns the next message. */
export type Cmd<M, Msg, S> = (msg: Msg, model: M) => Effect.Effect<Msg, never, S>

/** The result of handling one message. */
export interface MsgHandlerResult<M, Msg, S> {
  readonly mutation: Mutation<M>
  readonly commands?: ReadonlyArray<Cmd<M, Msg, S>>
}

/** Handles one message against the pre-mutation model. */
export type MsgHandler<M, Msg, S> = (msg: Msg, model: M) => MsgHandlerResult<M, Msg, S>

/** A subscription watches a selected state value and produces messages. */
export interface Sub<M, Msg, S, A = unknown> {
  /** Selects the subscription dependency from the model. */
  select(model: M): A
  /** Produces a stream of messages for the selected dependency value. */
  run(value: A): Stream.Stream<Msg, never, S>
  /** Compares adjacent selected values. Defaults to Effect Equal.equals. */
  eq?(prev: A, curr: A): boolean
}

/** Read-only state surface exposed by a running Oak program. */
export interface OakState<M> {
  readonly value: M
  readonly changes: Stream.Stream<M>
  subscribe(listener: (model: M) => void): () => void
}

/** An event emitted after Oak applies a message. */
export interface OakEvent<M, Msg> {
  readonly message: Msg
  readonly model: M
}

/** The source of a diagnostic emitted by a running Oak program. */
export type OakDiagnosticSource = 'command' | 'dispatch' | 'listener' | 'message' | 'subscription'

/** A non-interruption failure or defect observed inside an Oak program. */
export interface OakDiagnostic {
  readonly source: OakDiagnosticSource
  readonly cause: Cause.Cause<unknown>
}

/** Advanced runtime surface exposed by a running Oak program's tag. */
export interface OakService<M, Msg> {
  readonly state: OakState<M>
  readonly events: Stream.Stream<OakEvent<M, Msg>>
  readonly diagnostics: Stream.Stream<OakDiagnostic>
  readonly dispatch: Dispatch<Msg>
}
