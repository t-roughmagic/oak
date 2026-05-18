import { Context, Effect, Layer } from 'effect'
import type { DeskModel, RefreshResult } from './model'

export interface DeskApi {
  readonly refresh: (model: DeskModel) => Effect.Effect<RefreshResult, Error>
}

export const DeskApi = Context.GenericTag<DeskApi>('@oak/example-next/DeskApi')

export const DeskApiLive: Layer.Layer<DeskApi> = Layer.succeed(
  DeskApi,
  DeskApi.of({
    refresh: (model) =>
      Effect.sleep('450 millis').pipe(
        Effect.map(() => {
          const openTask = model.tasks.find((task) => task.status !== 'done')
          const at = new Date().toISOString()

          return {
            at,
            activityMessage: openTask
              ? `Server refresh checked ${openTask.title}`
              : 'Server refresh found no open work',
            priorityBumpTaskId: openTask?.id ?? null,
          }
        }),
      ),
  }),
)
