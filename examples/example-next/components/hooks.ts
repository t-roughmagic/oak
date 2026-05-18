import { createOakHooks } from '@oak/react'
import type { DeskMsg } from '@/oak-program/message'
import type { DeskModel } from '@/oak-program/model'

export const { useDispatch, useSelector } = createOakHooks<DeskModel, DeskMsg>()
