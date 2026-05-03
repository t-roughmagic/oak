import {
  Cause,
  Context,
  Effect,
  Layer,
  Option,
  PubSub,
  Queue,
  Stream,
  SubscriptionRef,
  type Scope,
} from 'effect'
import type {
  Cmd,
  Dispatch,
  OakDiagnostic,
  OakDiagnosticSource,
  OakEvent,
  OakService,
  Sub,
  Update,
} from './types.js'

// ============================================================================
// Subscription Runner
// ============================================================================

function runSub<M, Msg, S>(
  sub: Sub<M, Msg, S>,
  store: SubscriptionRef.SubscriptionRef<M>,
  dispatch: (message: Msg) => Effect.Effect<void>,
): Effect.Effect<void, never, S> {
  return store.changes.pipe(
    Stream.zipWithPrevious,
    Stream.filter(([prev, curr]) =>
      Option.match(prev, {
        onSome: (previous) => sub.shouldReplace(previous, curr),
        onNone: () => true,
      }),
    ),
    Stream.map(([, curr]) => curr),
    Stream.flatMap((model) => sub.run(model), { switch: true }),
    Stream.runForEach(dispatch),
  )
}

function logProgramCause(
  cause: Cause.Cause<unknown>,
  def: { readonly name: string },
  source: OakDiagnosticSource,
): Effect.Effect<void> {
  if (Cause.isInterruptedOnly(cause)) {
    return Effect.void
  }

  return Effect.logError(cause).pipe(
    Effect.annotateLogs('oak.program', def.name),
    Effect.annotateLogs('oak.source', source),
  )
}

function reportProgramCause(
  diagnostics: PubSub.PubSub<OakDiagnostic>,
  cause: Cause.Cause<unknown>,
  def: { readonly name: string },
  source: OakDiagnosticSource,
): Effect.Effect<void> {
  if (Cause.isInterruptedOnly(cause)) {
    return Effect.void
  }

  return PubSub.publish(diagnostics, { source, cause }).pipe(
    Effect.asVoid,
    Effect.zipRight(logProgramCause(cause, def, source)),
  )
}

// ============================================================================
// Oak Runtime
// ============================================================================

interface OakDefinition<M, Msg, S> {
  readonly name: string
  readonly init: M
  readonly update: Update<M, Msg, S>
  readonly subscriptions: ReadonlyArray<Sub<M, Msg, S>>
}

interface OakRuntime<M, Msg, S> {
  readonly layer: Layer.Layer<OakService<M, Msg>, never, S>
}

interface OakRuntimeResources<M, Msg, S> {
  readonly def: OakDefinition<M, Msg, S>
  readonly store: SubscriptionRef.SubscriptionRef<M>
  readonly inbox: Queue.Queue<Msg>
  readonly events: PubSub.PubSub<OakEvent<M, Msg>>
  readonly diagnostics: PubSub.PubSub<OakDiagnostic>
  readonly context: Context.Context<S>
  readonly scope: Scope.Scope
}

function recoverWithDiagnostic<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  source: OakDiagnosticSource,
) {
  return (cause: Cause.Cause<unknown>) =>
    Cause.isInterruptedOnly(cause)
      ? Effect.failCause(cause)
      : reportProgramCause(resources.diagnostics, cause, resources.def, source)
}

function makeRuntimeResources<M, Msg, S>(def: OakDefinition<M, Msg, S>) {
  return Effect.gen(function* () {
    const store = yield* SubscriptionRef.make<M>(def.init)
    const inbox = yield* Queue.unbounded<Msg>()
    const events = yield* PubSub.unbounded<OakEvent<M, Msg>>()
    const diagnostics = yield* PubSub.unbounded<OakDiagnostic>()
    const context = yield* Effect.context<S>()
    const scope = yield* Effect.scope

    return { def, store, inbox, events, diagnostics, context, scope }
  })
}

function makeDispatch<M, Msg, S>(resources: OakRuntimeResources<M, Msg, S>): Dispatch<Msg, never> {
  return (message) =>
    Queue.offer(resources.inbox, message).pipe(
      Effect.asVoid,
      Effect.catchAllCause((cause) =>
        reportProgramCause(resources.diagnostics, cause, resources.def, 'dispatch'),
      ),
    )
}

function forkCommand<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  dispatch: Dispatch<Msg, never>,
  message: Msg,
  model: M,
  cmd: Cmd<M, Msg, S>,
): Effect.Effect<void> {
  return Effect.suspend(() => cmd(message, model)).pipe(
    Effect.flatMap(dispatch),
    Effect.provide(resources.context),
    Effect.catchAllCause((cause) =>
      reportProgramCause(resources.diagnostics, cause, resources.def, 'command'),
    ),
    Effect.forkIn(resources.scope),
    Effect.asVoid,
  )
}

