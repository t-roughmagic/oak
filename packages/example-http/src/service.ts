import { Context, Data, Effect, Layer } from 'effect'

export class JokeFetchError extends Data.TaggedError('JokeFetchError')<{
  readonly message: string
}> {}

export interface JokeService {
  readonly fetchJoke: Effect.Effect<string, JokeFetchError>
}

export const JokeService = Context.GenericTag<JokeService>('@oak/example-http/JokeService')

const fetchDadJoke: Effect.Effect<string, JokeFetchError> = Effect.tryPromise({
  try: async () => {
    const res = await fetch('https://icanhazdadjoke.com/', {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = (await res.json()) as { joke?: unknown }
    if (typeof data.joke !== 'string') {
      throw new Error('response missing joke field')
    }
    return data.joke
  },
  catch: (cause) =>
    new JokeFetchError({
      message: cause instanceof Error ? cause.message : String(cause),
    }),
})

export const JokeServiceLive: Layer.Layer<JokeService> = Layer.succeed(
  JokeService,
  JokeService.of({ fetchJoke: fetchDadJoke }),
)

export const JokeServiceFake = (joke: string): Layer.Layer<JokeService> =>
  Layer.succeed(JokeService, JokeService.of({ fetchJoke: Effect.succeed(joke) }))
