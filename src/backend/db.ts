import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { OWNER_ID } from '@/lib/mode'
import { primaryAccount, toRef, totalReach } from '@/lib/platforms'
import { ONBOARDED_OR_LATER } from '@/lib/stages'
import type {
  Activity,
  ActivityType,
  CallLog,
  Category,
  DocumentSummary,
  Influencer,
  InfluencerDocument,
  InfluencerSummary,
  InstagramSettings,
  Package,
  PoolSettings,
  SavedView,
  SocialAccount,
  Stage,
  User,
} from '@/types'

/** Categories as stored; `influencer_count` is computed per response. */
export type StoredCategory = Omit<Category, 'influencer_count'>

/** A document as stored: soft-deleted ones stay in the list with `deleted_at` set and are never served. */
export type StoredDocument = InfluencerDocument & {
  deleted_at: string | null
  /** The file's key (PostgreSQL `files` table, or this browser in prototype mode); never sent to the UI. */
  storage_key: string
}

/**
 * A finished job's outcome (import, export, lookup, sync), kept an hour so a poll still finds it after the API server
 * restarts (a free Render instance sleeps after 15 idle minutes). Jobs still waiting to run live in jobs.ts.
 */
export interface StoredJob {
  id: string
  status: 'succeeded' | 'failed'
  result: unknown
  error: { code: string; message: string } | null
  /** The member who started it; only they can read it. Null on jobs saved before this was recorded. */
  created_by: string | null
  created_at: string
}

/** An upload the presign step prepared; `blob` arrives with the PUT. */
export interface PendingUpload {
  influencer_id: string
  type: InfluencerDocument['type']
  file_name: string
  content_type: string
  size: number
  /** The API server is receiving the file (PUT). */
  uploading?: boolean
  /** The file is stored: only then can its metadata be saved (FR-DOC-02). */
  uploaded?: boolean
}

/**
 * An influencer's `documents` summary is derived (and null in the pool), so it's computed whenever the object is
 * serialised instead of being kept in step with every owner change. The stored field is only a placeholder.
 */
export function attachDocumentSummary(inf: Influencer): Influencer {
  Object.defineProperty(inf, 'toJSON', {
    enumerable: false,
    configurable: true,
    value: () => ({ ...inf, documents: documentSummary(inf), ever_onboarded: everOnboarded(inf) }),
  })
  return inf
}

/**
 * Whether the creator has been Onboarded (or later) at any point: now, or by a recorded move. Derived on every read,
 * never stored, so the override rule can't be sidestepped by moving an onboarded creator to Rejected or On Hold.
 */
export function everOnboarded(inf: Pick<Influencer, 'id' | 'stage'>): boolean {
  if (ONBOARDED_OR_LATER.includes(inf.stage)) return true
  return onboardedIndex().has(inf.id)
}

/**
 * Ids with a recorded move onto Onboarded or later, built once from the activity log and reused (every response and
 * every store flush serialises all influencers, so a scan per influencer would cost influencers × activities).
 * Dropped at the start of each request (`setActingUid`), on every new activity (`logActivity`) and after a merge
 * re-points activities (`invalidateEverOnboarded`).
 */
let onboardedIds: Set<string> | null = null

function onboardedIndex(): Set<string> {
  if (!onboardedIds) {
    onboardedIds = new Set(
      db.activities
        .filter((a) => a.type === 'stage_changed' && ONBOARDED_OR_LATER.includes(a.payload.to as Stage))
        .map((a) => a.influencer_id),
    )
  }
  return onboardedIds
}

export function invalidateEverOnboarded() {
  onboardedIds = null
}

/** What's on file for an influencer (null in the pool: documents aren't shown for unassigned influencers). */
export function documentSummary(inf: Influencer): DocumentSummary | null {
  if (inf.assigned_to === null) return null
  const mine = db.documents.filter((d) => d.influencer_id === inf.id && !d.deleted_at)
  return {
    insights_count: mine.filter((d) => d.type === 'insights_summary').length,
    has_agreement: mine.some((d) => d.type === 'agreement' && d.is_current),
  }
}

