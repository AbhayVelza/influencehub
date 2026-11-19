import { attachDocumentSummary, db, defaultSettings } from '@/backend/db'
import { connect, isLegacyLayout } from './pg-store'
import { canonical, fromRows, insertAll, readTables, TABLES, toRows } from './relational'
import schema from './schema.sql?raw'

// Moves a database from the old layout (one jsonb `data` row per record) to the relational tables in schema.sql.
//
//   npm run db:migrate -- --env TEST_DATABASE_URL [--dry-run]
//   npm run db:migrate -- --env TEST_DATABASE_URL --rollback --confirm
//
// --env names the environment variable holding the connection string (no default, so the target is always chosen
// on purpose). DATABASE_URL / SUPABASE_DATABASE_URL also need --i-have-a-backup. Stop the API server first.
//
// In one transaction: the old tables move to a `legacy` schema (kept, untouched), the new tables are created and
// filled, and every record is rebuilt from the new tables and compared with the original. Any difference rolls the
// whole thing back. --dry-run does all of it and then rolls back. --rollback drops the new tables and moves the old
// ones back (anything written since the migration is lost).

const LEGACY_LISTS = {
  team: 'team',
  categories: 'categories',
  influencers: 'influencers',
  documents: 'documents',
  calls: 'calls',
  packages: 'packages',
  activities: 'activities',
  saved_views: 'savedViews',
} as const
const LEGACY_TABLES = [...Object.keys(LEGACY_LISTS), 'settings', 'dismissed_duplicates']
const PROTECTED = ['DATABASE_URL', 'SUPABASE_DATABASE_URL']

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const envName = args.includes('--env') ? args[args.indexOf('--env') + 1] : undefined

class DryRun extends Error {}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

type Data = Record<string, unknown>

/** Drops null fields, so a field an older record lacks compares equal to the NULL the new table stores. */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, withoutNulls(v)]))
  }
  return value
}

/** A record as compared: plain JSON, without the derived fields the store never keeps. */
function comparable(item: unknown): string {
  const data = JSON.parse(JSON.stringify(item)) as Data
  delete data.documents
  delete data.ever_onboarded
  return canonical(withoutNulls(data))
}

function snapshot() {
  const out: Record<string, Map<string, string>> = {}
  for (const key of Object.values(LEGACY_LISTS)) {
    out[key] = new Map((db[key] as unknown as { id: string }[]).map((item) => [item.id, comparable(item)]))
  }
  out.settings = new Map([
    ['pool', canonical(db.poolSettings)],
    ['instagram', canonical(db.instagramSettings)],
    ['migrations', canonical(db.migrations)],
  ])
  return out
}

