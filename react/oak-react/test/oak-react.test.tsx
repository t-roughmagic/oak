import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, useRef, type Dispatch as ReactDispatch } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeKernel, type Update } from '@oak/core'
import {
  OakProvider,
  createOakHooks,
  useOakDispatch,
  useOakSelector,
} from '../src/index.js'

afterEach(() => {
  cleanup()
})

interface Model {
  readonly count: number
  readonly label: string
}

type Msg =
  | { readonly _tag: 'Inc' }
  | { readonly _tag: 'Set'; readonly value: number }
  | { readonly _tag: 'SetLabel'; readonly label: string }

const update: Update<Model, Msg, never> = (msg) => {
  switch (msg._tag) {
    case 'Inc':
      return { mutation: (m) => ({ ...m, count: m.count + 1 }), effects: [] }
    case 'Set':
      return { mutation: (m) => ({ ...m, count: msg.value }), effects: [] }
    case 'SetLabel':
      return { mutation: (m) => ({ ...m, label: msg.label }), effects: [] }
  }
}

function makeTestDriver(init: Model = { count: 0, label: 'a' }) {
  const kernel = makeKernel<Model, Msg>({ init, update })
  return { driver: { state: kernel.state, dispatch: kernel.dispatch }, kernel }
}

describe('useOakSelector', () => {
  it('throws when used outside an OakProvider', () => {
    const ReadCount = () => createElement('output', null, String(useOakSelector<Model, number>((m) => m.count)))
    const consoleError = console.error
    console.error = () => {}
    try {
      expect(() => render(createElement(ReadCount))).toThrow(/OakProvider/)
    } finally {
      console.error = consoleError
    }
  })

  it('renders the initial selected value on first paint', () => {
    const { driver } = makeTestDriver({ count: 7, label: 'a' })
    const ReadCount = () =>
      createElement('output', null, String(useOakSelector<Model, number>((m) => m.count)))
    const { container } = render(
      createElement(OakProvider, { driver }, createElement(ReadCount)),
    )
    expect(container.textContent).toBe('7')
  })

  it('re-renders when the selected value changes after dispatch', () => {
    const { driver } = makeTestDriver()
    const ReadCount = () =>
      createElement('output', null, String(useOakSelector<Model, number>((m) => m.count)))
    const { container } = render(
      createElement(OakProvider, { driver }, createElement(ReadCount)),
    )
    expect(container.textContent).toBe('0')
    act(() => {
      driver.dispatch({ _tag: 'Inc' })
    })
    expect(container.textContent).toBe('1')
    act(() => {
      driver.dispatch({ _tag: 'Set', value: 99 })
    })
    expect(container.textContent).toBe('99')
  })

  it('does not re-render when the selected value is Object.is-equal to the previous', () => {
    const { driver } = makeTestDriver()
    const renderCount = vi.fn()
    const ReadCount = () => {
      renderCount()
      return createElement('output', null, String(useOakSelector<Model, number>((m) => m.count)))
    }
    render(createElement(OakProvider, { driver }, createElement(ReadCount)))
    expect(renderCount).toHaveBeenCalledTimes(1)
    // Change a field the selector ignores.
    act(() => {
      driver.dispatch({ _tag: 'SetLabel', label: 'b' })
    })
    expect(renderCount).toHaveBeenCalledTimes(1)
    act(() => {
      driver.dispatch({ _tag: 'Inc' })
    })
    expect(renderCount).toHaveBeenCalledTimes(2)
  })

  it('honors a custom eq to short-circuit re-renders', () => {
    const { driver } = makeTestDriver({ count: 10, label: 'a' })
    const renderCount = vi.fn()
    const ReadBucket = () => {
      renderCount()
      const bucket = useOakSelector<Model, number>(
        (m) => m.count,
        (a, b) => Math.floor(a / 10) === Math.floor(b / 10),
      )
      return createElement('output', null, String(bucket))
    }
    const { container } = render(
      createElement(OakProvider, { driver }, createElement(ReadBucket)),
    )
    expect(container.textContent).toBe('10')
    expect(renderCount).toHaveBeenCalledTimes(1)
    // 10 → 19, same decade bucket, no re-render.
    act(() => {
      driver.dispatch({ _tag: 'Set', value: 19 })
    })
    expect(renderCount).toHaveBeenCalledTimes(1)
    expect(container.textContent).toBe('10')
    // 19 → 27, decade changed, re-render.
    act(() => {
      driver.dispatch({ _tag: 'Set', value: 27 })
    })
    expect(renderCount).toHaveBeenCalledTimes(2)
    expect(container.textContent).toBe('27')
  })

  it('picks up a changed selector identity without remounting', () => {
    const { driver } = makeTestDriver({ count: 5, label: 'a' })
    let useLabel = false
    const Pick = () => {
      const value = useOakSelector<Model, string | number>((m) => (useLabel ? m.label : m.count))
      return createElement('output', null, String(value))
    }
    const { container, rerender } = render(
      createElement(OakProvider, { driver }, createElement(Pick)),
    )
    expect(container.textContent).toBe('5')
    useLabel = true
    rerender(createElement(OakProvider, { driver }, createElement(Pick)))
    expect(container.textContent).toBe('a')
  })
})

describe('useOakDispatch', () => {
  it('returns a callback that dispatches through the driver', () => {
    const { driver } = makeTestDriver()
    const Button = () => {
      const dispatch = useOakDispatch<Msg>()
      return createElement('button', { onClick: () => dispatch({ _tag: 'Inc' }) }, 'go')
    }
    const Display = () =>
      createElement(
        'output',
        { 'data-testid': 'count' },
        String(useOakSelector<Model, number>((m) => m.count)),
      )
    render(
      createElement(
        OakProvider,
        { driver },
        createElement(Button),
        createElement(Display),
      ),
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('count').textContent).toBe('1')
  })

  it('returns the same callback identity across re-renders for a stable driver', () => {
    const { driver } = makeTestDriver()
    const seen: Array<ReactDispatch<Msg>> = []
    const Probe = () => {
      const dispatch = useOakDispatch<Msg>()
      const firstRef = useRef(dispatch)
      seen.push(dispatch)
      return createElement('output', null, firstRef.current === dispatch ? 'stable' : 'changed')
    }
    const { container, rerender } = render(
      createElement(OakProvider, { driver }, createElement(Probe)),
    )
    rerender(createElement(OakProvider, { driver }, createElement(Probe)))
    rerender(createElement(OakProvider, { driver }, createElement(Probe)))
    expect(container.textContent).toBe('stable')
    expect(seen[0]).toBe(seen[1])
    expect(seen[1]).toBe(seen[2])
  })
})

describe('createOakHooks', () => {
  it('returns hooks that work without per-call generics', () => {
    const { useSelector, useDispatch } = createOakHooks<Model, Msg>()
    const { driver } = makeTestDriver({ count: 3, label: 'a' })
    const Probe = () => {
      const count = useSelector((m) => m.count)
      const dispatch = useDispatch()
      return createElement(
        'button',
        { onClick: () => dispatch({ _tag: 'Inc' }) },
        String(count),
      )
    }
    render(createElement(OakProvider, { driver }, createElement(Probe)))
    expect(screen.getByRole('button').textContent).toBe('3')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('4')
  })

  it('useDriver returns the same driver instance from context', () => {
    const { useDriver } = createOakHooks<Model, Msg>()
    const { driver } = makeTestDriver()
    let observed: unknown = null
    const Probe = () => {
      observed = useDriver()
      return null
    }
    render(createElement(OakProvider, { driver }, createElement(Probe)))
    expect(observed).toBe(driver)
  })
})
