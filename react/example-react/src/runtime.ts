'use client'

import { Layer, ManagedRuntime } from 'effect'
import { createRuntimeBinding } from '@oak/effect-runtime-react-provider'
import { diceProgram, DiceRollerLive } from './oak-program/index.js'

const appLayer = diceProgram.layer.pipe(Layer.provideMerge(DiceRollerLive))

export const appRuntime = ManagedRuntime.make(appLayer)

export const { Provider: AppRuntimeProvider, useRuntime: useAppRuntime } = createRuntimeBinding(
  appRuntime,
  { name: 'Dice example runtime' },
)
