'use client'

import { Layer } from 'effect'
import { EffectRuntimeProvider } from '@oak/react-effect-provider'
import type { ReactNode } from 'react'
import { OakEffectViewProvider } from '../../../src/platform-effect/react.js'
import { useOakDispatch, useOakSelector } from '../../../src/react/index.js'
import { RandomMsg } from './message.js'
import type { RandomModel } from './model.js'
import { randomProgram, RandomNumberLive } from './program.js'

const appLayer = randomProgram.layer.pipe(Layer.provideMerge(RandomNumberLive))

function RandomProgramProvider({ children }: { readonly children: ReactNode }) {
  return (
    <EffectRuntimeProvider layer={appLayer} runtimeName="Oak v2 example runtime">
      <OakEffectViewProvider
        program={randomProgram}
        fallback={<output>Starting Oak program...</output>}
      >
        {children}
      </OakEffectViewProvider>
    </EffectRuntimeProvider>
  )
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
