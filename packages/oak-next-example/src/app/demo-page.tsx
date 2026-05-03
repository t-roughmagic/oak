'use client'

import type { ReactElement } from 'react'
import {
  OakPageProvider,
  type OakPageSeed,
  useCounterDispatch,
  useCounterValue,
} from './page-client'

export function DemoPage({
  page,
  seed,
  note,
}: {
  readonly page: string
  readonly seed: OakPageSeed
  readonly note: string
}): ReactElement {
  return (
    <OakPageProvider key={page} seed={seed}>
      <DemoPageBody page={page} note={note} />
    </OakPageProvider>
  )
}

function DemoPageBody({ page, note }: { readonly page: string; readonly note: string }) {
  const count = useCounterValue()
  const dispatch = useCounterDispatch()

  return (
    <section
      style={{
        maxWidth: '72rem',
        margin: '0 auto',
        display: 'grid',
        gap: '1rem',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: '0.45rem',
          padding: '1.5rem',
          border: '1px solid var(--line)',
          borderRadius: '1.25rem',
          background: 'var(--panel)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <span
              style={{
                fontSize: '0.8rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              {page}
            </span>
            <h1 style={{ margin: 0, fontSize: '2.6rem', lineHeight: 1 }}>Counter {count}</h1>
            <p style={{ margin: 0, color: 'var(--muted)', maxWidth: '46rem' }}>{note}</p>
          </div>
          <div
            style={{
              alignSelf: 'start',
              padding: '0.45rem 0.7rem',
              borderRadius: '999px',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            server seed
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => dispatch({ _tag: 'Decrement' })}
            style={{
              padding: '0.7rem 1rem',
              borderRadius: '0.85rem',
              border: '1px solid var(--line)',
              background: 'white',
            }}
          >
            Decrement
          </button>
          <button
            type="button"
            onClick={() => dispatch({ _tag: 'Increment' })}
            style={{
              padding: '0.7rem 1rem',
              borderRadius: '0.85rem',
              border: '1px solid var(--line)',
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            Increment
          </button>
          <span style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
            Reload the page and the count should appear already seeded, with no 0-frame flicker.
          </span>
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '1rem 1.2rem',
          borderRadius: '1rem',
          border: '1px solid var(--line)',
          background: 'rgba(255,255,255,0.7)',
          color: 'var(--muted)',
          overflowX: 'auto',
        }}
      >
        {JSON.stringify({ page, count }, null, 2)}
      </pre>
    </section>
  )
}
