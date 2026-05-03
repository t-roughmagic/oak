import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useLayoutEffect } from 'react'
import { CounterMsg } from '@oak/example-prog-counter'
import {
  AppOakProvider,
  type AppOakInitialState,
  useCounterDispatch,
  useCounterSelector,
} from './oak-provider.js'

type PageId = 'dashboard' | 'settings'

interface CommitRecord {
  readonly page: PageId
  readonly count: number
}

const pageSeeds: Record<PageId, AppOakInitialState> = {
  dashboard: {
    counter: { count: 11 },
    timer: { seconds: 0, intervalMs: 60_000 },
    random: { pending: false, value: null },
    joke: { pending: false, joke: null, error: null },
  },
  settings: {
    counter: { count: 27 },
    timer: { seconds: 0, intervalMs: 60_000 },
    random: { pending: false, value: null },
    joke: { pending: false, joke: null, error: null },
  },
}

afterEach(() => {
  cleanup()
})

function CounterPaintProbe({
  page,
  onCommit,
}: {
  readonly page: PageId
  readonly onCommit: (record: CommitRecord) => void
}) {
  const count = useCounterSelector((model) => model.count)

  useLayoutEffect(() => {
    onCommit({ page, count })
  }, [count, onCommit, page])

  return <output data-testid="counter-value">{count}</output>
}

function IncrementButton() {
  const dispatch = useCounterDispatch()
  return (
    <button type="button" onClick={() => dispatch(CounterMsg.Increment())}>
      Increment
    </button>
  )
}

function Page({
  page,
  onCommit,
}: {
  readonly page: PageId
  readonly onCommit: (record: CommitRecord) => void
}) {
  const initialState = pageSeeds[page]

  return (
    <section aria-label={page}>
      <h1>{page}</h1>
      <AppOakProvider key={page} initialState={initialState}>
        <CounterPaintProbe page={page} onCommit={onCommit} />
        <IncrementButton />
      </AppOakProvider>
    </section>
  )
}

describe('client-seeded Oak hydration', () => {
  it('mounts each page from server-built initial state before any paint-visible Oak commit', async () => {
    const commits: Array<CommitRecord> = []
    const onCommit = (record: CommitRecord) => {
      commits.push(record)
    }

    const { rerender } = render(<Page page="dashboard" onCommit={onCommit} />)

    await waitFor(() => {
      expect(screen.getByTestId('counter-value').textContent).toBe('11')
    })

    expect(commits).toEqual([{ page: 'dashboard', count: 11 }])
    expect(commits.some((record) => record.count === 0)).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Increment' }))

    await waitFor(() => {
      expect(screen.getByTestId('counter-value').textContent).toBe('12')
    })

    expect(commits.at(-1)).toEqual({ page: 'dashboard', count: 12 })

    rerender(<Page page="settings" onCommit={onCommit} />)

    await waitFor(() => {
      expect(screen.getByTestId('counter-value').textContent).toBe('27')
    })

    expect(commits).toContainEqual({ page: 'settings', count: 27 })
    expect(commits.some((record) => record.count === 0)).toBe(false)
    expect(screen.queryByText('0')).toBeNull()
  })
})
