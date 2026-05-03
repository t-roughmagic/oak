import { makeOak, type Update } from '../../../oak/dist/index.js'

export interface CounterModel {
  readonly count: number
}

export type CounterMsg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' }

export const CounterMsg = {
  Increment: (): CounterMsg => ({ _tag: 'Increment' }),
  Decrement: (): CounterMsg => ({ _tag: 'Decrement' }),
}

/**
 * Factory for a request-seeded client program. Each provider mount gets its own
 * program instance, so route-specific initial state never lives in a module
 * singleton or a server-side Oak runtime.
 */
export function makeCounterProgram(initial: CounterModel) {
  const update: Update<CounterModel, CounterMsg, never> = (msg) => {
    switch (msg._tag) {
      case 'Increment':
        return [(model: CounterModel) => ({ count: model.count + 1 }), []] as const
      case 'Decrement':
        return [(model: CounterModel) => ({ count: model.count - 1 }), []] as const
    }
  }

  return makeOak({
    name: 'NextCounter',
    init: initial,
    update,
  })
}
