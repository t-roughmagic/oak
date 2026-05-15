'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  OakRuntimeProvider,
  useDispatch,
  useSelector,
} from '../../../oak-react/dist/index.js'
import { useScopedRuntime } from '../../../react-effect-provider/dist/index.js'
import { makeCounterProgram, type CounterModel } from './counter-program'

interface SeededProgram {
  readonly counter: ReturnType<typeof makeCounterProgram>
}

const ProgramContext = createContext<SeededProgram | null>(null)

function useProgram(): SeededProgram {
  const program = useContext(ProgramContext)
  if (program === null) {
    throw new Error('OakPageProvider is missing')
  }
  return program
}

/**
 * Plain data from the server component. This is the only thing crossing the
 * server/client boundary; the Oak program and store are created from it in the
 * client provider.
 */
export interface OakPageSeed {
  readonly counter: CounterModel
}

/**
 * Client Oak boundary for the page. It builds request-specific programs from
 * the server seed, owns the managed runtime, and exposes app-local hooks to the
 * rest of the client subtree.
 */
export function OakPageProvider({
  seed,
  children,
}: {
  readonly seed: OakPageSeed
  readonly children: ReactNode
}): ReactElement {
  const [program] = useState(() => ({ counter: makeCounterProgram(seed.counter) }))
  const runtime = useScopedRuntime(program.counter.layer)

  return (
    <ProgramContext.Provider value={program}>
      <OakRuntimeProvider runtime={runtime}>{children}</OakRuntimeProvider>
    </ProgramContext.Provider>
  )
}

export function useCounterValue() {
  const { counter } = useProgram()
  return useSelector(counter.tag, (model) => model.count)
}

export function useCounterDispatch() {
  const { counter } = useProgram()
  return useDispatch(counter.tag)
}
