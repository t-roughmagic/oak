import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useTransition, type ReactElement } from 'react'
import { DeskMsg } from '@/oak-program/index'
import {
  selectActivity,
  selectFilter,
  selectHeader,
  selectRefresh,
  selectSelectedTask,
  selectSummary,
  selectVisibleTasks,
} from '@/oak-program/selectors'
import type { TaskStatus } from '@/oak-program/model'
import type { DeskSeed } from '@/lib/server-seed'
import { useDispatch, useSelector } from './hooks'

const filters = ['all', 'open', 'blocked', 'done'] as const
const statuses = ['open', 'blocked', 'done'] as const

export function DeskView({ seed }: { readonly seed: DeskSeed }): ReactElement {
  const header = useSelector(selectHeader)
  const summary = useSelector(selectSummary)
  const filter = useSelector(selectFilter)
  const tasks = useSelector(selectVisibleTasks)
  const selectedTask = useSelector(selectSelectedTask)
  const refresh = useSelector(selectRefresh)
  const activity = useSelector(selectActivity)
  const dispatch = useDispatch()
  const router = useRouter()
  const [isNavigating, startNavigation] = useTransition()

  const navigateToIncident = () => {
    startNavigation(() => {
      router.push('/desks/launch?mode=incident&operator=Riley')
    })
  }

  return (
    <div className="desk">
      <section className="hero">
        <div>
          <h1>{header.desk}</h1>
          <p>
            Server seed `{seed.seedKey}` initialized this Oak runtime for {header.operator}.
          </p>
        </div>
        <div className="hero-meta">
          <span>Mode: {header.mode}</span>
          <span>Generated: {new Date(header.generatedAt).toLocaleTimeString()}</span>
          <span>Refreshes: {refresh.ticks}</span>
        </div>
        <nav className="nav" aria-label="Server-seeded routes">
          {seed.navigation.map((item) => (
            <Link key={item.href} href={item.href as Route}>
              {item.label}
            </Link>
          ))}
          <button type="button" disabled={isNavigating} onClick={navigateToIncident}>
            {isNavigating ? 'Navigating' : 'Router push incident'}
          </button>
        </nav>
      </section>

      <section className="panel">
        <h2>Server initialized model</h2>
        <div className="metrics">
          <span className="metric">Total {summary.total}</span>
          <span className="metric">Open {summary.open}</span>
          <span className="metric">Blocked {summary.blocked}</span>
          <span className="metric">Done {summary.done}</span>
        </div>
      </section>

      <div className="grid">
        <section className="panel">
          <header className="toolbar">
            <h2>Work queue</h2>
            <button
              type="button"
              disabled={refresh.pending}
              onClick={() => dispatch(DeskMsg.RefreshRequested())}
            >
              {refresh.pending ? 'Refreshing' : 'Refresh via Effect'}
            </button>
            <button type="button" onClick={() => dispatch(DeskMsg.ToggleAutoRefresh())}>
              {refresh.enabled ? 'Stop auto-refresh' : 'Start auto-refresh'}
            </button>
          </header>

          <div className="toolbar" aria-label="Task filters">
            {filters.map((value) => (
              <button
                key={value}
                type="button"
                disabled={filter === value}
                onClick={() => dispatch(DeskMsg.SetFilter({ filter: value }))}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="task-list">
            {tasks.map((task) => (
              <article className="task" key={task.id}>
                <header>
                  <h3>{task.title}</h3>
                  <span className={`status ${task.status}`}>{task.status}</span>
                </header>
                <p>
                  Owner {task.owner} - priority {task.priority}
                </p>
                <footer>
                  <button
                    type="button"
                    onClick={() => dispatch(DeskMsg.SelectTask({ id: task.id }))}
                  >
                    {selectedTask?.id === task.id ? 'Selected' : 'Inspect'}
                  </button>
                  <StatusButtons
                    current={task.status}
                    onChange={(status) => dispatch(DeskMsg.SetTaskStatus({ id: task.id, status }))}
                  />
                </footer>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel">
          <h2>Runtime state</h2>
          {selectedTask ? (
            <p>
              Inspecting {selectedTask.title}, owned by {selectedTask.owner}.
            </p>
          ) : (
            <p>No task selected.</p>
          )}
          <p>
            Auto-refresh {refresh.enabled ? 'enabled' : 'disabled'} every{' '}
            {refresh.intervalMs / 1_000}s.
          </p>
          {refresh.error ? <p role="alert">{refresh.error}</p> : null}
          <div className="activity-list">
            {activity.map((item) => (
              <div className="activity" key={item.id}>
                <p>{item.message}</p>
                <span>{new Date(item.at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function StatusButtons({
  current,
  onChange,
}: {
  readonly current: TaskStatus
  readonly onChange: (status: TaskStatus) => void
}): ReactElement {
  return (
    <div className="toolbar" aria-label="Set task status">
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          disabled={current === status}
          onClick={() => onChange(status)}
        >
          {status}
        </button>
      ))}
    </div>
  )
}
