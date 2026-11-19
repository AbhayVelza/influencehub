import type postgres from 'postgres'
import { attachDocumentSummary, db, defaultSettings, everOnboarded, type StoredCategory, type StoredDocument, type StoredJob } from '@/backend/db'
import { pairId } from '@/backend/duplicates'
import { audienceOf } from '@/lib/platforms'
import type { Activity, CallLog, Influencer, InstagramSettings, Package, SavedView, SocialAccount, Stage, User } from '@/types'

// Maps the working copy (`db`, the app's records) to the relational tables in server/schema.sql and back.
// `toRows` is what the store writes after each request and what the migration inserts; `fromRows` rebuilds the
// working copy from what PostgreSQL holds. A record must survive toRows → fromRows unchanged (the migration checks
// every record this way before it commits).

export type Row = Record<string, unknown>
export type Rows = Map<string, Map<string, Row>>

export interface TableSpec {
  name: string
  pk: string[]
  /** jsonb columns (sent with sql.json). */
  json?: string[]
  /** A boolean at most one row per parent may hold (partial unique index): rows clearing it are written first. */
  flag?: string
  order: string
}

/** Parents before children: inserts and updates run in this order, deletes in reverse. */
export const TABLES: TableSpec[] = [
  { name: 'team_members', pk: ['id'], order: 'seq' },
  { name: 'categories', pk: ['id'], order: 'seq' },
  // Newest first: the handlers add new influencers at the front of the list (lists without a sort keep that order).
  { name: 'influencers', pk: ['id'], order: 'seq DESC' },
  { name: 'social_accounts', pk: ['id'], json: ['metrics'], flag: 'is_primary', order: 'influencer_id, position' },
  { name: 'calls', pk: ['id'], order: 'seq' },
  { name: 'packages', pk: ['id'], order: 'seq' },
  { name: 'package_items', pk: ['package_id', 'position'], order: 'package_id, position' },
  { name: 'documents', pk: ['id'], flag: 'is_current', order: 'seq' },
  { name: 'activities', pk: ['id'], json: ['payload'], order: 'seq' },
  { name: 'saved_views', pk: ['id'], json: ['filters'], order: 'seq' },
  { name: 'dismissed_duplicates', pk: ['influencer_a', 'influencer_b'], order: 'influencer_a, influencer_b' },
  { name: 'pool_settings', pk: ['id'], order: 'id' },
  { name: 'instagram_settings', pk: ['id'], order: 'id' },
  { name: 'sync_runs', pk: ['started_at'], order: 'started_at DESC' },
  { name: 'schema_migrations', pk: ['version'], order: 'version' },
  { name: 'jobs', pk: ['id'], json: ['result', 'error'], order: 'seq' },
  { name: 'csv_uploads', pk: ['key'], order: 'seq' },
]

export const spec = (table: string) => TABLES.find((t) => t.name === table)!
export const rowKey = (table: string, row: Row) => spec(table).pk.map((k) => String(row[k])).join('\u0000')

/** Columns PostgreSQL fills itself; never written, left out of comparisons. */
const SERVER_COLUMNS = new Set(['seq', 'applied_at'])
const DATE_COLUMNS = new Set(['period_start', 'period_end', 'signed_on', 'valid_until'])
const BIGINT_COLUMNS = new Set(['total_reach', 'audience'])

/** JSON with sorted keys, so equal data always compares equal. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Row).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

/**
 * Whether two rows of a table hold the same data: what the store checks for every row after each write. Compares
 * column by column (`canonical` text for every row took ~9 s at 100,000 influencers): plain values with ===, arrays
 * and jsonb values by their canonical JSON. A column missing on one side counts as NULL.
 */
export function sameRow(a: Row, b: Row): boolean {
  for (const k in a) if (!sameValue(a[k], b[k])) return false
  for (const k in b) if (!(k in a) && !sameValue(undefined, b[k])) return false
  return true
}

function sameValue(x: unknown, y: unknown): boolean {
  if (x === y) return true
  if (x == null || y == null) return x == null && y == null
  if (typeof x !== 'object' || typeof y !== 'object') return false
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false
    return x.every((v, i) => sameValue(v, y[i]))
  }
  // jsonb objects: same keys (in any order), same values; an undefined value is an absent key, as in JSON.
  const a = x as Row
  const b = y as Row
  for (const k in a) if (a[k] !== undefined && !sameValue(a[k], b[k])) return false
  for (const k in b) if (b[k] !== undefined && a[k] === undefined) return false
  return true
}

