import type { ReactNode } from 'react'
import { OakEffectViewProvider } from '@oak/oak-platform-effect-react'
import { useDispatch, useSelector } from './hooks.js'
import { appRuntime } from './runtime.js'
import {
  DiceMsg,
  diceProgram,
  selectAutoRoll,
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
  const state = useSelector(selector)
  const dispatch = useDispatch()

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
  const total = useSelector(selectDiceSum)

  return (
    <section>
      <h1>Oak dice program</h1>
      <div>
        <DieRoller label="Die 1" die="one" selector={selectDieOne} />
        <DieRoller label="Die 2" die="two" selector={selectDieTwo} />
        <DieRoller label="Die 3" die="three" selector={selectDieThree} />
      </div>
      <AutoRollPanel />
      <p>
        Total: <strong>{total}</strong>
      </p>
    </section>
  )
}

function AutoRollPanel() {
  const autoRoll = useSelector(selectAutoRoll)
  const dispatch = useDispatch()
  const intervalSeconds = autoRoll.intervalMs / 1_000

  return (
    <section aria-label="Auto-roll">
      <h2>Auto-roll</h2>
      <p>
        {autoRoll.enabled ? `Every ${intervalSeconds}s` : 'Stopped'} - ticks:{' '}
        <strong>{autoRoll.ticks}</strong>
      </p>
      <button type="button" onClick={() => dispatch(DiceMsg.ToggleAutoRoll())}>
        {autoRoll.enabled ? 'Stop auto-roll' : 'Start auto-roll'}
      </button>
      <button type="button" onClick={() => dispatch(DiceMsg.RollAll())}>
        Roll all now
      </button>
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
