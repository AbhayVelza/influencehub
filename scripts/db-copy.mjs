// Copies every InfluenceHub table from one PostgreSQL to another (default: local → Supabase).
//   npm run db:copy                    local (DATABASE_URL) → Supabase (SUPABASE_DATABASE_URL)
//   npm run db:copy -- --from supabase pull Supabase → local
//   add --replace to overwrite a target that already has data (it prints the row counts first).
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
const TABLES = ['team', 'categories', 'influencers', 'documents', 'calls', 'packages', 'activities', 'saved_views', 'settings', 'dismissed_duplicates']
const label = from === 'supabase' ? 'Supabase → local' : 'local → Supabase'

try {
  await dst.unsafe(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'))
  const counts = {}
  for (const t of [...TABLES, 'files']) counts[t] = Number((await dst.unsafe(`SELECT count(*) AS n FROM ${t}`))[0].n)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total > 0 && !replace) {
    console.error(`Target already has data (${label}); nothing copied. Row counts:`, counts)
    console.error('Re-run with --replace to overwrite it.')
    process.exit(1)
  }
  if (total > 0) console.log('Replacing target rows:', counts)

  const rows = {}
  for (const t of TABLES) rows[t] = await src.unsafe(`SELECT id, seq, data, updated_at FROM ${t} ORDER BY seq`)
  const files = await src`SELECT key, content_type, data, created_at FROM files`

  await dst.begin(async (tx) => {
    for (const t of TABLES) {
      await tx.unsafe(`DELETE FROM ${t}`)
      // 500 rows per INSERT: one network round trip per batch, not per row.
      for (let i = 0; i < rows[t].length; i += 500) {
        const batch = rows[t].slice(i, i + 500)
        const values = batch.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}::jsonb, $${j * 4 + 4})`).join(', ')
        const params = batch.flatMap((r) => [r.id, r.seq, JSON.stringify(r.data), r.updated_at])
        await tx.unsafe(`INSERT INTO ${t} (id, seq, data, updated_at) OVERRIDING SYSTEM VALUE VALUES ${values}`, params)
      }
      await tx.unsafe(`SELECT setval(pg_get_serial_sequence('${t}', 'seq'), GREATEST((SELECT max(seq) FROM ${t}), 1))`)
    }
    await tx`DELETE FROM files`
    for (let i = 0; i < files.length; i += 20) await tx`INSERT INTO files ${tx(files.slice(i, i + 20))}`
  })
  console.log(`Copied ${label}:`, Object.fromEntries([...TABLES.map((t) => [t, rows[t].length]), ['files', files.length]]))
} finally {
  await src.end()
  await dst.end()
}