/** A row as PostgreSQL returns it, in the shape toRows produces (ISO strings, yyyy-MM-dd dates, numbers). */
function normalise(row: Row): Row {
  const out: Row = {}
  for (const [col, value] of Object.entries(row)) {
    if (SERVER_COLUMNS.has(col)) continue
    if (value instanceof Date) out[col] = DATE_COLUMNS.has(col) ? value.toISOString().slice(0, 10) : value.toISOString()
    else if (BIGINT_COLUMNS.has(col) && value !== null) out[col] = Number(value)
    else out[col] = value
  }
  return out
}

/** Every table's rows, in the order the app keeps its lists. */
export async function readTables(sql: postgres.Sql | postgres.TransactionSql): Promise<Rows> {
  const out: Rows = new Map()
  for (const t of TABLES) {
    const rows = await sql.unsafe<Row[]>(`SELECT * FROM ${t.name} ORDER BY ${t.order}`)
    out.set(t.name, new Map(rows.map((r) => normalise(r)).map((r) => [rowKey(t.name, r), r])))
  }
  return out
}

// ---------------------------------------------------------------------------
// Working copy → rows

/** Facts about each influencer that come from the activity log, in one pass. */
function activityFacts() {
  const ownership = new Map<string, Activity>()
  const lastMove = new Map<string, Activity>()
  const holdFrom = new Map<string, Stage>()
  for (const a of db.activities) {
    if (a.type === 'claimed' || a.type === 'assigned' || a.type === 'released') ownership.set(a.influencer_id, a)
    if (a.type === 'stage_changed') {
      lastMove.set(a.influencer_id, a)
      if (a.payload.to === 'on_hold') holdFrom.set(a.influencer_id, a.payload.from as Stage)
    }
  }
  return { ownership, lastMove, holdFrom }
}

function documentFacts() {
  const facts = new Map<string, { insights: number; agreement: boolean }>()
  for (const d of db.documents) {
    if (d.deleted_at) continue
    const f = facts.get(d.influencer_id) ?? { insights: 0, agreement: false }
    if (d.type === 'insights_summary') f.insights += 1
    else if (d.is_current) f.agreement = true
    facts.set(d.influencer_id, f)
  }
  return facts
}

function parsePairId(id: string): [string, string] | null {
  const m = /^dup_(.+?_[^_]+)_(.+?_[^_]+)$/.exec(id)
  return m ? [m[1]!, m[2]!] : null
}