/** `documentSummary` for many influencers at once (one pass over the documents instead of one per influencer). */
export function documentSummaries(): (inf: Influencer) => DocumentSummary | null {
  const byInfluencer = new Map<string, DocumentSummary>()
  for (const d of db.documents) {
    if (d.deleted_at) continue
    const summary = byInfluencer.get(d.influencer_id) ?? { insights_count: 0, has_agreement: false }
    if (d.type === 'insights_summary') summary.insights_count += 1
    else if (d.type === 'agreement' && d.is_current) summary.has_agreement = true
    byInfluencer.set(d.influencer_id, summary)
  }
  const none: DocumentSummary = { insights_count: 0, has_agreement: false }
  return (inf) => (inf.assigned_to === null ? null : (byInfluencer.get(inf.id) ?? none))
}

/** No business account connected yet: what a fresh workspace starts with. */
export function disconnectedInstagramSettings(): InstagramSettings {
  return {
    connected: false,
    business_account: null,
    token_status: 'expired',
    token_expires_at: null,
    sync_interval_hours: 168,
    api_usage_pct: 0,
    last_runs: [],
  }
}

/**
 * The working copy of the workspace: the API server's (loaded from PostgreSQL by server/pg-store.ts), or this
 * browser's in prototype mode. The store writes back whatever a request or job changed. Modules reassign the collections
 * (e.g. db.influencers = …), so keep these as properties.
 */
/** One-time data upgrades this workspace has finished (settings/migrations), so they never run twice. */
export interface WorkspaceMigrations {
  /** The old default categories were moved to DEFAULT_CATEGORIES. */
  categories_upgraded: boolean
}

export const db = {
  team: [] as User[],
  categories: [] as StoredCategory[],
  influencers: [] as Influencer[],
  documents: [] as StoredDocument[],
  calls: [] as CallLog[],
  packages: [] as Package[],
  activities: [] as Activity[],
  savedViews: [] as SavedView[],
  instagramSettings: disconnectedInstagramSettings(),
  /** Both guards are off until an admin turns them on. */
  poolSettings: { claim_limit: null, auto_release_days: null } as PoolSettings,
  migrations: { categories_upgraded: false } as WorkspaceMigrations,
  /** Duplicate pair ids a manager dismissed ("not the same creator"). */
  dismissedDuplicates: new Set<string>(),
  /** Finished jobs of the last hour (jobs.ts), oldest first. */
  jobs: [] as StoredJob[],
  /** Document uploads between presign and save, by Storage key (this tab only). */
  documentUploads: new Map<string, PendingUpload>(),
  /** CSV files waiting to be imported (the latest 5), by key, oldest first; saved, so a restart doesn't lose them. */
  uploads: new Map<string, string>(),
}

/** What a workspace starts with before any setting is saved. */
export function defaultSettings() {
  return {
    instagramSettings: disconnectedInstagramSettings(),
    poolSettings: { claim_limit: null, auto_release_days: null } as PoolSettings,
    migrations: { categories_upgraded: false } as WorkspaceMigrations,
  }
}

/** A new workspace's only data: the owner admin and the default categories (configuration, not sample data). */
export function newWorkspace(): { team: User[]; categories: StoredCategory[] } {
  return {
    team: [{ id: OWNER_ID, name: 'Admin', email: 'admin@influencehub.local', role: 'admin', location: null, is_active: true, created_at: nowIso() }],
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: `cat_${String(i + 1).padStart(2, '0')}`, name, is_active: true })),
  }
}

/** Random, so ids never clash. */
export function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export const nowIso = () => new Date().toISOString()

let actingUid: string | null = null

/**
 * Set when a read (GET) changed data by itself: auto-release, link expiry or a job finishing. The stores save after a
 * read only then (saving compares the whole workspace: ~seconds at 100,000 influencers). Cleared at each request start.
 */
let changedOnRead = false
export const noteChangedOnRead = () => {
  changedOnRead = true
}
export const readChangedData = () => changedOnRead

/** Reads never change data apart from what `noteChangedOnRead` flags (tests/workspace.test.ts checks every GET). */
export const isRead = (request: Request) => request.method === 'GET' || request.method === 'HEAD'

