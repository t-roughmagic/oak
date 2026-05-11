import { Cause, Context, Effect, Equal, Layer, Option, PubSub, Stream, type Scope } from 'effect'
import { Cell } from './cell.js'
import type {
  Cmd,
  Dispatch,
  OakDiagnostic,
  OakDiagnosticSource,
  OakEvent,
  OakService,
  MsgHandler,
  Sub,
} from './types.js'

interface OakDefinition<M, Msg, S> {
  readonly name: string
  readonly init: M
  readonly handle: MsgHandler<M, Msg, S>
  readonly subscriptions: ReadonlyArray<Sub<M, Msg, S>>
}

interface OakRuntime<M, Msg, S> {
  readonly layer: Layer.Layer<OakService<M, Msg>, never, S>
}

interface OakRuntimeResources<M, Msg, S> {
  readonly def: OakDefinition<M, Msg, S>
  readonly cell: Cell<M>
  readonly events: PubSub.PubSub<OakEvent<M, Msg>>
  readonly diagnostics: PubSub.PubSub<OakDiagnostic>
  readonly context: Context.Context<S>
  readonly scope: Scope.Scope
  readonly active: { current: boolean }
}

interface OakDispatchers<Msg> {
  readonly dispatch: Dispatch<Msg>
  readonly dispatchDeferred: (message: Msg) => Effect.Effect<void>
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

function reportProgramCause<M, Msg, S>(
  resources: Pick<OakRuntimeResources<M, Msg, S>, 'def' | 'diagnostics'>,
  source: OakDiagnosticSource,
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> {
  if (Cause.isInterruptedOnly(cause)) {
    return Effect.void
  }

  return PubSub.publish(resources.diagnostics, { source, cause }).pipe(
    Effect.asVoid,
    Effect.zipRight(logProgramCause(cause, resources.def, source)),
  )
}

function reportProgramCauseSync<M, Msg, S>(
  resources: Pick<OakRuntimeResources<M, Msg, S>, 'def' | 'diagnostics'>,
  source: OakDiagnosticSource,
  cause: Cause.Cause<unknown>,
): void {
  if (!Cause.isInterruptedOnly(cause)) {
    Effect.runFork(reportProgramCause(resources, source, cause))
  }
}

function reportDefectSync<M, Msg, S>(
  resources: Pick<OakRuntimeResources<M, Msg, S>, 'def' | 'diagnostics'>,
  source: OakDiagnosticSource,
  error: unknown,
): void {
  reportProgramCauseSync(resources, source, Cause.die(error))
}

function recoverWithDiagnostic<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  source: OakDiagnosticSource,
) {
  return (cause: Cause.Cause<unknown>) => reportProgramCause(resources, source, cause)
}

function makeRuntimeResources<M, Msg, S>(def: OakDefinition<M, Msg, S>) {
  return Effect.gen(function* () {
    const events = yield* PubSub.unbounded<OakEvent<M, Msg>>()
    const diagnostics = yield* PubSub.unbounded<OakDiagnostic>()
    const active = { current: true }
    const cell = new Cell(def.init, {
      onListenerError: (error) => {
        reportDefectSync({ def, diagnostics }, 'listener', error)
      },
    })
    const context = yield* Effect.context<S>()
    const scope = yield* Effect.scope

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        active.current = false
      }),
    )

    return { def, cell, events, diagnostics, context, scope, active }
  })
}

function publishEvent<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  message: Msg,
  model: M,
): void {
  Effect.runFork(
    PubSub.publish(resources.events, { message, model }).pipe(
      Effect.asVoid,
      Effect.catchAllCause(recoverWithDiagnostic(resources, 'dispatch')),
    ),
  )
}

function scheduleCommand<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  dispatchDeferred: (message: Msg) => Effect.Effect<void>,
  message: Msg,
  model: M,
  cmd: Cmd<M, Msg, S>,
): void {
  if (!resources.active.current) {
    return
  }

  Effect.runFork(
    Effect.suspend(() => cmd(message, model)).pipe(
      Effect.flatMap(dispatchDeferred),
      Effect.provide(resources.context),
      Effect.catchAllCause(recoverWithDiagnostic(resources, 'command')),
      Effect.forkIn(resources.scope),
      Effect.asVoid,
      Effect.catchAllCause(recoverWithDiagnostic(resources, 'command')),
    ),
  )
}

