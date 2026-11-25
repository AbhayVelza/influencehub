import postgres from 'postgres'
import { db, newWorkspace } from '@/backend/db'
import { SNAPSHOT_DAYS, type PlatformDataStore } from '@/backend/platform-data'
import type { MediaItem } from '@/types'
import { fromRows, readTables, remove, TABLES, sameRow, toRows, upsert, type Row, type Rows } from './relational'
import schema from './schema.sql?raw'

// Keeps `db` (the server's working copy of the workspace) in step with PostgreSQL's relational tables
// (server/schema.sql; mapping in server/relational.ts):
// - Start-up: creates the tables if they're missing and loads every row.
// - After each request: `flush` turns the working copy into rows, compares them with what PostgreSQL last had and
//   writes only the rows that changed (or were added / removed), in one transaction, so a request is saved
//   completely or not at all.
// This server is the only writer, and it answers one request at a time (server/main.ts), so the rules the handlers
// check (unique handles, claims, one current agreement) hold for everyone; the constraints back them up.

let sql: postgres.Sql | null = null

/** `--supabase` (or DB_TARGET=supabase) uses SUPABASE_DATABASE_URL, the shared test database; otherwise DATABASE_URL. */
function databaseUrl(): string {
  const supabase = process.argv.includes('--supabase') || process.env.DB_TARGET?.trim() === 'supabase'
  const name = supabase ? 'SUPABASE_DATABASE_URL' : 'DATABASE_URL'
  const url = process.env[name]?.trim()
  if (!url) throw new Error(`${name} is not set. Put your PostgreSQL connection string in .env.local.`)
  return url
}
let ready: Promise<void> | null = null

/** Connection options shared with the migration script. */
export function connect(url: string, max = 4): postgres.Sql {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
  return postgres(url, {
    max,
    onnotice: () => undefined,
    // Older records lack fields added later (e.g. a member's location): store those as NULL.
    transform: { undefined: null },
    // Hosted PostgreSQL (Supabase) needs TLS; a transaction pooler (port 6543) can't keep prepared statements.
    ssl: local || /sslmode=disable/.test(url) ? false : 'require',
    prepare: !/:6543\//.test(url),
  })
}

function client(): postgres.Sql {
  sql ??= connect(databaseUrl())
  return sql
}

