import * as Optic from '@fp-ts/optic'
import { Effect, pipe } from 'effect'
import type { EffectCommand } from '@oak/platform-effect'
import { DiceRoller } from './dice-roller.js'
import { DiceMsg } from './message.js'
import { dieIds, type DiceModel, type DieId } from './model.js'
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

const toggleAutoRoll = (model: DiceModel): DiceModel => ({
  ...model,
  autoRoll: {
    ...model.autoRoll,
    enabled: !model.autoRoll.enabled,
  },
})

const countAutoRollTick = (model: DiceModel): DiceModel => ({
  ...model,
  autoRoll: {
    ...model.autoRoll,
    ticks: model.autoRoll.ticks + 1,
  },
})

const readyDice = (model: DiceModel): readonly DieId[] =>
  dieIds.filter((die) => !model.dice[die].rolling)

const startRollingDice = (dice: readonly DieId[]) => (model: DiceModel) =>
  dice.reduce((next, die) => startRolling(die)(next), model)

const rollReadyDice = (
  model: DiceModel,
  beforeRoll: (model: DiceModel) => DiceModel = (m) => m,
) => {
  const dice = readyDice(model)

  return {
    mutation: (model: DiceModel) => startRollingDice(dice)(beforeRoll(model)),
    effects: dice.map(rollDie),
  }
}

export const update = (msg: DiceMsg, model: DiceModel) =>
  DiceMsg.$match(msg, {
    Roll: ({ die }) => {
      if (model.dice[die].rolling) {
        return {
          mutation: (model: DiceModel) => model,
          effects: [],
        }
      }

      return {
        mutation: startRolling(die),
        effects: [rollDie(die)],
      }
    },
    RollAll: () => rollReadyDice(model),
    ToggleAutoRoll: () => ({
      mutation: toggleAutoRoll,
      effects: [],
    }),
    AutoRollTick: () =>
      model.autoRoll.enabled
        ? rollReadyDice(model, countAutoRollTick)
        : {
            mutation: (model: DiceModel) => model,
            effects: [],
          },
    Rolled: ({ die, value }) => ({
      mutation: finishRolling(die, value),
      effects: [],
    }),
    Failed: ({ die, message }) => ({
      mutation: failRolling(die, message),
      effects: [],
    }),
  })
