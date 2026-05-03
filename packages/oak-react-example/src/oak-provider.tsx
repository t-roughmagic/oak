import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { Layer } from 'effect'
import { OakRuntimeContext, useDispatch, useManagedRuntime, useSelector } from '@oak/oak-react'
import { makeOakLayer, type OakProgram } from '@oak/oak'
import { makeCounterProgram, type CounterModel, type CounterMsg } from '@oak/example-prog-counter'
import { makeRandomProgram, type RandomModel, type RandomMsg } from '@oak/example-prog-cmd'
import { makeTimerProgram, type TimerModel, type TimerMsg } from '@oak/example-prog-timer'
import {
  JokeService,
  JokeServiceLive,
  makeJokeProgram,
  type JokeModel,
  type JokeMsg,
} from '@oak/example-http'

export interface AppOakInitialState {
  readonly counter: CounterModel
  readonly timer: TimerModel
  readonly random: RandomModel
  readonly joke: JokeModel
}

interface AppOakPrograms {
  readonly counter: OakProgram<CounterModel, CounterMsg>
  readonly timer: OakProgram<TimerModel, TimerMsg>
  readonly random: OakProgram<RandomModel, RandomMsg>
  readonly joke: OakProgram<JokeModel, JokeMsg, JokeService>
}

const defaultInitialState: AppOakInitialState = {
  counter: { count: 0 },
  timer: { seconds: 0, intervalMs: 1000 },
  random: { pending: false, value: null },
  joke: { pending: false, joke: null, error: null },
}

const AppOakProgramsContext = createContext<AppOakPrograms | null>(null)

function makeAppOakPrograms(initialState: AppOakInitialState): AppOakPrograms {
  return {
    counter: makeCounterProgram(initialState.counter),
    timer: makeTimerProgram(initialState.timer),
    random: makeRandomProgram(initialState.random),
    joke: makeJokeProgram(initialState.joke),
  }
}

function useAppOakPrograms(): AppOakPrograms {
  const programs = useContext(AppOakProgramsContext)
  if (programs === null) {
    throw new Error('AppOakProvider is missing')
  }
  return programs
}

export function AppOakProvider({
  initialState = defaultInitialState,
  children,
}: {
  readonly initialState?: AppOakInitialState
  readonly children: ReactNode
}) {
  const [{ programs, layer }] = useState(() => {
    const programs = makeAppOakPrograms(initialState)
    // The joke program declares JokeService as an environment requirement.
    // Layer.provide(JokeServiceLive) satisfies it before the layer is handed
    // to ManagedRuntime, which requires R = never.
    const layer = makeOakLayer(
      programs.counter,
      programs.timer,
      programs.random,
      programs.joke,
    ).pipe(Layer.provide(JokeServiceLive))
    return { programs, layer }
  })
  const runtime = useManagedRuntime(layer)

  return (
    <AppOakProgramsContext.Provider value={programs}>
      <OakRuntimeContext.Provider value={runtime}>{children}</OakRuntimeContext.Provider>
    </AppOakProgramsContext.Provider>
  )
}

export function useCounterSelector<A>(
  selector: (model: CounterModel) => A,
  eq?: (a: A, b: A) => boolean,
): A {
  const { counter } = useAppOakPrograms()
  return useSelector(counter.tag, selector, eq)
}

export function useCounterDispatch(): (message: CounterMsg) => void {
  const { counter } = useAppOakPrograms()
  return useDispatch(counter.tag)
}

export function useTimerSelector<A>(
  selector: (model: TimerModel) => A,
  eq?: (a: A, b: A) => boolean,
): A {
  const { timer } = useAppOakPrograms()
  return useSelector(timer.tag, selector, eq)
}

export function useTimerDispatch(): (message: TimerMsg) => void {
  const { timer } = useAppOakPrograms()
  return useDispatch(timer.tag)
}

export function useRandomSelector<A>(
  selector: (model: RandomModel) => A,
  eq?: (a: A, b: A) => boolean,
): A {
  const { random } = useAppOakPrograms()
  return useSelector(random.tag, selector, eq)
}

export function useRandomDispatch(): (message: RandomMsg) => void {
  const { random } = useAppOakPrograms()
  return useDispatch(random.tag)
}

export function useJokeSelector<A>(
  selector: (model: JokeModel) => A,
  eq?: (a: A, b: A) => boolean,
): A {
  const { joke } = useAppOakPrograms()
  return useSelector(joke.tag, selector, eq)
}

export function useJokeDispatch(): (message: JokeMsg) => void {
  const { joke } = useAppOakPrograms()
  return useDispatch(joke.tag)
}
