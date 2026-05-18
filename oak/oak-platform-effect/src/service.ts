import { Context, type Effect, type Stream } from 'effect'
import type { Diagnostic, OakEvent, OakState, OakViewDriver } from '@oak/oak-core'

/**
 * Effect-flavored surface exposed by an Oak program Layer.
 *
 * The Effect platform owns the private dispatch machinery. Effect-side code
 * uses `dispatch`, `events`, and `diagnostics`; view code receives `driver`.
 */
export interface OakService<M, Msg> {
  readonly state: OakState<M>
  readonly dispatch: (msg: Msg) => Effect.Effect<void>
  readonly driver: OakViewDriver<M, Msg>
  readonly events: Stream.Stream<OakEvent<M, Msg>>
  readonly diagnostics: Stream.Stream<Diagnostic>
}

export type OakTag<M, Msg> = Context.Tag<OakService<M, Msg>, OakService<M, Msg>>

/** Creates a uniquely-identified `OakService` tag, keyed by an Effect service key. */
export function makeOakTag<M, Msg>(tagKey: string): OakTag<M, Msg> {
  return Context.GenericTag<OakService<M, Msg>>(tagKey)
}
