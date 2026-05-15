'use client'

import type { ReactNode } from 'react'
import { OakEffectViewProvider } from '../../../src/platform-effect/react.js'
import { useOakDispatch, useOakSelector } from '../../../src/react/index.js'
import { appRuntime } from './runtime.js'
import {
  DiceMsg,
  diceProgram,
  selectDiceSum,
  selectDieOne,
  selectDieThree,
  selectDieTwo,
  type DieId,
  type DieSelector,
} from './oak-program/index.js'

function DiceProgramProvider({ children }: { readonly children: ReactNode }) {
  return (
    <OakEffectViewProvider runtime={appRuntime} program={diceProgram}>
      {children}
    </OakEffectViewProvider>
  )
}

function DieRoller({
  label,
  die,
  selector,
}: {
  readonly label: string
  readonly die: DieId
  readonly selector: DieSelector
}) {
  const state = useOakSelector(selector)
  const dispatch = useOakDispatch<DiceMsg>()

  return (
    <article>
      <h2>{label}</h2>
      <output aria-label={`${label} value`}>{state.rolling ? 'rolling...' : state.value}</output>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <button
        type="button"
        disabled={state.rolling}
        onClick={() => dispatch(DiceMsg.Roll({ die }))}
      >
        {state.rolling ? 'Rolling...' : `Roll ${label}`}
      </button>
    </article>
  )
}

function DicePanel() {
  const total = useOakSelector(selectDiceSum)

  return (
    <section>
      <h1>Effect dice commands</h1>
      <div>
        <DieRoller label="Die 1" die="one" selector={selectDieOne} />
        <DieRoller label="Die 2" die="two" selector={selectDieTwo} />
        <DieRoller label="Die 3" die="three" selector={selectDieThree} />
      </div>
      <p>
        Total: <strong>{total}</strong>
      </p>
    </section>
  )
}

export function App() {
  return (
    <DiceProgramProvider>
      <DicePanel />
    </DiceProgramProvider>
  )
}
