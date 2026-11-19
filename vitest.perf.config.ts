import path from 'node:path'
import { defineConfig } from 'vitest/config'

// NFR-01 check at 100,000 influencers (tests/nfr01.perf.test.ts): `npm run test:perf`. Not part of `npm test`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: { environment: 'node', include: ['tests/**/*.perf.test.ts'], testTimeout: 60_000 },
})
