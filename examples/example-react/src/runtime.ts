import { Layer, ManagedRuntime } from 'effect'
import { diceProgram, DiceRollerLive } from './oak-program/index.js'

const appLayer = diceProgram.layer.pipe(Layer.provideMerge(DiceRollerLive))

export const appRuntime = ManagedRuntime.make(appLayer)
