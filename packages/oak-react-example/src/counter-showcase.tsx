import { CounterMsg } from '@oak/example-prog-counter'
import { useCounterDispatch, useCounterSelector } from './oak-provider.js'

export function CounterControls({
  title,
  subtitle,
}: {
  readonly title: string
  readonly subtitle: string
}) {
  const count = useCounterSelector((model) => model.count)
  const dispatch = useCounterDispatch()

  return (
    <section
      style={{
        display: 'grid',
        gap: '1rem',
        justifyItems: 'center',
        padding: '2rem',
        border: '1px solid #d7cbb6',
        borderRadius: '1rem',
        background: '#fffaf0',
      }}
    >
      <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{title}</h2>
        <p style={{ margin: 0, color: '#5e5548' }}>{subtitle}</p>
      </div>
      <output style={{ fontSize: '3rem', lineHeight: 1 }}>{count}</output>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={() => dispatch(CounterMsg.Decrement())}
          style={{ padding: '0.65rem 1rem', fontSize: '1rem' }}
        >
          Decrement
        </button>
        <button
          type="button"
          onClick={() => dispatch(CounterMsg.Increment())}
          style={{ padding: '0.65rem 1rem', fontSize: '1rem' }}
        >
          Increment
        </button>
      </div>
    </section>
  )
}

function CounterCell({ index }: { readonly index: number }) {
  const count = useCounterSelector((model) => model.count)

  return (
    <div
      style={{
        display: 'grid',
        gap: '0.2rem',
        placeItems: 'center',
        aspectRatio: '1 / 1',
        minWidth: '3.5rem',
        padding: '0.4rem',
        borderRadius: '0.75rem',
        border: '1px solid #d7cbb6',
        background: index % 2 === 0 ? '#fff3dc' : '#f8ead0',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: '#7a6a58' }}>cell {index + 1}</span>
      <strong style={{ fontSize: '1.1rem' }}>{count}</strong>
    </div>
  )
}

export function CounterGrid() {
  return (
    <section
      style={{
        display: 'grid',
        gap: '1rem',
        padding: '2rem',
        border: '1px solid #d7cbb6',
        borderRadius: '1rem',
        background: '#fffaf0',
      }}
    >
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>64 Counter Selectors</h2>
        <p style={{ margin: 0, color: '#5e5548' }}>
          Each cell reads through the app-local counter selector hook.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
          gap: '0.6rem',
        }}
      >
        {Array.from({ length: 64 }, (_, index) => (
          <CounterCell key={index} index={index} />
        ))}
      </div>
    </section>
  )
}
