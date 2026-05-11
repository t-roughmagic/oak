import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OakRuntimeContext,
  makeOak,
  useDispatch,
  useManagedRuntime,
  useSelector,
  type MsgHandler,
} from '../src/index.js'

afterEach(() => {
  cleanup()
})

describe('oak-v2 React bindings', () => {
  it('reads state synchronously and dispatches without an Effect stream bridge', () => {
    type Model = { readonly count: number }
    type Msg = { readonly _tag: 'Increment' }

    const handle: MsgHandler<Model, Msg, never> = () => ({
      mutation: (model) => ({ count: model.count + 1 }),
    })
    const program = makeOak({ name: 'OakV2ReactCounter', init: { count: 0 }, handle })

    function Counter() {
      const count = useSelector(program.tag, (model) => model.count)
      const dispatch = useDispatch(program.tag)

      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => dispatch({ _tag: 'Increment' }),
        },
        String(count),
      )
    }

    function App() {
      const runtime = useManagedRuntime(program.layer)
      return createElement(OakRuntimeContext.Provider, { value: runtime }, createElement(Counter))
    }

    render(createElement(App))

    expect(screen.getByRole('button').textContent).toBe('0')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('1')
  })

  it('uses selector equality to skip unrelated state changes', () => {
    type Model = { readonly selected: number; readonly other: number }
    type Msg = { readonly _tag: 'BumpOther' }

    const handle: MsgHandler<Model, Msg, never> = () => ({
      mutation: (model) => ({ ...model, other: model.other + 1 }),
    })
    const program = makeOak({
      name: 'OakV2ReactSelectorEquality',
      init: { selected: 1, other: 0 },
      handle,
    })
    let renders = 0

    function Probe() {
      const selected = useSelector(program.tag, (model) => model.selected)
      const dispatch = useDispatch(program.tag)
      renders++

      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => dispatch({ _tag: 'BumpOther' }),
        },
        String(selected),
      )
    }

    function App() {
      const runtime = useManagedRuntime(program.layer)
      return createElement(OakRuntimeContext.Provider, { value: runtime }, createElement(Probe))
    }

    render(createElement(App))

    expect(renders).toBe(1)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('1')
    expect(renders).toBe(1)
  })
})
