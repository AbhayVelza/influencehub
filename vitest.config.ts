import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Business-rule tests (tests/): the handlers in src/backend run in Node over an in-memory working copy, as on the
// API server, without PostgreSQL. `npm test`; the 100k performance check is `npm run test:perf`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.perf.test.ts'],
  },
})
