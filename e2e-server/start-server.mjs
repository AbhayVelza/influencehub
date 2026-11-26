// Starts the built API server (dist-server/main.js) on a fresh throwaway schema, ih_e2e, of the LOCAL PostgreSQL in
// DATABASE_URL (.env.local). Refuses any other host: never point this at a shared or production database.
import postgres from 'postgres'

const SCHEMA = 'ih_e2e'
const base = process.env.DATABASE_URL?.trim()
if (!base) throw new Error('DATABASE_URL is not set (.env.local): the server e2e tests need a local PostgreSQL')
const url = new URL(base)
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`e2e server: ${url.hostname} is not a local database`)

const sql = postgres(base, { max: 1, onnotice: () => undefined })
await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`)
await sql.end()

url.searchParams.set('search_path', `${SCHEMA},public`)
process.env.DATABASE_URL = url.toString()
await import('../dist-server/main.js')