async function main() {
  if (!envName) fail('Name the database: npm run db:migrate -- --env TEST_DATABASE_URL [--dry-run]')
  const url = process.env[envName]?.trim()
  if (!url) fail(`${envName} is not set.`)
  if (PROTECTED.includes(envName) && !flag('--i-have-a-backup')) {
    fail(`${envName} is a working database. Back it up with pg_dump first, then add --i-have-a-backup.`)
  }
  console.log(`Target: ${url.replace(/\/\/([^:@/]+)(:[^@]*)?@/, '//$1:***@')}`)
  const sql = connect(url, 1)
  try {
    if (flag('--rollback')) await rollback(sql)
    else await migrate(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function migrate(sql: ReturnType<typeof connect>) {
  if (!(await isLegacyLayout(sql))) fail('Nothing to migrate: the database is not on the old layout (already migrated, or empty).')
  try {
    await sql.begin(async (tx) => {
      // 1. Keep the old tables, untouched, in their own schema.
      await tx.unsafe('CREATE SCHEMA legacy')
      for (const t of LEGACY_TABLES) await tx.unsafe(`ALTER TABLE public.${t} SET SCHEMA legacy`)
      await tx.unsafe('ALTER TABLE files ADD COLUMN IF NOT EXISTS size integer')
      await tx.unsafe('UPDATE files SET size = octet_length(data) WHERE size IS NULL')
      await tx.unsafe('ALTER TABLE files ALTER COLUMN size SET NOT NULL')
      await tx.unsafe(schema)

      // 2. Load the old records exactly as the old store did.
      for (const [table, key] of Object.entries(LEGACY_LISTS)) {
        const rows = await tx.unsafe<{ id: string; data: Data }[]>(`SELECT id, data FROM legacy.${table} ORDER BY seq`)
        ;(db[key] as unknown as Data[]) = rows.map((r) => ({ ...r.data, id: r.id }))
      }
      for (const inf of db.influencers) attachDocumentSummary(inf)
      const settings = new Map(
        (await tx.unsafe<{ id: string; data: Data }[]>('SELECT id, data FROM legacy.settings')).map((r) => [r.id, r.data]),
      )
      const defaults = defaultSettings()
      db.poolSettings = { ...defaults.poolSettings, ...(settings.get('pool') ?? {}) }
      db.instagramSettings = { ...defaults.instagramSettings, ...(settings.get('instagram') ?? {}) }
      db.migrations = { ...defaults.migrations, ...(settings.get('migrations') ?? {}) }
      const dismissed = (await tx.unsafe<{ id: string }[]>('SELECT id FROM legacy.dismissed_duplicates')).map((r) => r.id)
      db.dismissedDuplicates = new Set(dismissed)
      const before = snapshot()

      // 3. Fill the new tables.
      const rows = toRows()
      for (const t of TABLES) {
        const list = [...rows.get(t.name)!.values()]
        if (list.length) await insertAll(tx, t.name, list)
      }

      // 4. Rebuild every record from the new tables and compare.
      fromRows(await readTables(tx))
      const after = snapshot()
      const problems: string[] = []
      for (const [collection, records] of Object.entries(before)) {
        for (const [id, json] of records) {
          const got = after[collection]!.get(id)
          if (got === undefined) problems.push(`${collection} ${id}: missing after migration`)
          else if (got !== json) problems.push(`${collection} ${id}: differs\n    before ${json}\n    after  ${got}`)
        }
        for (const id of after[collection]!.keys()) if (!records.has(id)) problems.push(`${collection} ${id}: new after migration`)
      }
      const keptPairs = db.dismissedDuplicates
      const droppedPairs = dismissed.filter((id) => !keptPairs.has(id))

      console.log('\nOld rows:')
      for (const t of LEGACY_TABLES) {
        const [{ n }] = await tx.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM legacy.${t}`)
        console.log(`  ${t.padEnd(22)} ${n}`)
      }
      console.log('New rows:')
      for (const t of [...TABLES.map((x) => x.name), 'account_snapshots', 'files']) {
        const [{ n }] = await tx.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${t}`)
        console.log(`  ${t.padEnd(22)} ${n}`)
      }
      if (droppedPairs.length) {
        console.log(`\nDismissed pairs not carried over (an influencer in them no longer exists): ${droppedPairs.length}`)
      }
      if (problems.length) {
        console.error(`\n${problems.length} record(s) don't match:`)
        for (const p of problems.slice(0, 20)) console.error(`  ${p}`)
        throw new Error('Records differ after migration; nothing was changed.')
      }
      console.log('\nEvery record matches the original.')
      if (flag('--dry-run')) throw new DryRun()
    })
    console.log('Migrated. The old tables are kept in the `legacy` schema.')
  } catch (err) {
    if (err instanceof DryRun) {
      console.log('Dry run: rolled back, nothing was changed.')
      return
    }
    throw err
  }
}

async function rollback(sql: ReturnType<typeof connect>) {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from information_schema.tables where table_schema = 'legacy'`
  if (!n) fail('Nothing to roll back: there is no `legacy` schema.')
  if (!flag('--confirm')) fail('Rolling back drops the new tables and anything written to them since the migration. Add --confirm.')
  await sql.begin(async (tx) => {
    for (const t of [...TABLES.map((x) => x.name), 'account_snapshots'].reverse()) await tx.unsafe(`DROP TABLE IF EXISTS public.${t} CASCADE`)
    for (const t of LEGACY_TABLES) await tx.unsafe(`ALTER TABLE legacy.${t} SET SCHEMA public`)
    await tx.unsafe('DROP SCHEMA legacy')
    await tx.unsafe('ALTER TABLE files DROP COLUMN IF EXISTS size')
  })
  console.log('Rolled back: the old tables are back in place.')
}

await main()
