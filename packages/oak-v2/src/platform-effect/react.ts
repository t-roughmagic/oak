'use client'

import { Effect, type ManagedRuntime } from 'effect'
import { createElement, useState, type ReactNode } from 'react'
import type { OakViewDriver } from '../core/index.js'
import { OakProvider } from '../react/index.js'
import type { OakEffectProgram } from './program.js'
import type { OakService } from './service.js'

export type OakEffectViewProgram<M, Msg> = Pick<OakEffectProgram<M, Msg, unknown>, 'tag' | 'view'>

export interface OakEffectViewProviderProps<M, Msg, E = never> {
  readonly runtime: ManagedRuntime.ManagedRuntime<OakService<M, Msg>, E>
  readonly program: OakEffectViewProgram<M, Msg>
  readonly children?: ReactNode
}

/**
 * Synchronously extracts the Oak driver from the runtime so children render
 * the `init` model on first paint. The service effect is sync (`Effect.gen`
 * reading context and constructing a kernel), so `runSync` succeeds and
 * `ManagedRuntime` memoizes the layer build across re-extractions.
 */
export function useOakEffectViewDriver<M, Msg, E = never>(
  runtime: ManagedRuntime.ManagedRuntime<OakService<M, Msg>, E>,
  program: OakEffectViewProgram<M, Msg>,
): OakViewDriver<M, Msg> {
  const [driver] = useState(() =>
    program.view(runtime.runSync(Effect.flatMap(program.tag, Effect.succeed))),
  )
  return driver
}

export function OakEffectViewProvider<M, Msg, E = never>({
  runtime,
  program,
  children,
}: OakEffectViewProviderProps<M, Msg, E>) {
  const driver = useOakEffectViewDriver(runtime, program)
  return createElement(OakProvider, { driver }, children)
}