/** True when the database still has the old layout (one jsonb `data` column per table). */
export async function isLegacyLayout(pg: postgres.Sql | postgres.TransactionSql): Promise<boolean> {
  const [row] = await pg<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
    where table_schema = current_schema() and table_name = 'influencers' and column_name = 'data'`
  return (row?.n ?? 0) > 0
}

/** PostgreSQL's rows as last seen: table → key → row. Detached: they never share an array or object with `db`. */
let saved: Rows = new Map()

/**
 * A copy of a row whose arrays and jsonb values are its own. toRows' rows share them with the working copy (an
 * influencer's tags, an account's metrics), so a handler changing one in place would change the saved row too, and
 * the change would never be written.
 */
function detach(row: Row): Row {
  const out: Row = {}
  for (const k in row) {
    const v = row[k]
    out[k] = v !== null && typeof v === 'object' ? structuredClone(v) : v
  }
  return out
}

const detachAll = (rows: Rows): Rows => new Map([...rows].map(([table, map]) => [table, new Map([...map].map(([k, row]) => [k, detach(row)]))]))

function remember(rows: Rows) {
  saved = detachAll(rows)
}

/** Puts the working copy back to PostgreSQL's last known state (start-up, and after a request that failed). */
export function revert() {
  fromRows(detachAll(saved))
}

async function load() {
  const pg = client()
  if (await isLegacyLayout(pg)) {
    throw new Error('This database still uses the old layout. Back it up, then run `npm run db:migrate` (docs/server.md).')
  }
  await pg.unsafe(schema)
  remember(await readTables(pg))
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
  key: string
  row: Row
}

function pendingOps(): { upserts: Op[]; deletes: Op[] } {
  const next = toRows()
  const upserts: Op[] = []
  const deletes: Op[] = []
  for (const t of TABLES) {
    const before = saved.get(t.name) ?? new Map<string, Row>()
    const rows = next.get(t.name)!
    const changed: Op[] = []
    for (const [key, row] of rows) {
      const old = before.get(key)
      if (!old || !sameRow(old, row)) changed.push({ table: t.name, key, row })
    }
    // At most one primary account / current agreement per parent: clear the old one before setting the new one.
    if (t.flag) changed.sort((a, b) => Number(Boolean(a.row[t.flag!])) - Number(Boolean(b.row[t.flag!])))
    upserts.push(...changed)
    for (const [key, row] of before) if (!rows.has(key)) deletes.push({ table: t.name, key, row })
  }
  // Children before parents (a parent's delete also removes its children; deleting those first is harmless).
  deletes.reverse()
  return { upserts, deletes }
}

let onSaved: (() => void) | null = null

/** Called after every write that changed data (server/live.ts tells the signed-in browsers to refresh). */
export function onDataSaved(listener: (() => void) | null) {
  onSaved = listener
}

/** Writes everything that changed since PostgreSQL's last known state, all or nothing. */
export async function flush(): Promise<void> {
  const { upserts, deletes } = pendingOps()
  if (!upserts.length && !deletes.length) return
  await client().begin(async (tx) => {
    for (const op of upserts) await upsert(tx, op.table, op.row)
    for (const op of deletes) await remove(tx, op.table, op.row)
  })
  for (const op of upserts) {
    let table = saved.get(op.table)
    if (!table) saved.set(op.table, (table = new Map()))
    table.set(op.key, detach(op.row))
  }
  for (const op of deletes) saved.get(op.table)?.delete(op.key)
  onSaved?.()
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
  await client()`insert into files (key, content_type, size, data) values (${key}, ${contentType}, ${data.byteLength}, ${data})`
}

export async function readFile(key: string): Promise<{ content_type: string; data: Uint8Array } | undefined> {
  const [row] = await client()<{ content_type: string; data: Uint8Array }[]>`select content_type, data from files where key = ${key}`
  return row
}

/**
 * Removes files no document points to any more (purged deleted documents, deleted influencers). Only files older than
 * a day: a new upload's file arrives a moment before its document. Returns how many.
 */
export async function deleteOrphanFiles(): Promise<number> {
  const rows = await client()`delete from files f where f.created_at < now() - interval '1 day'
    and not exists (select 1 from documents d where d.storage_key = f.key) returning f.key`
  return rows.length
}

/**
 * Follower snapshots older than SNAPSHOT_DAYS, for every account. A sync prunes only its own account's history, so
 * accounts that stopped syncing (typed in, not found, platform disconnected) are cleaned up here. Returns how many.
 */
export async function pruneSnapshots(now = new Date()): Promise<number> {
  const rows = await client()`delete from account_snapshots
    where captured_at < ${now.toISOString()}::timestamptz - make_interval(days => ${SNAPSHOT_DAYS}) returning account_id`
  return rows.length
}

// ---- Follower history and recent posts (src/backend/platform-data.ts; never loaded into the working copy) ----

type Pg = postgres.Sql | postgres.TransactionSql
const accountExists = async (pg: Pg, id: string) => (await pg`select 1 from social_accounts where id = ${id}`).length > 0
/** bigint columns arrive as strings. */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export const platformData: PlatformDataStore = {
  async recordSnapshot(accountId, audience, at) {
    const wrote = await client().begin(async (tx) => {
      // An account removed meanwhile (its rows went with it) gets nothing.
      if (!(await accountExists(tx, accountId))) return false
      await tx`delete from account_snapshots where account_id = ${accountId} and (
        (captured_at at time zone 'Asia/Kolkata')::date = (${at}::timestamptz at time zone 'Asia/Kolkata')::date
        or captured_at < ${at}::timestamptz - make_interval(days => ${SNAPSHOT_DAYS}))`
      await tx`insert into account_snapshots (account_id, captured_at, audience) values (${accountId}, ${at}, ${audience})`
      return true
    })
    if (wrote) onSaved?.()
  },
  async listSnapshots(accountId) {
    const rows = await client()<{ captured_at: Date; audience: string }[]>`
      select captured_at, audience from account_snapshots where account_id = ${accountId} order by captured_at`
    return rows.map((r) => ({ captured_at: r.captured_at.toISOString(), audience: Number(r.audience) }))
  },
  async setRecentPosts(accountId, items) {
    const wrote = await client().begin(async (tx) => {
      if (!(await accountExists(tx, accountId))) return false
      await tx`delete from account_media where account_id = ${accountId}`
      if (!items.length) return true
      const rows = items.map((m, position) => ({
        account_id: accountId, position, thumbnail: m.thumbnail, permalink: m.permalink, likes: m.likes,
        comments: m.comments, posted_at: m.posted_at,
      }))
      await tx`insert into account_media ${tx(rows)}`
      return true
    })
    if (wrote) onSaved?.()
  },
  async listRecentPosts(accountId) {
    const rows = await client()<{ thumbnail: string | null; permalink: string; likes: string | null; comments: string | null; posted_at: Date }[]>`
      select thumbnail, permalink, likes, comments, posted_at from account_media where account_id = ${accountId} order by position`
    return rows.map(
      (r): MediaItem => ({ thumbnail: r.thumbnail, permalink: r.permalink, likes: num(r.likes), comments: num(r.comments), posted_at: r.posted_at.toISOString() }),
    )
  },
}

// ---- Sign-in: password hashes and sessions (never loaded into the working copy) ----

export async function passwordHash(userId: string): Promise<string | undefined> {
  const [row] = await client()<{ password_hash: string }[]>`select password_hash from credentials where user_id = ${userId}`
  return row?.password_hash
}

export async function setPasswordHash(userId: string, hash: string) {
  await client()`insert into credentials (user_id, password_hash) values (${userId}, ${hash})
    on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`
}

export async function hasAnyPassword(): Promise<boolean> {
  const [row] = await client()`select 1 from credentials limit 1`
  return !!row
}

export async function createSession(tokenHash: string, userId: string, expiresAt: Date) {
  await client()`delete from sessions where expires_at < now()`
  await client()`insert into sessions (token_hash, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`
}

/** The user behind a session, or undefined when it doesn't exist or has expired. */
export async function sessionUser(tokenHash: string): Promise<string | undefined> {
  const [row] = await client()<{ user_id: string }[]>`select user_id from sessions where token_hash = ${tokenHash} and expires_at > now()`
  return row?.user_id
}

export async function deleteSession(tokenHash: string) {
  await client()`delete from sessions where token_hash = ${tokenHash}`
}

/** Signs a user out everywhere (or everywhere but one session). */
export async function deleteSessions(userId: string, keepTokenHash = '') {
  await client()`delete from sessions where user_id = ${userId} and token_hash <> ${keepTokenHash}`
}
