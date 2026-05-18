import { Effect } from 'effect'
import type { EffectCommand } from '@oak/platform-effect'
import { DeskMsg } from './message'
import { DeskApi } from './service'
import type { ActivityItem, DeskModel, DeskTask, RefreshResult, TaskStatus } from './model'

type DeskCommand = EffectCommand<DeskModel, DeskMsg, DeskApi>

const refreshDesk: DeskCommand = (_msg, model) =>
  Effect.flatMap(DeskApi, (api) => api.refresh(model)).pipe(
    Effect.map((result) => DeskMsg.RefreshSucceeded({ result })),
    Effect.catchAll((error) => Effect.succeed(DeskMsg.RefreshFailed({ message: error.message }))),
  )

const addActivity = (
  model: DeskModel,
  message: string,
  at = new Date().toISOString(),
): DeskModel => {
  const item: ActivityItem = {
    id: `${at}:${model.activity.length}`,
    message,
    at,
  }

  return {
    ...model,
    activity: [item, ...model.activity].slice(0, 6),
  }
}

const setRefreshPending =
  (pending: boolean) =>
  (model: DeskModel): DeskModel => ({
    ...model,
    refresh: {
      ...model.refresh,
      pending,
      error: pending ? null : model.refresh.error,
    },
  })

const applyRefreshResult =
  (result: RefreshResult) =>
  (model: DeskModel): DeskModel => {
    const tasks = model.tasks.map((task): DeskTask => {
      if (task.id !== result.priorityBumpTaskId || task.status === 'done') return task
      return { ...task, priority: Math.min(task.priority + 1, 5) }
    })

    return addActivity(
      {
        ...model,
        tasks,
        refresh: {
          ...model.refresh,
          pending: false,
          lastUpdatedAt: result.at,
          error: null,
        },
      },
      result.activityMessage,
      result.at,
    )
  }

const setTaskStatus =
  (id: string, status: TaskStatus) =>
  (model: DeskModel): DeskModel =>
    addActivity(
      {
        ...model,
        tasks: model.tasks.map((task) => (task.id === id ? { ...task, status } : task)),
      },
      `Marked task ${id} as ${status}`,
    )

const requestRefresh = (model: DeskModel, countTick: boolean) => {
  if (model.refresh.pending) {
    return {
      mutation: (model: DeskModel) => model,
      effects: [],
    }
  }

  return {
    mutation: (model: DeskModel) =>
      setRefreshPending(true)({
        ...model,
        refresh: {
          ...model.refresh,
          ticks: countTick ? model.refresh.ticks + 1 : model.refresh.ticks,
        },
      }),
    effects: [refreshDesk],
  }
}

export const update = (msg: DeskMsg, model: DeskModel) =>
  DeskMsg.$match(msg, {
    SelectTask: ({ id }) => ({
      mutation: (model: DeskModel) => ({ ...model, selectedTaskId: id }),
      effects: [],
    }),
    SetFilter: ({ filter }) => ({
      mutation: (model: DeskModel) => ({ ...model, filter }),
      effects: [],
    }),
    SetTaskStatus: ({ id, status }) => ({
      mutation: setTaskStatus(id, status),
      effects: [],
    }),
    ToggleAutoRefresh: () => ({
      mutation: (model: DeskModel) => ({
        ...model,
        refresh: {
          ...model.refresh,
          enabled: !model.refresh.enabled,
        },
      }),
      effects: [],
    }),
    RefreshRequested: () => requestRefresh(model, false),
    RefreshTick: () =>
      model.refresh.enabled
        ? requestRefresh(model, true)
        : { mutation: (model: DeskModel) => model, effects: [] },
    RefreshSucceeded: ({ result }) => ({
      mutation: applyRefreshResult(result),
      effects: [],
    }),
    RefreshFailed: ({ message }) => ({
      mutation: (model: DeskModel) => ({
        ...model,
        refresh: {
          ...model.refresh,
          pending: false,
          error: message,
        },
      }),
      effects: [],
    }),
  })
