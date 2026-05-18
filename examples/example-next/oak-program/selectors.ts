import type { DeskFilter, DeskModel, DeskTask } from './model'

export const selectHeader = (model: DeskModel) => ({
  desk: model.desk,
  mode: model.mode,
  operator: model.operator,
  generatedAt: model.generatedAt,
})

export const selectFilter = (model: DeskModel): DeskFilter => model.filter

export const selectRefresh = (model: DeskModel) => model.refresh

export const selectActivity = (model: DeskModel) => model.activity

export const selectVisibleTasks = (model: DeskModel): readonly DeskTask[] =>
  model.filter === 'all' ? model.tasks : model.tasks.filter((task) => task.status === model.filter)

export const selectSelectedTask = (model: DeskModel): DeskTask | null =>
  model.tasks.find((task) => task.id === model.selectedTaskId) ?? null

export const selectSummary = (model: DeskModel) => ({
  total: model.tasks.length,
  open: model.tasks.filter((task) => task.status === 'open').length,
  blocked: model.tasks.filter((task) => task.status === 'blocked').length,
  done: model.tasks.filter((task) => task.status === 'done').length,
})