export function toRows(): Rows {
  const out: Rows = new Map(TABLES.map((t) => [t.name, new Map<string, Row>()]))
  const put = (table: string, row: Row) => out.get(table)!.set(rowKey(table, row), row)

  for (const u of db.team) {
    put('team_members', {
      id: u.id, name: u.name, email: u.email, role: u.role, location: u.location, is_active: u.is_active,
      created_at: u.created_at, deleted_at: u.deleted_at ?? null,
    })
  }
  const categoryIds = new Map<string, string>()
  for (const c of db.categories) {
    put('categories', { id: c.id, name: c.name, is_active: c.is_active })
    categoryIds.set(c.name.toLowerCase(), c.id)
  }

  const acts = activityFacts()
  const docs = documentFacts()
  for (const inf of db.influencers) {
    const categoryId = categoryIds.get(inf.category.toLowerCase())
    if (!categoryId) throw new Error(`Influencer ${inf.id} has category "${inf.category}", which is not a category`)
    const a = inf.address
    const ck = inf.onboarding_checklist
    const own = acts.ownership.get(inf.id)
    const doc = docs.get(inf.id)
    put('influencers', {
      id: inf.id, name: inf.name, category_id: categoryId, phone: inf.phone, email: inf.email,
      address_line1: a?.line1 ?? null, address_line2: a?.line2 ?? null, address_city: a?.city ?? null,
      address_state: a?.state ?? null, address_postal_code: a?.postal_code ?? null, address_country: a?.country ?? null,
      city: inf.city, state: inf.state, country: inf.country, profile_pic_url: inf.profile_pic_url,
      is_verified: inf.is_verified, total_reach: inf.total_reach, stage: inf.stage, assigned_to: inf.assigned_to,
      tags: inf.tags, notes: inf.notes,
      chk_called: ck.called, chk_agreement_signed: ck.agreement_signed, chk_insights_received: ck.insights_received,
      chk_address_collected: ck.address_collected, chk_ig_connected: ck.ig_connected,
      created_at: inf.created_at, updated_at: inf.updated_at,
      platforms: [...new Set(inf.accounts.map((acc) => acc.platform))],
      has_agreement: doc?.agreement ?? false,
      insights_count: doc?.insights ?? 0,
      ever_onboarded: everOnboarded(inf),
      claimed_at: inf.assigned_to && own?.type === 'claimed' && own.actor === inf.assigned_to ? own.created_at : null,
      stage_before_hold: inf.stage === 'on_hold' ? (acts.holdFrom.get(inf.id) ?? null) : null,
      stage_changed_at: acts.lastMove.get(inf.id)?.created_at ?? inf.created_at,
      search_text: [inf.name, ...inf.accounts.map((acc) => acc.handle), inf.city ?? ''].join(' ').toLowerCase(),
    })
    inf.accounts.forEach((acc, position) => {
      put('social_accounts', {
        id: acc.id, influencer_id: inf.id, position, platform: acc.platform, handle: acc.handle,
        profile_url: acc.profile_url, is_primary: acc.is_primary, sync_method: acc.sync_method,
        sync_status: acc.sync_status, last_synced_at: acc.last_synced_at, connect_status: acc.connect_status,
        connect_link_expires_at: acc.connect_link_expires_at, display_name: acc.display_name,
        profile_pic_url: acc.profile_pic_url, bio: acc.bio, links: acc.links, is_verified: acc.is_verified,
        metrics: acc.metrics, created_at: acc.created_at, audience: audienceOf(acc),
      })
    })
  }

  for (const c of db.calls) {
    put('calls', {
      id: c.id, influencer_id: c.influencer_id, called_by: c.called_by, outcome: c.outcome, notes: c.notes,
      follow_up_date: c.follow_up_date, follow_up_done: c.follow_up_done, created_at: c.created_at,
    })
  }
  for (const p of db.packages) {
    put('packages', {
      id: p.id, influencer_id: p.influencer_id, address_line1: p.address.line1, address_line2: p.address.line2,
      address_city: p.address.city, address_state: p.address.state, address_postal_code: p.address.postal_code,
      address_country: p.address.country, courier: p.courier, tracking_number: p.tracking_number, status: p.status,
      sent_at: p.sent_at, delivered_at: p.delivered_at,
    })
    p.items.forEach((item, position) => put('package_items', { package_id: p.id, position, name: item.name, qty: item.qty }))
  }
  for (const d of db.documents) {
    const insights = d.type === 'insights_summary' ? d : null
    const agreement = d.type === 'agreement' ? d : null
    put('documents', {
      id: d.id, influencer_id: d.influencer_id, type: d.type, title: d.title, file_name: d.file_name,
      content_type: d.content_type, size: d.size, storage_key: d.storage_key, uploaded_by: d.uploaded_by,
      uploaded_at: d.uploaded_at, notes: d.notes, deleted_at: d.deleted_at,
      period_start: insights?.period_start ?? null, period_end: insights?.period_end ?? null, platform: insights?.platform ?? null,
      signed_on: agreement?.signed_on ?? null, valid_until: agreement?.valid_until ?? null, is_current: agreement?.is_current ?? null,
    })
  }
  for (const a of db.activities) {
    put('activities', { id: a.id, influencer_id: a.influencer_id, actor: a.actor, type: a.type, payload: a.payload, created_at: a.created_at })
  }
  for (const v of db.savedViews) {
    put('saved_views', { id: v.id, name: v.name, filters: v.filters, sort: v.sort, created_by: v.created_by, created_at: v.created_at })
  }
  // A dismissed pair whose influencer has since been deleted or merged away has nothing left to hide.
  const influencerIds = new Set(db.influencers.map((i) => i.id))
  for (const id of db.dismissedDuplicates) {
    const pair = parsePairId(id)
    if (pair && influencerIds.has(pair[0]) && influencerIds.has(pair[1])) {
      put('dismissed_duplicates', { influencer_a: pair[0], influencer_b: pair[1] })
    }
  }

  put('pool_settings', { id: 1, claim_limit: db.poolSettings.claim_limit, auto_release_days: db.poolSettings.auto_release_days })
  const ig = db.instagramSettings
  put('instagram_settings', {
    id: 1, connected: ig.connected, business_username: ig.business_account?.username ?? null,
    business_ig_user_id: ig.business_account?.ig_user_id ?? null, token_status: ig.token_status,
    token_expires_at: ig.token_expires_at, sync_interval_hours: ig.sync_interval_hours, api_usage_pct: ig.api_usage_pct,
  })
  for (const run of ig.last_runs) {
    put('sync_runs', { started_at: run.started_at, finished_at: run.finished_at, status: run.status, synced: run.synced, failed: run.failed })
  }
  if (db.migrations.categories_upgraded) put('schema_migrations', { version: 'categories_upgraded' })
  for (const j of db.jobs) put('jobs', { id: j.id, status: j.status, result: j.result, error: j.error, created_at: j.created_at })
  for (const [key, text] of db.uploads) put('csv_uploads', { key, text })
  return out
}

