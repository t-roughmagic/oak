import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['oak/*', 'react/*', 'examples/*'],
  },
})
