// ============================================================================
// Core Types
// ============================================================================

import type { Cause, Effect, Stream, SubscriptionRef } from 'effect'

/** A mutation is a pure synchronous function that transforms state */
export type Mutation<M> = (model: M) => M

/** Dispatch sends a message into a running Oak program's inbox */
export type Dispatch<Msg, S> = (msg: Msg) => Effect.Effect<void, never, S>

/** A command receives the triggering message and post-mutation model, then returns the next message */
export type Cmd<M, Msg, S> = (msg: Msg, model: M) => Effect.Effect<Msg, never, S>

/** Update returns a pure mutation plus any commands to run after the mutation is applied */
export type Update<M, Msg, S> = (msg: Msg) => readonly [Mutation<M>, ReadonlyArray<Cmd<M, Msg, S>>]

/** A subscription watches state and produces messages */
export interface Sub<M, Msg, S> {
  /** Return true when the current stream should be torn down and replaced */
  readonly shouldReplace: (prev: M, curr: M) => boolean
  /** Produces a stream of messages. Called when shouldReplace fires. */
  readonly run: (model: M) => Stream.Stream<Msg, never, S>
}

/** An event emitted after Oak applies a message */
export interface OakEvent<M, Msg> {
  readonly message: Msg
  readonly model: M
}

/** The source of a diagnostic emitted by a running Oak program */
export type OakDiagnosticSource = 'command' | 'dispatch' | 'message' | 'subscription'

/** A non-interruption failure or defect observed inside an Oak program */
export interface OakDiagnostic {
  readonly source: OakDiagnosticSource
  readonly cause: Cause.Cause<unknown>
}

/** Advanced runtime surface exposed by a running Oak program's tag */
export interface OakService<M, Msg> {
  readonly state: SubscriptionRef.SubscriptionRef<M>
  readonly events: Stream.Stream<OakEvent<M, Msg>>
  readonly diagnostics: Stream.Stream<OakDiagnostic>
  readonly dispatch: Dispatch<Msg, never>
}