// ---------------------------------------------------------------------------
// Rows → working copy

const list = (rows: Rows, table: string) => [...(rows.get(table)?.values() ?? [])]
const byPosition = (a: Row, b: Row) => (a.position as number) - (b.position as number)

function grouped(rows: Row[], key: string): Map<string, Row[]> {
  const out = new Map<string, Row[]>()
  for (const r of rows) {
    const k = r[key] as string
    const g = out.get(k)
    if (g) g.push(r)
    else out.set(k, [r])
  }
  for (const g of out.values()) g.sort(byPosition)
  return out
}

/** Replaces the working copy with what `rows` hold. */
export function fromRows(rows: Rows) {
  db.team = list(rows, 'team_members').map((r) => {
    const u: User = {
      id: r.id as string, name: r.name as string, email: r.email as string, role: r.role as User['role'],
      location: r.location as string | null, is_active: r.is_active as boolean, created_at: r.created_at as string,
    }
    if (r.deleted_at) u.deleted_at = r.deleted_at as string
    return u
  })
  db.categories = list(rows, 'categories').map((r): StoredCategory => ({ id: r.id as string, name: r.name as string, is_active: r.is_active as boolean }))
  const categoryNames = new Map(db.categories.map((c) => [c.id, c.name]))

  const accounts = grouped(list(rows, 'social_accounts'), 'influencer_id')
  db.influencers = list(rows, 'influencers').map((r) => {
    const inf = {
      id: r.id, name: r.name, category: categoryNames.get(r.category_id as string) ?? '', phone: r.phone, email: r.email,
      address: r.address_line1 === null ? null : {
        line1: r.address_line1, line2: r.address_line2, city: r.address_city, state: r.address_state,
        postal_code: r.address_postal_code, country: r.address_country,
      },
      city: r.city, state: r.state, country: r.country, profile_pic_url: r.profile_pic_url, is_verified: r.is_verified,
      accounts: (accounts.get(r.id as string) ?? []).map((a) => ({
        id: a.id, influencer_id: a.influencer_id, platform: a.platform, handle: a.handle, profile_url: a.profile_url,
        is_primary: a.is_primary, sync_method: a.sync_method, sync_status: a.sync_status, last_synced_at: a.last_synced_at,
        connect_status: a.connect_status, connect_link_expires_at: a.connect_link_expires_at, display_name: a.display_name,
        profile_pic_url: a.profile_pic_url, bio: a.bio, links: a.links, is_verified: a.is_verified, metrics: a.metrics,
        created_at: a.created_at,
      })) as SocialAccount[],
      total_reach: r.total_reach, stage: r.stage, assigned_to: r.assigned_to, tags: r.tags, notes: r.notes,
      onboarding_checklist: {
        called: r.chk_called, agreement_signed: r.chk_agreement_signed, insights_received: r.chk_insights_received,
        address_collected: r.chk_address_collected, ig_connected: r.chk_ig_connected,
      },
      documents: null,
      created_at: r.created_at, updated_at: r.updated_at,
    } as Influencer
    return inf
  })

  db.calls = list(rows, 'calls').map((r) => ({
    id: r.id, influencer_id: r.influencer_id, called_by: r.called_by, outcome: r.outcome, notes: r.notes,
    follow_up_date: r.follow_up_date, follow_up_done: r.follow_up_done, created_at: r.created_at,
  }) as CallLog)

  const items = grouped(list(rows, 'package_items'), 'package_id')
  db.packages = list(rows, 'packages').map((r) => ({
    id: r.id, influencer_id: r.influencer_id,
    items: (items.get(r.id as string) ?? []).map((i) => ({ name: i.name, qty: i.qty })),
    address: {
      line1: r.address_line1, line2: r.address_line2, city: r.address_city, state: r.address_state,
      postal_code: r.address_postal_code, country: r.address_country,
    },
    courier: r.courier, tracking_number: r.tracking_number, status: r.status, sent_at: r.sent_at, delivered_at: r.delivered_at,
  }) as Package)

  db.documents = list(rows, 'documents').map((r) => {
    const base = {
      id: r.id, influencer_id: r.influencer_id, title: r.title, file_name: r.file_name, content_type: r.content_type,
      size: r.size, uploaded_by: r.uploaded_by, uploaded_at: r.uploaded_at, notes: r.notes, deleted_at: r.deleted_at,
      storage_key: r.storage_key,
    }
    return (r.type === 'agreement'
      ? { ...base, type: 'agreement', signed_on: r.signed_on, valid_until: r.valid_until, is_current: r.is_current }
      : { ...base, type: 'insights_summary', period_start: r.period_start, period_end: r.period_end, platform: r.platform }) as StoredDocument
  })

  db.activities = list(rows, 'activities').map((r) => ({
    id: r.id, influencer_id: r.influencer_id, actor: r.actor, type: r.type, payload: r.payload, created_at: r.created_at,
  }) as Activity)
  db.savedViews = list(rows, 'saved_views').map((r) => ({
    id: r.id, name: r.name, filters: r.filters, sort: r.sort, created_by: r.created_by, created_at: r.created_at,
  }) as SavedView)
  db.dismissedDuplicates = new Set(list(rows, 'dismissed_duplicates').map((r) => pairId(r.influencer_a as string, r.influencer_b as string)))

  const defaults = defaultSettings()
  const pool = list(rows, 'pool_settings')[0]
  db.poolSettings = pool
    ? { claim_limit: pool.claim_limit as number | null, auto_release_days: pool.auto_release_days as number | null }
    : defaults.poolSettings
  const ig = list(rows, 'instagram_settings')[0]
  db.instagramSettings = ig
    ? ({
        connected: ig.connected,
        business_account: ig.business_username === null ? null : { username: ig.business_username, ig_user_id: ig.business_ig_user_id },
        token_status: ig.token_status, token_expires_at: ig.token_expires_at, sync_interval_hours: ig.sync_interval_hours,
        api_usage_pct: ig.api_usage_pct,
        last_runs: list(rows, 'sync_runs').map((s) => ({
          started_at: s.started_at, finished_at: s.finished_at, status: s.status, synced: s.synced, failed: s.failed,
        })),
      } as InstagramSettings)
    : defaults.instagramSettings
  const versions = new Set(list(rows, 'schema_migrations').map((r) => r.version))
  db.migrations = { categories_upgraded: versions.has('categories_upgraded') }
  db.jobs = list(rows, 'jobs').map((r) => ({
    id: r.id, status: r.status, result: r.result, error: r.error, created_at: r.created_at,
  }) as StoredJob)
  db.uploads = new Map(list(rows, 'csv_uploads').map((r) => [r.key as string, r.text as string]))

  // Documents summaries are attached once every collection (documents included) is in place.
  for (const inf of db.influencers) attachDocumentSummary(inf)
}