function processMessage<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  dispatchDeferred: (message: Msg) => Effect.Effect<void>,
  message: Msg,
): void {
  const { def, cell } = resources
  let model: M
  let commands: ReadonlyArray<Cmd<M, Msg, S>>

  try {
    const currentModel = cell.value
    const result = def.handle(message, currentModel)
    model = result.mutation(currentModel)
    commands = result.commands ?? []
    cell.set(model)
  } catch (error) {
    reportDefectSync(resources, 'message', error)
    return
  }

  publishEvent(resources, message, model)

  for (const cmd of commands) {
    try {
      scheduleCommand(resources, dispatchDeferred, message, model, cmd)
    } catch (error) {
      reportDefectSync(resources, 'command', error)
    }
  }
}

function makeDispatch<M, Msg, S>(resources: OakRuntimeResources<M, Msg, S>): OakDispatchers<Msg> {
  let isDispatching = false

  const dispatch: Dispatch<Msg> = (message) => {
    if (!resources.active.current) {
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
      processMessage(resources, dispatchDeferred, message)
    } finally {
      isDispatching = false
    }
  }

  const dispatchDeferred = (message: Msg): Effect.Effect<void> =>
    Effect.sync(() => {
      queueMicrotask(() => {
        dispatch(message)
      })
    })

  return { dispatch, dispatchDeferred }
}

function runSub<M, Msg, S, A>(
  resources: OakRuntimeResources<M, Msg, S>,
  sub: Sub<M, Msg, S, A>,
  dispatchDeferred: (message: Msg) => Effect.Effect<void>,
): Effect.Effect<void, never, S> {
  const eq = sub.eq ?? Equal.equals

  return resources.cell.changes.pipe(
    Stream.map((model) => sub.select(model)),
    Stream.zipWithPrevious,
    Stream.filter(([prev, curr]) =>
      Option.match(prev, {
        onSome: (previous) => !eq(previous, curr),
        onNone: () => true,
      }),
    ),
    Stream.map(([, curr]) => curr),
    Stream.flatMap((value) => sub.run(value), { switch: true }),
    Stream.runForEach(dispatchDeferred),
  )
}

function runSubscriptions<M, Msg, S>(
  resources: OakRuntimeResources<M, Msg, S>,
  dispatchDeferred: (message: Msg) => Effect.Effect<void>,
): Effect.Effect<void, never, S | Scope.Scope> {
  return Effect.gen(function* () {
    for (const sub of resources.def.subscriptions) {
      yield* runSub(resources, sub, dispatchDeferred).pipe(
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
    const dispatchers = makeDispatch(resources)

    yield* runSubscriptions(resources, dispatchers.dispatchDeferred)

    return {
      state: resources.cell,
      events: Stream.fromPubSub(resources.events),
      diagnostics: Stream.fromPubSub(resources.diagnostics),
      dispatch: dispatchers.dispatch,
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

export type OakTag<M, Msg> = Context.Tag<OakService<M, Msg>, OakService<M, Msg>>

type OakProgramLike = {
  readonly layer: Layer.Layer<never, never, unknown>
}

type LayerSuccess<T> = T extends Layer.Layer<infer ROut, unknown, unknown> ? ROut : never

type LayerContext<T> = T extends Layer.Layer<unknown, unknown, infer RIn> ? RIn : never

export interface OakProgram<M, Msg, S = never> {
  readonly name: string
  readonly tag: OakTag<M, Msg>
  readonly layer: Layer.Layer<OakService<M, Msg>, never, S>
}

export function makeOak<M, Msg, S = never>(config: {
  name: string
  init: M
  handle: MsgHandler<M, Msg, S>
  subscriptions?: ReadonlyArray<Sub<M, Msg, S>>
}): OakProgram<M, Msg, S> {
  const tag = Context.GenericTag<OakService<M, Msg>>(config.name)
  const runtime = oakRuntime(tag, {
    name: config.name,
    init: config.init,
    handle: config.handle,
    subscriptions: config.subscriptions ?? [],
  })

  return {
    name: config.name,
    tag,
    layer: runtime.layer,
  }
}

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
