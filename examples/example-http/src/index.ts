import { makeOakEffectProgram } from '@oak/oak-platform-effect'
import { init, type JokeModel } from './model.js'
import type { JokeMsg } from './message.js'
import type { JokeService } from './service.js'
import { update } from './update.js'

export type { JokeModel } from './model.js'
export { JokeMsg } from './message.js'
export { JokeService, JokeServiceLive, JokeServiceFake, JokeFetchError } from './service.js'

export function makeJokeProgram(initial: JokeModel = init) {
  return makeOakEffectProgram<JokeModel, JokeMsg, JokeService>({
    tagKey: '@oak/example-http/JokeProgram',
    init: initial,
    update,
  })
}
