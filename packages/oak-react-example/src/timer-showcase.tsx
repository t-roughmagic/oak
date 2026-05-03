import { TimerMsg } from '@oak/example-prog-timer'
import { useTimerDispatch, useTimerSelector } from './oak-provider.js'

export function TimerControls() {
  const seconds = useTimerSelector((m) => m.seconds)
  const intervalMs = useTimerSelector((m) => m.intervalMs)
  const dispatch = useTimerDispatch()

  return (
    <section
      style={{
        display: 'grid',
        gap: '1rem',
        justifyItems: 'center',
        padding: '2rem',
        border: '1px solid #b6c8d7',
        borderRadius: '1rem',
        background: '#f0f7ff',
      }}
    >
      <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Oak Timer</h2>
        <p style={{ margin: 0, color: '#485e6a' }}>
          Auto-ticks via an Effect subscription. Changing the interval tears down the old loop and
          starts a new one.
        </p>
      </div>
      <output style={{ fontSize: '3rem', lineHeight: 1 }}>{seconds}s</output>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.9rem', color: '#485e6a' }}>Interval</label>
        {[250, 500, 1000, 2000].map((ms) => (
          <button
            key={ms}
            type="button"
            onClick={() => dispatch(TimerMsg.SetInterval({ ms }))}
            style={{
              padding: '0.4rem 0.6rem',
              fontSize: '0.85rem',
              fontWeight: ms === intervalMs ? 'bold' : 'normal',
              border: ms === intervalMs ? '2px solid #6a8fa8' : '1px solid #b6c8d7',
            }}
          >
            {ms}ms
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => dispatch(TimerMsg.Reset())}
        style={{ padding: '0.65rem 1rem', fontSize: '1rem' }}
      >
        Reset
      </button>
    </section>
  )
}
