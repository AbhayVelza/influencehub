// Runs Vitest (npm test, npm run test:perf). On Windows a lower-case drive letter in the working directory (c:\…, as
// Git Bash and some terminals give it) makes Vitest load itself twice and every test fails with "reading 'config'",
// so it runs from the same folder spelled C:\….
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const upper = (p) => p.replace(/^[a-z]:/, (d) => d.toUpperCase())
const cwd = upper(process.cwd())
const bin = upper(fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)))
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' })
process.exit(result.status ?? 1)
