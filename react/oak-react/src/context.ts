import { createContext, createElement, useContext, type ReactNode } from 'react'
import type { OakViewDriver } from '@oak/oak-core'

const OakDriverContext = createContext<OakViewDriver<unknown, unknown> | null>(null)

export interface OakProviderProps<M, Msg> {
  readonly driver: OakViewDriver<M, Msg>
  readonly children?: ReactNode
}

export function OakProvider<M, Msg>({ driver, children }: OakProviderProps<M, Msg>) {
  return createElement(
    OakDriverContext.Provider,
    { value: driver as OakViewDriver<unknown, unknown> },
    children,
  )
}

export function useOakDriver<M, Msg>(): OakViewDriver<M, Msg> {
  const driver = useContext(OakDriverContext)
  if (driver === null) {
    throw new Error(
      'useOakDriver: no Oak driver found in context. Wrap your tree in <OakProvider>.',
    )
  }
  return driver as OakViewDriver<M, Msg>
}
