import { Effect } from 'effect'
import type { Cmd, Update } from '@oak/oak'
import type { JokeModel } from './model.js'
import { JokeMsg } from './message.js'
import { JokeService } from './service.js'

const fetchCmd: Cmd<JokeModel, JokeMsg, JokeService> = () =>
  Effect.gen(function* () {
    const service = yield* JokeService
    return yield* service.fetchJoke.pipe(
      Effect.match({
        onSuccess: (joke) => JokeMsg.Got({ joke }),
        onFailure: (error) => JokeMsg.Failed({ error: error.message }),
      }),
    )
  })

export const update: Update<JokeModel, JokeMsg, JokeService> = JokeMsg.$match({
  Fetch: () =>
    [(model: JokeModel) => ({ ...model, pending: true, error: null }), [fetchCmd]] as const,
  Got: ({ joke }) => [() => ({ pending: false, joke, error: null }), []] as const,
  Failed: ({ error }) =>
    [(model: JokeModel) => ({ ...model, pending: false, error }), []] as const,
})
