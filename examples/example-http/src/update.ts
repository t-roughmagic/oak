import { Effect } from 'effect'
import type { Update } from '@oak/core'
import type { EffectCommand } from '@oak/platform-effect'
import type { JokeModel } from './model.js'
import { JokeMsg } from './message.js'
import { JokeService } from './service.js'

type JokeCmd = EffectCommand<JokeModel, JokeMsg, JokeService>

const fetchCmd: JokeCmd = () =>
  Effect.gen(function* () {
    const service = yield* JokeService
    return yield* service.fetchJoke.pipe(
      Effect.match({
        onSuccess: (joke) => JokeMsg.Got({ joke }),
        onFailure: (error) => JokeMsg.Failed({ error: error.message }),
      }),
    )
  })

export const update: Update<JokeModel, JokeMsg, JokeCmd> = (msg) =>
  JokeMsg.$match(msg, {
    Fetch: () => ({
      mutation: (model: JokeModel) => ({ ...model, pending: true, error: null }),
      effects: [fetchCmd],
    }),
    Got: ({ joke }) => ({
      mutation: () => ({ pending: false, joke, error: null }),
      effects: [],
    }),
    Failed: ({ error }) => ({
      mutation: (model: JokeModel) => ({ ...model, pending: false, error }),
      effects: [],
    }),
  })
