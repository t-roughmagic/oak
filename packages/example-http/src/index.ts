import { makeOak } from '@oak/oak'
import { init } from './model.js'
import { update } from './update.js'

export type { JokeModel } from './model.js'
export { JokeMsg } from './message.js'
export { JokeService, JokeServiceLive, JokeServiceFake, JokeFetchError } from './service.js'

export function makeJokeProgram(initial = init) {
  return makeOak({
    name: 'JokeHttp',
    init: initial,
    update,
  })
}
