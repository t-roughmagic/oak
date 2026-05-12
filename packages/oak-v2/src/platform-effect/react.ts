'use client'

import { Effect } from 'effect'
import { useEffectRuntime } from '@oak/react-effect-provider'
import { createElement, Fragment, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { OakViewDriver } from '../core/index.js'
import { OakProvider } from '../react/index.js'
import type { OakEffectProgram } from './program.js'
import type { OakService } from './service.js'

export type OakEffectViewProgram<M, Msg> = Pick<OakEffectProgram<M, Msg, unknown>, 'tag' | 'view'>

export interface OakEffectViewProviderProps<M, Msg> {
  readonly program: OakEffectViewProgram<M, Msg>
  readonly fallback?: ReactNode
  readonly children?: ReactNode
}

type DriverState<M, Msg> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly driver: OakViewDriver<M, Msg> }
  | { readonly status: 'failed'; readonly error: unknown }

export function useOakEffectViewDriver<M, Msg>(
  program: OakEffectViewProgram<M, Msg>,
): OakViewDriver<M, Msg> | null {
  const runtime = useEffectRuntime<OakService<M, Msg>>()
  const [state, setState] = useState<DriverState<M, Msg>>({ status: 'loading' })

  useEffect(() => {
    let alive = true

    setState({ status: 'loading' })
    void runtime.runPromise(Effect.flatMap(program.tag, Effect.succeed)).then(
      (service) => {
        if (alive) {
          setState({ status: 'ready', driver: program.view(service) })
        }
      },
      (error: unknown) => {
        if (alive) {
          setState({ status: 'failed', error })
        }
      },
    )

    return () => {
      alive = false
    }
  }, [program, runtime])

  if (state.status === 'failed') {
    throw state.error
  }

  return state.status === 'ready' ? state.driver : null
}

export function OakEffectViewProvider<M, Msg>({
  program,
  fallback = null,
  children,
}: OakEffectViewProviderProps<M, Msg>) {
  const driver = useOakEffectViewDriver(program)

  if (driver === null) {
    return createElement(Fragment, null, fallback)
  }

  return createElement(OakProvider, { driver }, children)
}
