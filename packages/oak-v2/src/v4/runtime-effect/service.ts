import { Context, type Effect, type Stream } from 'effect'
import type { Diagnostic, OakEvent, OakKernel, OakState } from '../core/index.js'

/**
 * Effect-flavored surface exposed by an Oak program Layer.
 *
 * Carries the runtime-agnostic `kernel` plus runtime-shaped streams for
 * events and diagnostics. Consumers reach into `kernel` to wire any view
 * (React, CLI, …); Effect-side code uses `dispatch`, `events`, and
 * `diagnostics` directly.
 */
export interface OakService<M, Msg> {
  readonly name: string
  readonly kernel: OakKernel<M, Msg>
  readonly state: OakState<M>
  readonly dispatch: (msg: Msg) => Effect.Effect<void>
  readonly events: Stream.Stream<OakEvent<M, Msg>>
  readonly diagnostics: Stream.Stream<Diagnostic>
}

export type OakTag<M, Msg> = Context.Tag<OakService<M, Msg>, OakService<M, Msg>>

/** Creates a uniquely-identified `OakService` tag, keyed by program name. */
export function makeOakTag<M, Msg>(name: string): OakTag<M, Msg> {
  return Context.GenericTag<OakService<M, Msg>>(name)
}
