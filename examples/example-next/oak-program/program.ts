import { makeOakEffectProgram } from '@oak/platform-effect'
import { DeskMsg } from './message'
import type { DeskModel } from './model'
import type { DeskApi } from './service'
import { refreshSub } from './subscription'
import { update } from './update'

export function makeDeskProgram(init: DeskModel) {
  return makeOakEffectProgram<DeskModel, DeskMsg, DeskApi>({
    tagKey: '@oak/example-next/DeskProgram',
    init,
    update,
    subscriptions: [refreshSub],
  })
}
