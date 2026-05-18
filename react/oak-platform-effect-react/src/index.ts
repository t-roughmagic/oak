import type { ManagedRuntime } from 'effect'
import { createElement, useState, type ReactNode } from 'react'
import type { OakViewDriver } from '@oak/core'
import type { OakEffectProgram, OakService } from '@oak/platform-effect'
import { OakProvider } from '@oak/react'

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
 *
 * The layer must be synchronously buildable — any async layer construction
 * will cause `runSync` to throw at render time.
 */
export function useOakEffectViewDriver<M, Msg, E = never>(
  runtime: ManagedRuntime.ManagedRuntime<OakService<M, Msg>, E>,
  program: OakEffectViewProgram<M, Msg>,
): OakViewDriver<M, Msg> {
  const [driver] = useState(() => program.view(runtime.runSync(program.tag)))
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