function processMessage<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  dispatch: Dispatch<Msg, never>,
  message: Msg,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const { def, events, store } = resources
    const [newModel, commands] = yield* SubscriptionRef.modify(store, (prev) => {
      const [mutation, commands] = def.update(message)
      const updated = mutation(prev)
      return [[updated, commands] as const, updated]
    })

    yield* PubSub.publish(events, { message, model: newModel }).pipe(Effect.asVoid)

    for (const cmd of commands) {
      yield* forkCommand(resources, dispatch, message, newModel, cmd)
    }
  })
}

function runMessageConsumer<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  dispatch: Dispatch<Msg, never>,
): Effect.Effect<void, never, Scope.Scope> {
  return Stream.fromQueue(resources.inbox).pipe(
    Stream.runForEach((message) =>
      processMessage(resources, dispatch, message).pipe(
        Effect.catchAllCause(recoverWithDiagnostic(resources, 'message')),
      ),
    ),
    Effect.forkScoped,
    Effect.asVoid,
  )
}

function runSubscriptions<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  dispatch: Dispatch<Msg, never>,
): Effect.Effect<void, never, S | Scope.Scope> {
  return Effect.gen(function* () {
    for (const sub of resources.def.subscriptions) {
      yield* runSub(sub, resources.store, dispatch).pipe(
        Effect.provide(resources.context),
        Effect.catchAllCause(recoverWithDiagnostic(resources, 'subscription')),
        Effect.forkScoped,
      )
    }
  })
}

function makeOakService<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
): Effect.Effect<OakService<M, Msg>, never, S | Scope.Scope> {
  return Effect.gen(function* () {
    const dispatch = makeDispatch(resources)

    yield* runMessageConsumer(resources, dispatch)
    yield* runSubscriptions(resources, dispatch)

    return {
      state: resources.store,
      events: Stream.fromPubSub(resources.events),
      diagnostics: Stream.fromPubSub(resources.diagnostics),
      dispatch,
    }
  })
}

function oakRuntime<M, Msg, S>(
  tag: OakTag<M, Msg>,
  def: OakDefinition<M, Msg, S>,
): OakRuntime<M, Msg, S> {
  const service = Effect.gen(function* () {
    const resources = yield* makeRuntimeResources(def)
    return yield* makeOakService(resources)
  })

  return {
    layer: Layer.scoped(tag, service),
  }
}

// ============================================================================
// Make Oak — public program factory
// ============================================================================

export type OakTag<M, Msg> = Context.Tag<OakService<M, Msg>, OakService<M, Msg>>

type OakProgramLike = {
  readonly layer: Layer.Layer<never, never, unknown>
}

type LayerSuccess<T> = T extends Layer.Layer<infer ROut, unknown, unknown> ? ROut : never

type LayerContext<T> = T extends Layer.Layer<unknown, unknown, infer RIn> ? RIn : never

export interface OakProgram<M, Msg, S = never> {
  /** Stable program identifier and exact Effect tag key. */
  readonly name: string
  /** Typed runtime address for locating this running program in an Effect environment. */
  readonly tag: OakTag<M, Msg>
  /** Scoped Effect layer that starts and owns this program's runtime resources. */
  readonly layer: Layer.Layer<OakService<M, Msg>, never, S>
}

/**
 * Creates an Oak program definition.
 *
 * The returned program is not running yet. Provide its layer to an Effect
 * runtime to start the program's inbox, state ref, event streams, subscriptions,
 * command fibers, and diagnostics stream.
 */
export function makeOak<M, Msg, S = never>(config: {
  name: string
  init: M
  update: Update<M, Msg, S>
  subscriptions?: ReadonlyArray<Sub<M, Msg, S>>
}): OakProgram<M, Msg, S> {
  const tag = Context.GenericTag<OakService<M, Msg>>(config.name)
  const runtime = oakRuntime(tag, {
    name: config.name,
    init: config.init,
    update: config.update,
    subscriptions: config.subscriptions ?? [],
  })

  return {
    name: config.name,
    tag,
    layer: runtime.layer,
  }
}

/**
 * Composes one or more Oak program layers into a single Effect layer.
 *
 * This is a small Oak-shaped wrapper around `Layer.mergeAll`. It keeps the
 * Effect layer explicit while avoiding repeated `.layer` plumbing at app
 * boundaries.
 */
export function makeOakLayer<
  const Programs extends readonly [OakProgramLike, ...Array<OakProgramLike>],
>(
  ...programs: Programs
): Layer.Layer<
  LayerSuccess<Programs[number]['layer']>,
  never,
  LayerContext<Programs[number]['layer']>
> {
  const layers = programs.map((program) => program.layer) as [
    Layer.Layer<never, never, unknown>,
    ...Array<Layer.Layer<never, never, unknown>>,
  ]

  return Layer.mergeAll(...layers) as Layer.Layer<
    LayerSuccess<Programs[number]['layer']>,
    never,
    LayerContext<Programs[number]['layer']>
  >
}
