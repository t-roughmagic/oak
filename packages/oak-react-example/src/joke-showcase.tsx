import { JokeMsg } from '@oak/example-http'
import { useJokeDispatch, useJokeSelector } from './oak-provider.js'

export function JokeFetcher() {
  const joke = useJokeSelector((m) => m.joke)
  const pending = useJokeSelector((m) => m.pending)
  const error = useJokeSelector((m) => m.error)
  const dispatch = useJokeDispatch()

  return (
    <section
      style={{
        display: 'grid',
        gap: '1rem',
        justifyItems: 'center',
        padding: '2rem',
        border: '1px solid #c9bfd1',
        borderRadius: '1rem',
        background: '#faf5ff',
      }}
    >
      <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>HTTP Service Demo</h2>
        <p style={{ margin: 0, color: '#5e4969', textAlign: 'center' }}>
          The program declares a <code>JokeService</code> requirement. The provider supplies{' '}
          <code>JokeServiceLive</code> at the runtime boundary; the UI just dispatches{' '}
          <code>Fetch</code>.
        </p>
      </div>
      <output
        style={{
          minHeight: '4rem',
          fontStyle: 'italic',
          textAlign: 'center',
          maxWidth: '36rem',
        }}
      >
        {pending ? '...' : (error ?? joke ?? 'Click to fetch a dad joke.')}
      </output>
      <button
        type="button"
        disabled={pending}
        onClick={() => dispatch(JokeMsg.Fetch())}
        style={{ padding: '0.65rem 1rem', fontSize: '1rem' }}
      >
        {pending ? 'Fetching...' : 'Fetch Joke'}
      </button>
    </section>
  )
}
