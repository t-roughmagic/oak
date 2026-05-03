import { RandomMsg } from '@oak/example-prog-cmd'
import { useRandomDispatch, useRandomSelector } from './oak-provider.js'

export function RandomNumberDemo() {
  const value = useRandomSelector((m) => m.value)
  const pending = useRandomSelector((m) => m.pending)
  const dispatch = useRandomDispatch()

  return (
    <section
      style={{
        display: 'grid',
        gap: '1rem',
        justifyItems: 'center',
        padding: '2rem',
        border: '1px solid #b6d7c4',
        borderRadius: '1rem',
        background: '#f0fff5',
      }}
    >
      <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Commands Demo</h2>
        <p style={{ margin: 0, color: '#48695e' }}>
          Dispatches <code>Fetch</code>, which fires an async command. After 2 seconds the command
          returns <code>Set</code>.
        </p>
      </div>
      <output style={{ fontSize: '3rem', lineHeight: 1 }}>
        {pending ? '...' : (value ?? '\u2014')}
      </output>
      <button
        type="button"
        disabled={pending}
        onClick={() => dispatch(RandomMsg.Fetch())}
        style={{ padding: '0.65rem 1rem', fontSize: '1rem' }}
      >
        {pending ? 'Fetching...' : 'Fetch Random Number'}
      </button>
    </section>
  )
}
