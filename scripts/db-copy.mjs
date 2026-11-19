// Copies every InfluenceHub table from one PostgreSQL to another (default: local → Supabase).
//   npm run db:copy                    local (DATABASE_URL) → Supabase (SUPABASE_DATABASE_URL)
//   npm run db:copy -- --from supabase pull Supabase → local
//   add --replace to overwrite a target that already has data (it prints the row counts first).
// Both databases must be on the relational layout (server/schema.sql); migrate an old one first (npm run db:migrate).
// Stop the API server before copying: it keeps a working copy in memory and would overwrite the change.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const args = process.argv.slice(2)
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : 'local'
const replace = args.includes('--replace')
const env = (name) => {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set in .env.local`)
  return v
}
const connect = (url) =>
  postgres(url, {
    max: 1,
    onnotice: () => undefined,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /sslmode=disable/.test(url) ? false : 'require',
    prepare: !/:6543\//.test(url),
  })
const [srcUrl, dstUrl] =
  from === 'supabase' ? [env('SUPABASE_DATABASE_URL'), env('DATABASE_URL')] : [env('DATABASE_URL'), env('SUPABASE_DATABASE_URL')]
const src = connect(srcUrl)
const dst = connect(dstUrl)
// Parents before children (server/relational.ts TABLES, plus account_snapshots and files).
const TABLES = [
  'team_members', 'categories', 'influencers', 'social_accounts', 'account_snapshots', 'calls', 'packages', 'package_items',
  'files', 'documents', 'activities', 'saved_views', 'dismissed_duplicates', 'pool_settings', 'instagram_settings',
  'sync_runs', 'schema_migrations',
]
const label = from === 'supabase' ? 'Supabase → local' : 'local → Supabase'

const legacy = async (db) =>
  (await db`select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'influencers' and column_name = 'data'`).length > 0
const hasSeq = async (db, t) =>
  (await db`select 1 from information_schema.columns where table_schema = current_schema() and table_name = ${t} and column_name = 'seq'`).length > 0

try {
  for (const [db, name] of [[src, 'source'], [dst, 'target']]) {
    if (await legacy(db)) throw new Error(`The ${name} database is on the old layout. Migrate it first: npm run db:migrate (docs/server.md).`)
  }
  await dst.unsafe(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'))
  const counts = {}
  for (const t of TABLES) counts[t] = Number((await dst.unsafe(`SELECT count(*) AS n FROM ${t}`))[0].n)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total > 0 && !replace) {
    console.error(`Target already has data (${label}); nothing copied. Row counts:`, counts)
    console.error('Re-run with --replace to overwrite it.')
    process.exit(1)
  }
  if (total > 0) console.log('Replacing target rows:', counts)

  // Rows travel as JSON and PostgreSQL turns them back into each column's type (jsonb, arrays, bytea, dates), so the
  // copy is exact. `seq` values are kept, so lists stay in the order the records were created in.
  const rows = {}
  const seq = {}
  for (const t of TABLES) {
    seq[t] = await hasSeq(src, t)
    const [{ j }] = await src.unsafe(`SELECT coalesce(json_agg(x${seq[t] ? ' ORDER BY seq' : ''}), '[]'::json) AS j FROM ${t} x`)
    rows[t] = j
  }

  await dst.begin(async (tx) => {
    for (const t of [...TABLES].reverse()) await tx.unsafe(`DELETE FROM ${t}`)
    for (const t of TABLES) {
      const list = rows[t]
      // Files can be large: 20 per INSERT; everything else 500 (one round trip per batch, not per row).
      const size = t === 'files' ? 20 : 500
      const overriding = seq[t] ? 'OVERRIDING SYSTEM VALUE ' : ''
      for (let i = 0; i < list.length; i += size) {
        const batch = JSON.stringify(list.slice(i, i + size))
        await tx.unsafe(`INSERT INTO ${t} ${overriding}SELECT * FROM json_populate_recordset(null::${t}, $1::text::json)`, [batch])
      }
      if (seq[t]) await tx.unsafe(`SELECT setval(pg_get_serial_sequence('${t}', 'seq'), GREATEST((SELECT max(seq) FROM ${t}), 1))`)
    }
  })
  console.log(`Copied ${label}:`, Object.fromEntries(TABLES.map((t) => [t, rows[t].length])))
} finally {
  await src.end()
  await dst.end()
}