/**
 * Prototype mode (no sign-in): requests act as the member the account menu picked, or as an active admin when that
 * member is gone or deactivated. The API server takes the signed-in member instead (server/auth.ts). Null only when the workspace has no active admin.
 */
export function resolveActingUid(uid: string | null): string | null {
  const active = db.team.filter((u) => u.is_active)
  return (active.find((u) => u.id === uid) ?? active.find((u) => u.role === 'admin'))?.id ?? null
}

/** Set for each request (resolveActingUid). */
export function setActingUid(uid: string | null) {
  changedOnRead = false
  invalidateEverOnboarded()
  stageEntered = null
  actingUid = uid
}

/** The team member this request acts as. */
export function currentUser(): User {
  const user = actingUid ? db.team.find((u) => u.id === actingUid) : undefined
  if (!user) throw new Error('No team member for this request')
  return user
}

/**
 * Position of each influencer in `db.influencers`, so lookups by id don't scan the list (NFR-01: 100,000 influencers).
 * A hit is trusted only when that position still holds that id; anything else (added, deleted, reordered, list
 * replaced) rebuilds the index.
 */
let positions = new Map<string, number>()

export function findInfluencer(id: string): Influencer | undefined {
  const at = positions.get(id)
  if (at !== undefined && db.influencers[at]?.id === id) return db.influencers[at]
  positions = new Map(db.influencers.map((inf, i) => [inf.id, i]))
  const now = positions.get(id)
  return now === undefined ? undefined : db.influencers[now]
}

export function findAccount(id: string): { influencer: Influencer; account: SocialAccount } | undefined {
  for (const influencer of db.influencers) {
    const account = influencer.accounts.find((a) => a.id === id)
    if (account) return { influencer, account }
  }
  return undefined
}

/** Recomputes what's derived from the accounts (call after any account change). */
export function refreshDerived(inf: Influencer) {
  if (!inf.accounts.some((a) => a.is_primary) && inf.accounts[0]) inf.accounts[0].is_primary = true
  inf.accounts.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  inf.total_reach = totalReach(inf.accounts)
  inf.is_verified = inf.accounts.some((a) => a.is_verified)
  inf.profile_pic_url = primaryAccount(inf)?.profile_pic_url ?? inf.accounts.find((a) => a.profile_pic_url)?.profile_pic_url ?? null
}

export function toSummary(inf: Influencer): InfluencerSummary {
  const primary = primaryAccount(inf)
  return {
    id: inf.id,
    name: inf.name,
    primary_account: primary ? toRef(primary) : null,
    profile_pic_url: inf.profile_pic_url,
    phone: inf.phone,
    stage: inf.stage,
    assigned_to: inf.assigned_to,
  }
}

export function logActivity(
  influencerId: string,
  type: ActivityType,
  payload: Record<string, unknown>,
  actor: string | null = currentUser().id,
): Activity {
  const activity: Activity = {
    id: nextId('act'),
    influencer_id: influencerId,
    actor,
    type,
    payload,
    created_at: nowIso(),
  }
  db.activities.push(activity)
  invalidateEverOnboarded()
  stageEntered = null
  return activity
}

/** Most recent stage before the influencer entered on_hold. */
export function previousStageOf(influencerId: string): Influencer['stage'] | null {
  for (let i = db.activities.length - 1; i >= 0; i--) {
    const a = db.activities[i]
    if (a.influencer_id === influencerId && a.type === 'stage_changed' && a.payload.to === 'on_hold') {
      return (a.payload.from as Influencer['stage']) ?? null
    }
  }
  return null
}

/**
 * The latest move onto each (influencer, stage), built once from the activity log and dropped at the start of each
 * request and on every new activity (the pipeline asks for every influencer's; a scan each would cost
 * influencers × activities).
 */
let stageEntered: Map<string, string> | null = null

/** When the influencer entered its current stage. */
export function stageEnteredAt(inf: Influencer): string {
  if (!stageEntered) {
    stageEntered = new Map()
    for (const a of db.activities) {
      if (a.type === 'stage_changed') stageEntered.set(`${a.influencer_id}:${String(a.payload.to)}`, a.created_at)
    }
  }
  return stageEntered.get(`${inf.id}:${inf.stage}`) ?? inf.created_at
}

