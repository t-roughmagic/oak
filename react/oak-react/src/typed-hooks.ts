import type { OakViewDriver } from '@oak/core'
import { useOakDriver } from './context.js'
import { useOakDispatch, useOakSelector } from './hooks.js'

export interface TypedOakHooks<M, Msg> {
  /** Synchronous selector hook bound to the program's model type. */
  useSelector: <A>(selector: (model: M) => A, eq?: (prev: A, curr: A) => boolean) => A
  /** Stable dispatch hook bound to the program's message type. */
  useDispatch: () => (msg: Msg) => void
  /** Direct access to the view driver, bound to both types. */
  useDriver: () => OakViewDriver<M, Msg>
}

/**
 * Returns the Oak view hooks pre-typed for a specific `Model` / `Msg` pair.
 *
 * Mirrors Redux Toolkit's typed-hook factory pattern: call this once per
 * program at the module scope, re-export the result, and consume the typed
 * hooks throughout the app without restating generics at every call site.
 *
 * ```ts
 * // hooks.ts
 * export const { useSelector, useDispatch } = createOakHooks<DiceModel, DiceMsg>()
 *
 * // app.tsx
 * const value = useSelector((m) => m.dice.one.value)
 * const dispatch = useDispatch()
 * ```
 *
 * The factory is purely a typing convenience — at runtime it returns the
 * underlying hooks unchanged.
 */
export function createOakHooks<M, Msg>(): TypedOakHooks<M, Msg> {
  return {
    useSelector: useOakSelector as TypedOakHooks<M, Msg>['useSelector'],
    useDispatch: useOakDispatch as TypedOakHooks<M, Msg>['useDispatch'],
    useDriver: useOakDriver as TypedOakHooks<M, Msg>['useDriver'],
  }
}
