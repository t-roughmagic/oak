import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useOakSelector } from '../src/index.js'

afterEach(() => {
  cleanup()
})

function ReadCount() {
  const count = useOakSelector<{ readonly count: number }, number>((m) => m.count)
  return createElement('output', null, String(count))
}

describe('oak-react', () => {
  it('throws when used outside an OakProvider', () => {
    const consoleError = console.error
    console.error = () => {}
    try {
      expect(() => render(createElement(ReadCount))).toThrow(/OakProvider/)
    } finally {
      console.error = consoleError
    }
  })
})
