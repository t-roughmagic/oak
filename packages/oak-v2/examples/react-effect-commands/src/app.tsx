'use client'

import { Effect } from 'effect'
import { EffectRuntimeProvider, useEffectRuntime } from '@oak/react-effect-provider'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { OakProvider, useOakDispatch, useOakSelector } from '../../../src/react/index.js'
import type { OakViewDriver } from '../../../src/core/index.js'
import type { OakService } from '../../../src/platform-effect/index.js'
import { RandomMsg } from './message.js'
import type { RandomModel } from './model.js'
import { randomProgram } from './program.js'

function RandomProgramProvider({ children }: { readonly children: ReactNode }) {
  return (
    <EffectRuntimeProvider layer={randomProgram.layer} runtimeName="Oak v2 example runtime">
      <RandomOakProvider>{children}</RandomOakProvider>
    </EffectRuntimeProvider>
  )
}

function RandomOakProvider({ children }: { readonly children: ReactNode }) {
  const runtime = useEffectRuntime<OakService<RandomModel, RandomMsg>>()
  const [driver, setDriver] = useState<OakViewDriver<RandomModel, RandomMsg> | null>(null)

  useEffect(() => {
    let alive = true

    void runtime.runPromise(Effect.flatMap(randomProgram.tag, Effect.succeed)).then((service) => {
      if (alive) {
        setDriver(randomProgram.view(service))
      }
    })

    return () => {
      alive = false
    }
  }, [runtime])

  if (driver === null) {
    return <output>Starting Oak program...</output>
  }

  return <OakProvider driver={driver}>{children}</OakProvider>
}

function RandomPanel() {
  const pending = useOakSelector<RandomModel, boolean>((model) => model.pending)
  const value = useOakSelector<RandomModel, number | null>((model) => model.value)
  const error = useOakSelector<RandomModel, string | null>((model) => model.error)
  const dispatch = useOakDispatch<RandomMsg>()

  return (
    <section>
      <h1>Effect command demo</h1>
      <p>
        Current value: <strong>{value ?? 'none'}</strong>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" disabled={pending} onClick={() => dispatch(RandomMsg.Fetch())}>
        {pending ? 'Loading...' : 'Fetch random number'}
      </button>
    </section>
  )
}

export function App() {
  return (
    <RandomProgramProvider>
      <RandomPanel />
    </RandomProgramProvider>
  )
}