// ---------------------------------------------------------------------------
// Writing

/** Values ready for postgres.js: jsonb columns wrapped. */
function prepare(sql: postgres.TransactionSql, table: string, row: Row): Row {
  const json = spec(table).json ?? []
  if (!json.length) return row
  const out = { ...row }
  for (const col of json) out[col] = sql.json(row[col] as postgres.JSONValue)
  return out
}

export async function upsert(sql: postgres.TransactionSql, table: string, row: Row) {
  const { pk } = spec(table)
  const values = prepare(sql, table, row)
  const cols = Object.keys(row)
  const rest = cols.filter((c) => !pk.includes(c))
  if (rest.length) {
    await sql`insert into ${sql(table)} ${sql(values, cols)} on conflict (${sql(pk)}) do update set ${sql(values, rest)}`
  } else {
    await sql`insert into ${sql(table)} ${sql(values, cols)} on conflict do nothing`
  }
}

export async function remove(sql: postgres.TransactionSql, table: string, row: Row) {
  const [a, b] = spec(table).pk
  if (b) await sql`delete from ${sql(table)} where ${sql(a!)} = ${row[a!] as string} and ${sql(b)} = ${row[b] as string}`
  else await sql`delete from ${sql(table)} where ${sql(a!)} = ${row[a!] as string}`
}

/** Inserts many rows of one table, 200 per statement (the migration's bulk load). */
export async function insertAll(sql: postgres.TransactionSql, table: string, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map((r) => prepare(sql, table, r))
    await sql`insert into ${sql(table)} ${sql(batch, Object.keys(rows[0]!))}`
  }
}
