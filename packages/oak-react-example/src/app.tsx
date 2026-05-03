import { CounterControls, CounterGrid } from './counter-showcase.js'
import { AppOakProvider, type AppOakInitialState } from './oak-provider.js'
import { TimerControls } from './timer-showcase.js'
import { RandomNumberDemo } from './random-showcase.js'
import { JokeFetcher } from './joke-showcase.js'

const initialState = {
  counter: { count: 7 },
  timer: { seconds: 3, intervalMs: 500 },
  random: { pending: false, value: 42 },
  joke: { pending: false, joke: null, error: null },
} satisfies AppOakInitialState

export function App() {
  return (
    <AppOakProvider initialState={initialState}>
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f5f1e8',
          color: '#1a1a1a',
          fontFamily: 'Georgia, serif',
          padding: '2rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: '1.5rem',
            width: 'min(72rem, 100%)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: '1.5rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
            }}
          >
            <CounterControls
              title="Oak Counter"
              subtitle="Primary controls for the shared counter model."
            />
            <CounterControls
              title="Mirror Controls"
              subtitle="A second form dispatching into the exact same Oak program."
            />
            <TimerControls />
            <RandomNumberDemo />
            <JokeFetcher />
          </div>
          <CounterGrid />
        </div>
      </main>
    </AppOakProvider>
  )
}
