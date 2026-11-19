// Backups of the InfluenceHub database (NFR-11). Data and document files are both in PostgreSQL, so one pg_dump holds
// everything. Needs pg_dump, pg_restore and psql 17+ (PostgreSQL client tools) on PATH or in C:\Program Files\PostgreSQL.
//
//   npm run db:backup -- backup  --env SUPABASE_DATABASE_URL [--out <folder>]
//       pg_dump (custom format) of the app's schemas + a .counts.json with every table's row count.
//   npm run db:backup -- verify  --env RESTORE_TEST_DATABASE_URL --file <x.dump>
//       Restore test: restores into an EMPTY scratch database and checks every table's count against the .counts.json.
//   npm run db:backup -- restore --env DATABASE_URL --file <x.dump> --replace-data
//       Puts a backup back: drops and recreates the app's tables in that database. Back the target up first.
//
// Connection strings are read from the named environment variable (.env.local) and never printed.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { devNull, homedir, tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'

const SCHEMAS = ['public', 'legacy']
const WORKING = ['DATABASE_URL', 'SUPABASE_DATABASE_URL']

const args = process.argv.slice(2)
const command = args[0]
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

function url(envName) {
  if (!envName) fail('Name the database: --env <VARIABLE>')
  const value = process.env[envName]?.trim()
  if (!value) fail(`${envName} is not set (.env.local).`)
  return value
}

/** pg_dump / pg_restore / psql: on PATH, or the newest one under C:\Program Files\PostgreSQL. */
function tool(name) {
  const root = 'C:\\Program Files\\PostgreSQL'
  if (process.platform === 'win32' && existsSync(root)) {
    const versions = readdirSync(root).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a))
    for (const v of versions) {
      const exe = path.join(root, v, 'bin', `${name}.exe`)
      if (existsSync(exe)) return exe
    }
  }
  return name
}

/** Runs pg_dump / pg_restore with the connection in PG* variables, so it never shows in a command line or an error. */
function run(name, toolArgs, connection) {
  const u = new URL(connection)
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || 'postgres',
    PGSSLMODE: u.searchParams.get('sslmode') ?? (/^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? 'disable' : 'require'),
  }
  try {
    execFileSync(tool(name), toolArgs, { stdio: ['ignore', 'inherit', 'inherit'], env })
  } catch {
    fail(`${name} failed (its message is above).`)
  }
}

function connect(connection) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connection)
  return postgres(connection, { max: 1, onnotice: () => undefined, ssl: local || /sslmode=disable/.test(connection) ? false : 'require', prepare: false })
}

/** Exact row count of every table in the app's schemas. */
async function counts(connection) {
  const sql = connect(connection)
  try {
    const tables = await sql`
      select table_schema as schema, table_name as name from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema in ${sql(SCHEMAS)} order by 1, 2`
    const out = {}
    for (const t of tables) {
      const [row] = await sql.unsafe(`select count(*)::bigint as n from "${t.schema}"."${t.name}"`)
      out[`${t.schema}.${t.name}`] = Number(row.n)
    }
    return out
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function backup() {
  const envName = option('--env')
  const connection = url(envName)
  const out = option('--out') ?? path.join(homedir(), 'influencehub-backups')
  mkdirSync(out, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(out, `influencehub-${envName.replace(/_DATABASE_URL$|_URL$/, '').toLowerCase()}-${stamp}.dump`)
  const before = await counts(connection)
  // The schemas that exist (legacy goes once the old tables are dropped).
  const present = SCHEMAS.filter((s) => Object.keys(before).some((k) => k.startsWith(`${s}.`)))
  run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', ...present.map((s) => `--schema=${s}`), `--file=${file}`], connection)
  writeFileSync(file.replace(/\.dump$/, '.counts.json'), `${JSON.stringify(before, null, 2)}\n`)
  const rows = Object.values(before).reduce((a, b) => a + b, 0)
  console.log(`Backed up ${Object.keys(before).length} tables (${rows} rows) to ${file}`)
}

async function restoreInto(connection, file, { requireEmpty }) {
  if (!file || !existsSync(file)) fail(`Backup file not found: ${file ?? '(give --file)'}`)
  const existing = await counts(connection)
  if (requireEmpty && Object.keys(existing).length) {
    fail('The restore test needs an empty scratch database (it has tables already). Use a new one.')
  }
  const sql = connect(connection)
  try {
    // The dump creates its schemas itself: drop them first (an empty database still has an empty "public").
    for (const schema of SCHEMAS) await sql.unsafe(`drop schema if exists "${schema}" cascade`)
  } finally {
    await sql.end({ timeout: 5 })
  }
  // pg_restore writes the backup out as SQL; Supabase-only column settings (pg_attver), which plain PostgreSQL
  // refuses, are dropped; psql runs the rest in one transaction, stopping at the first error.
  const script = path.join(mkdtempSync(path.join(tmpdir(), 'influencehub-restore-')), 'restore.sql')
  run('pg_restore', ['--no-owner', '--no-privileges', `--file=${script}`, file], connection)
  let text = readFileSync(script, 'utf8')
    .split('\n')
    .filter((l) => !/ SET \(pg_attver=\d+\);$/.test(l))
    .join('\n')
  // The search indexes need pg_trgm (an extension, not in the dump) in the schema their operator class names.
  const trgm = /([a-z_]+)\.gin_trgm_ops/.exec(text)?.[1]
  if (trgm === 'public') {
    text = text.replace('CREATE SCHEMA public;', 'CREATE SCHEMA public;\nCREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;')
  } else if (trgm) {
    text = `CREATE SCHEMA IF NOT EXISTS ${trgm};\nCREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA ${trgm};\n${text}`
  }
  writeFileSync(script, text)
  run('psql', ['--quiet', '--no-psqlrc', `--output=${devNull}`, '--set=ON_ERROR_STOP=1', '--single-transaction', `--file=${script}`], connection)
  rmSync(path.dirname(script), { recursive: true, force: true })
}

async function verify() {
  const file = option('--file')
  const connection = url(option('--env'))
  if (WORKING.includes(option('--env'))) fail('Restore tests go into a scratch database, never a working one.')
  await restoreInto(connection, file, { requireEmpty: true })
  const expected = JSON.parse(readFileSync(file.replace(/\.dump$/, '.counts.json'), 'utf8'))
  const actual = await counts(connection)
  const wrong = Object.keys(expected).filter((t) => actual[t] !== expected[t])
  if (wrong.length) fail(`Restore test FAILED: ${wrong.map((t) => `${t} ${actual[t] ?? 'missing'} ≠ ${expected[t]}`).join(', ')}`)
  console.log(`Restore test passed: ${Object.keys(expected).length} tables, every row count matches.`)
}

async function restore() {
  if (!args.includes('--replace-data')) fail('This replaces the data in that database. Back it up first, then add --replace-data.')
  await restoreInto(url(option('--env')), option('--file'), { requireEmpty: false })
  console.log('Restored. Restart the API server so it loads the restored data.')
}

const commands = { backup, verify, restore }
if (!commands[command]) fail('Usage: npm run db:backup -- backup|verify|restore --env <VARIABLE> [--file <x.dump>] [--out <folder>]')
await commands[command]()
