import * as Optic from '@fp-ts/optic'
import { Effect, pipe } from 'effect'
import type { Update } from '../../../../src/core/index.js'
import type { EffectCommand } from '../../../../src/platform-effect/index.js'
import { DiceRoller } from './dice-roller.js'
import { DiceMsg } from './message.js'
import type { DiceModel, DieId } from './model.js'
import * as o from './optics.js'

type DiceCommand = EffectCommand<DiceModel, DiceMsg, DiceRoller>

const rollDie =
  (die: DieId): DiceCommand =>
  () =>
    Effect.sleep('650 millis').pipe(
      Effect.flatMap(() => DiceRoller),
      Effect.flatMap((roller) => roller.roll),
      Effect.map((value) => DiceMsg.Rolled({ die, value })),
      Effect.catchAll((error) => Effect.succeed(DiceMsg.Failed({ die, message: String(error) }))),
    )

const setDieRolling = (die: DieId, rolling: boolean) =>
  pipe(die, o.dieOptic, o.dieRollingOptic, (optic) => Optic.replace(optic)(rolling))

const setDieValue = (die: DieId, value: number) =>
  pipe(die, o.dieOptic, o.dieValueOptic, (optic) => Optic.replace(optic)(value))

const setDieError = (die: DieId, error: string | null) =>
  pipe(die, o.dieOptic, o.dieErrorOptic, (optic) => Optic.replace(optic)(error))

const startRolling = (die: DieId) => (model: DiceModel) =>
  pipe(model, setDieRolling(die, true), setDieError(die, null))

const finishRolling = (die: DieId, value: number) => (model: DiceModel) =>
  pipe(model, setDieValue(die, value), setDieRolling(die, false), setDieError(die, null))

const failRolling = (die: DieId, message: string) => (model: DiceModel) =>
  pipe(model, setDieRolling(die, false), setDieError(die, message))

export const update: Update<DiceModel, DiceMsg, DiceCommand> = (msg: DiceMsg, model: DiceModel) => {
  switch (msg._tag) {
    case 'Roll':
      if (model.dice[msg.die].rolling) {
        return {
          mutation: (model) => model,
          effects: [],
        }
      }
      return {
        mutation: startRolling(msg.die),
        effects: [rollDie(msg.die)],
      }
    case 'Rolled':
      return {
        mutation: finishRolling(msg.die, msg.value),
        effects: [],
      }
    case 'Failed':
      return {
        mutation: failRolling(msg.die, msg.message),
        effects: [],
      }
  }
}
