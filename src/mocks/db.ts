import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays } from 'date-fns'
import { APP_TIMEZONE } from '@/lib/constants'
import { getMockUserId } from '@/lib/mock-user'
import { audienceOf, primaryAccount, toRef, totalReach } from '@/lib/platforms'
import type {
  AccountSnapshot,
  Activity,
  ActivityType,
  CallLog,
  Category,
  Influencer,
  InfluencerSummary,
  InstagramSettings,
  MediaItem,
  Package,
  PoolSettings,
  SavedView,
  SocialAccount,
  SyncRun,
  User,
} from '@/types'
import fixturesJson from './fixtures.json'

/** Categories as stored; `influencer_count` is computed per response. */
export type StoredCategory = Omit<Category, 'influencer_count'>

interface Fixtures {
  generated_at: string
  current_user_id: string
  team: User[]
  categories: StoredCategory[]
  influencers: Influencer[]
  calls: CallLog[]
  packages: Package[]
  activities: Activity[]
  saved_views: SavedView[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_KEYS = new Set([
  'created_at',
  'updated_at',
  'last_synced_at',
  'follow_up_date',
  'sent_at',
  'delivered_at',
  'connect_link_expires_at',
])

/** Moves every timestamp forward by whole days so "today" in the fixtures is always today. */
function shiftDates<T>(value: T, offsetMs: number): T {
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, offsetMs)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      out[key] =
        DATE_KEYS.has(key) && typeof v === 'string'
          ? new Date(Date.parse(v) + offsetMs).toISOString()
          : shiftDates(v, offsetMs)
    }
    return out as T
  }
  return value
}

function load(): Fixtures {
  const raw = fixturesJson as unknown as Fixtures
  const days = differenceInCalendarDays(new TZDate(Date.now(), APP_TIMEZONE), new TZDate(raw.generated_at, APP_TIMEZONE))
  return shiftDates(structuredClone(raw), days * DAY_MS)
}

const data = load()

/** Connected business account with 20 scheduled runs, one every 6 h, ending just now. */
function createInstagramSettings(): InstagramSettings {
  const intervalHours = 6
  const syncable = data.influencers.flatMap((i) => i.accounts).filter((a) => a.platform === 'instagram' && a.sync_method === 'lookup').length
  const hour = 60 * 60 * 1000
  const latest = Math.floor(Date.now() / (intervalHours * hour)) * intervalHours * hour
  const last_runs: SyncRun[] = Array.from({ length: 20 }, (_, i) => {
    const started = latest - i * intervalHours * hour
    const finished = started + (4 + (i % 5)) * 60 * 1000
    const times = { started_at: new Date(started).toISOString(), finished_at: new Date(finished).toISOString() }
    // Run 11 failed outright (token refresh error); runs 3 and 15 partially failed.
    if (i === 11) return { ...times, status: 'failed', synced: 0, failed: syncable }
    const failed = i === 3 ? 2 : i === 15 ? 3 : 0
    return { ...times, status: failed ? 'partial' : 'succeeded', synced: syncable - failed, failed }
  })
  return {
    connected: true,
    business_account: { username: 'influencehub.brand', ig_user_id: '17841405822304914' },
    token_status: 'valid',
    token_expires_at: new Date(Date.now() + 46 * DAY_MS).toISOString(),
    sync_interval_hours: intervalHours,
    api_usage_pct: 37,
    last_runs,
  }
}

export const db = {
  currentUserId: data.current_user_id,
  team: data.team,
  categories: data.categories,
  influencers: data.influencers,
  calls: data.calls,
  packages: data.packages,
  activities: data.activities,
  savedViews: data.saved_views,
  instagramSettings: createInstagramSettings(),
  /** Both guards are off until an admin turns them on. */
  poolSettings: { claim_limit: null, auto_release_days: null } as PoolSettings,
  /** CSV files "uploaded" to presigned URLs, by key. */
  uploads: new Map<string, string>(),
  /** Duplicate pair ids a manager dismissed ("not the same creator"). */
  dismissedDuplicates: new Set<string>(),
}

let idCounter = 0
export function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`
}

export const nowIso = () => new Date().toISOString()

/** The signed-in mock user: the dev "View as" choice if it's an active member, else the fixtures' default. */
export function currentUser(): User {
  const chosen = db.team.find((u) => u.id === getMockUserId() && u.is_active)
  const user = chosen ?? db.team.find((u) => u.id === db.currentUserId)
  if (!user) throw new Error('Mock current user missing')
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

// ---------------------------------------------------------------------------
// Deterministic generated data (snapshots, media) seeded by influencer id.

function seeded(seedText: string) {
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function snapshotsFor(account: SocialAccount): AccountSnapshot[] {
  const audience = audienceOf(account)
  if (audience == null || account.last_synced_at == null) return []
  const rand = seeded(account.id)
  const weeks = 12
  const growth = 0.004 + rand() * 0.02
  const end = Date.parse(account.last_synced_at)
  return Array.from({ length: weeks }, (_, i) => {
    const back = weeks - 1 - i
    const factor = (1 + growth) ** -back * (1 + (rand() - 0.5) * 0.004)
    return { audience: Math.round(audience * factor), captured_at: new Date(end - back * 7 * DAY_MS).toISOString() }
  })
}

/** Recent posts / videos for synced Instagram and YouTube accounts. */
export function mediaFor(account: SocialAccount): MediaItem[] {
  const audience = audienceOf(account)
  if (audience == null || account.last_synced_at == null || (account.platform !== 'instagram' && account.platform !== 'youtube')) return []
  const rand = seeded(`${account.id}-media`)
  const rate = account.platform === 'instagram' ? (account.metrics.engagement_rate ?? 2) : 1.5
  let t = Date.parse(account.last_synced_at)
  return Array.from({ length: 6 }, (_, i) => {
    t -= (1 + rand() * 4) * DAY_MS
    const likes = Math.round(audience * rate * 0.01 * (0.6 + rand() * 0.8))
    return {
      thumbnail: `https://picsum.photos/seed/${account.handle}-${account.platform}-${i}/320/320`,
      permalink: `${account.profile_url.replace(/\/$/, '')}/p/${account.handle.slice(0, 4)}${i}${Math.floor(rand() * 1e6).toString(36)}/`,
      likes,
      comments: Math.round(likes * (0.01 + rand() * 0.04)),
      posted_at: new Date(t).toISOString(),
    }
  })
}
