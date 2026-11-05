import { primaryAccount, toRef, totalReach } from '@/lib/platforms'
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
  User,
} from '@/types'

/** Categories as stored; `influencer_count` is computed per response. */
export type StoredCategory = Omit<Category, 'influencer_count'>

/** A document as stored: soft-deleted ones stay in the list with `deleted_at` set and are never served. */
export type StoredDocument = InfluencerDocument & {
  deleted_at: string | null
  /** Where the file is in Firebase Storage; never sent to the UI. */
  storage_key: string
}

/** An upload the presign step prepared; `blob` arrives with the PUT. */
export interface PendingUpload {
  influencer_id: string
  type: InfluencerDocument['type']
  file_name: string
  content_type: string
  size: number
}

/**
 * An influencer's `documents` summary is derived (and null in the pool), so it's computed whenever the object is
 * serialised instead of being kept in step with every owner change. The stored field is only a placeholder.
 */
export function attachDocumentSummary(inf: Influencer): Influencer {
  Object.defineProperty(inf, 'toJSON', {
    enumerable: false,
    configurable: true,
    value: () => ({ ...inf, documents: documentSummary(inf) }),
  })
  return inf
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

/** No business account connected yet: what a fresh workspace starts with. */
export function disconnectedInstagramSettings(): InstagramSettings {
  return {
    connected: false,
    business_account: null,
    token_status: 'expired',
    token_expires_at: null,
    sync_interval_hours: 6,
    api_usage_pct: 0,
    last_runs: [],
  }
}

/**
 * This browser's working copy of the workspace. src/backend/persistence.ts fills it from Firestore (live, so other
 * people's changes arrive), and writes back whatever a request or job changed. Modules reassign the collections
 * (e.g. db.influencers = …), so keep these as properties.
 */
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
  /** Duplicate pair ids a manager dismissed ("not the same creator"). */
  dismissedDuplicates: new Set<string>(),
  /** Document uploads between presign and save, by Storage key (this tab only). */
  documentUploads: new Map<string, PendingUpload>(),
  /** CSV files waiting to be imported, by key (read in this tab, never stored). */
  uploads: new Map<string, string>(),
}

/** What a workspace starts with before any setting is saved. */
export function defaultSettings() {
  return {
    instagramSettings: disconnectedInstagramSettings(),
    poolSettings: { claim_limit: null, auto_release_days: null } as PoolSettings,
  }
}

/** Unique across every signed-in browser writing to the same database. */
export function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export const nowIso = () => new Date().toISOString()

let actingUid: string | null = null

/** Set by handleApiRequest for each request once it has checked the caller. */
export function setActingUid(uid: string | null) {
  actingUid = uid
}

/**
 * The team member making this request (team records are keyed by Firebase uid, or by member id in prototype mode).
 * Requests only reach a handler after handleApiRequest has checked that this record exists and is active.
 */
export function currentUser(): User {
  const user = actingUid ? db.team.find((u) => u.id === actingUid) : undefined
  if (!user) throw new Error('No team member for this request')
  return user
}

export function findInfluencer(id: string): Influencer | undefined {
  return db.influencers.find((i) => i.id === id)
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

/** When the influencer entered its current stage. */
export function stageEnteredAt(inf: Influencer): string {
  for (let i = db.activities.length - 1; i >= 0; i--) {
    const a = db.activities[i]
    if (a.influencer_id === inf.id && a.type === 'stage_changed' && a.payload.to === inf.stage) return a.created_at
  }
  return inf.created_at
}

