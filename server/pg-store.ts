import postgres from 'postgres'
import { attachDocumentSummary, db, defaultSettings, newWorkspace } from '@/backend/db'
import schema from './schema.sql?raw'

// Keeps `db` (the server's working copy of the workspace) in step with PostgreSQL:
// - Start-up: creates the tables if they're missing and loads every record, in the order it was created.
// - After each request: `flush` compares every record with what PostgreSQL last had and writes only the ones that
//   changed (or were added / removed), in one transaction, so a request is saved completely or not at all.
// This server is the only writer, and it answers one request at a time (server/main.ts), so the rules the handlers
// check (unique handles, claims, one current agreement) hold for everyone.

const LISTS = {
  team: 'team',
  categories: 'categories',
  influencers: 'influencers',
  documents: 'documents',
  calls: 'calls',
  packages: 'packages',
  activities: 'activities',
  savedViews: 'saved_views',
} as const
type ListKey = keyof typeof LISTS
type Item = { id: string } & Record<string, unknown>
type Data = Record<string, unknown>

/** Workspace settings, one row each in the `settings` table. */
const SETTINGS = { poolSettings: 'pool', instagramSettings: 'instagram', migrations: 'migrations' } as const
const DISMISSED = 'dismissed_duplicates'

let sql: postgres.Sql | null = null
let ready: Promise<void> | null = null

function client(): postgres.Sql {
  if (sql) return sql
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not set. Put your PostgreSQL connection string in .env.local.')
  sql = postgres(url, { max: 4, onnotice: () => undefined })
  return sql
}

/** PostgreSQL's state as last seen: table → id → canonical JSON (without the id). */
const saved = new Map<string, Map<string, string>>()
const known = (table: string) => {
  let map = saved.get(table)
  if (!map) saved.set(table, (map = new Map()))
  return map
}

/** JSON with sorted keys, so the same data always compares equal whatever order the fields come back in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Data).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

/** What's stored for a record: plain JSON, no id (it's the row id), no derived fields. */
function stored(key: ListKey, item: object): Data {
  const data = JSON.parse(JSON.stringify(item)) as Data
  delete data.id
  // An influencer's documents summary is derived from the documents on every response.
  if (key === 'influencers') delete data.documents
  return data
}

function fromRow(id: string, data: Data): Item {
  return { ...data, id } as Item
}

/** Puts the working copy back to PostgreSQL's last known state (start-up, and after a request that failed). */
export function revert() {
  for (const key of Object.keys(LISTS) as ListKey[]) {
    ;(db[key] as unknown as Item[]) = [...known(LISTS[key]).entries()].map(([id, json]) => fromRow(id, JSON.parse(json) as Data))
  }
  // Attach document summaries only after all collections (including documents) are restored.
  for (const inf of db.influencers) {
    attachDocumentSummary(inf)
  }
  for (const [prop, id] of Object.entries(SETTINGS) as [keyof typeof SETTINGS, string][]) {
    const json = known('settings').get(id)
    Object.assign(db, { [prop]: { ...defaultSettings()[prop], ...(json ? (JSON.parse(json) as object) : {}) } })
  }
  db.dismissedDuplicates = new Set(known(DISMISSED).keys())
}

async function load() {
  const pg = client()
  await pg.unsafe(schema)
  saved.clear()
  for (const table of [...Object.values(LISTS), 'settings', DISMISSED]) {
    const rows = await pg<{ id: string; data: Data }[]>`select id, data from ${pg(table)} order by seq`
    const map = known(table)
    for (const row of rows) map.set(row.id, canonical(row.data))
  }
  revert()
  // A new workspace starts with the owner admin and the default categories; the first flush saves them.
  if (!db.team.length) Object.assign(db, newWorkspace())
  await flush()
}

/** Connects and loads the workspace once. Throws if PostgreSQL can't be reached. */
export function start(): Promise<void> {
  ready ??= load().catch((err: unknown) => {
    ready = null
    throw err
  })
  return ready
}

interface Op {
  table: string
  id: string
  data: Data | null
  json: string | null
}

function pendingOps(): Op[] {
  const ops: Op[] = []
  for (const key of Object.keys(LISTS) as ListKey[]) {
    const table = LISTS[key]
    const seen = known(table)
    const ids = new Set<string>()
    for (const item of db[key] as unknown as Item[]) {
      ids.add(item.id)
      const data = stored(key, item)
      const json = canonical(data)
      if (seen.get(item.id) !== json) ops.push({ table, id: item.id, data, json })
    }
    for (const id of seen.keys()) if (!ids.has(id)) ops.push({ table, id, data: null, json: null })
  }
  for (const [prop, id] of Object.entries(SETTINGS) as [keyof typeof SETTINGS, string][]) {
    const data = JSON.parse(JSON.stringify(db[prop])) as Data
    const json = canonical(data)
    const before = known('settings').get(id) ?? canonical(JSON.parse(JSON.stringify(defaultSettings()[prop])))
    if (before !== json) ops.push({ table: 'settings', id, data, json })
  }
  const dismissed = known(DISMISSED)
  for (const id of db.dismissedDuplicates) {
    if (!dismissed.has(id)) ops.push({ table: DISMISSED, id, data: { dismissed: true }, json: canonical({ dismissed: true }) })
  }
  for (const id of dismissed.keys()) {
    if (!db.dismissedDuplicates.has(id)) ops.push({ table: DISMISSED, id, data: null, json: null })
  }
  return ops
}

/** Writes everything that changed since PostgreSQL's last known state, all or nothing. */
export async function flush(): Promise<void> {
  const ops = pendingOps()
  if (!ops.length) return
  await client().begin(async (tx) => {
    for (const op of ops) {
      if (op.data === null) await tx`delete from ${tx(op.table)} where id = ${op.id}`
      else {
        await tx`
          insert into ${tx(op.table)} (id, data) values (${op.id}, ${tx.json(op.data as postgres.JSONValue)})
          on conflict (id) do update set data = excluded.data, updated_at = now()`
      }
    }
  })
  for (const op of ops) {
    if (op.json === null) known(op.table).delete(op.id)
    else known(op.table).set(op.id, op.json)
  }
}

/** True when PostgreSQL answers (health check). */
export async function ping(): Promise<boolean> {
  try {
    await client()`select 1`
    return true
  } catch {
    return false
  }
}

export async function stop() {
  await sql?.end({ timeout: 5 })
  sql = null
  ready = null
}

/** Document files (the `files` table; never loaded into the working copy). */
export async function saveFile(key: string, contentType: string, data: Uint8Array) {
  await client()`insert into files (key, content_type, data) values (${key}, ${contentType}, ${data})`
}

export async function readFile(key: string): Promise<{ content_type: string; data: Uint8Array } | undefined> {
  const [row] = await client()<{ content_type: string; data: Uint8Array }[]>`select content_type, data from files where key = ${key}`
  return row
}
