import { createContext, createElement, useContext, type ReactNode } from 'react'
import type { OakKernel } from '../core/index.js'

const OakKernelContext = createContext<OakKernel<unknown, unknown> | null>(null)

export interface OakProviderProps<M, Msg> {
  readonly kernel: OakKernel<M, Msg>
  readonly children?: ReactNode
}

export function OakProvider<M, Msg>({ kernel, children }: OakProviderProps<M, Msg>) {
  return createElement(
    OakKernelContext.Provider,
    { value: kernel as OakKernel<unknown, unknown> },
    children,
  )
}

export function useOakKernel<M, Msg>(): OakKernel<M, Msg> {
  const kernel = useContext(OakKernelContext)
  if (kernel === null) {
    throw new Error('useOakKernel: no kernel found in context. Wrap your tree in <OakProvider>.')
  }
  return kernel as OakKernel<M, Msg>
}
