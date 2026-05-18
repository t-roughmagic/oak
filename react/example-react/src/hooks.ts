import { createOakHooks } from '@oak/oak-react'
import type { DiceMsg } from './oak-program/message.js'
import type { DiceModel } from './oak-program/model.js'

export const { useSelector, useDispatch } = createOakHooks<DiceModel, DiceMsg>()
