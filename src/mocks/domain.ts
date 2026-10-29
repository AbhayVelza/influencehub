import { csvCell } from '@/lib/csv'
import { dayKey, todayKey } from '@/lib/format'
import { can } from '@/lib/permissions'
import { normalizeHandle, normalizePhone } from '@/lib/schemas'
import { getAllowedTransitions, isOverride } from '@/lib/stages'
import type {
  CheckHandleResponse,
  ExpiringClaim,
  Influencer,
  InfluencerCreate,
  InstagramProfile,
  PoolItem,
  Stage,
  User,
} from '@/types'
import { currentUser, db, findInfluencer, logActivity, nextId, nowIso, previousStageOf, toSummary } from './db'
import { JobFailure } from './jobs'

export { parseCsv } from '@/lib/csv'

// Same normalisation as the UI's validation, so the mock behaves like the forms expect.
export { normalizeHandle, normalizePhone }

// ---------------------------------------------------------------------------
// Filtering & sorting (shared by list, pipeline and export)

/** `limitedSearch`: match only fields an executive may see in the pool (no probing by phone or email). */
export function filterInfluencers(
  params: URLSearchParams,
  source: Influencer[] = db.influencers,
  { limitedSearch = false } = {},
): Influencer[] {
  const q = params.get('q')?.trim().toLowerCase()
  const sets = {
    category: params.getAll('category'),
    country: params.getAll('country'),
    state: params.getAll('state'),
    city: params.getAll('city'),
    stage: params.getAll('stage'),
    assigned_to: params.getAll('assigned_to'),
  }
  const min = params.get('followers_min')
  const max = params.get('followers_max')

  return source.filter((inf) => {
    if (q) {
      const fields = limitedSearch
        ? [inf.name, inf.instagram_handle, inf.city]
        : [inf.name, inf.instagram_handle, inf.email, inf.phone, inf.city]
      const haystack = fields.join(' ').toLowerCase()
      if (!haystack.includes(q.replace(/^@/, ''))) return false
    }
    for (const [key, values] of Object.entries(sets)) {
      if (values.length && !values.includes(String(inf[key as keyof typeof sets] ?? ''))) return false
    }
    if (min && (inf.followers == null || inf.followers < Number(min))) return false
    if (max && (inf.followers == null || inf.followers > Number(max))) return false
    return true
  })
}

const STAGE_ORDER: Stage[] = ['data_gathered', 'contacted', 'onboarded', 'package_sent', 'delivered', 'on_hold', 'rejected']

export function sortInfluencers(list: Influencer[], sort: string | null): Influencer[] {
  const raw = sort || '-created_at'
  const desc = raw.startsWith('-')
  const key = raw.replace(/^-/, '') as keyof Influencer
  const value = (inf: Influencer): string | number | null => {
    if (key === 'stage') return STAGE_ORDER.indexOf(inf.stage)
    const v = inf[key]
    return typeof v === 'number' || typeof v === 'string' ? v : null
  }
  return [...list].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1 // nulls last regardless of direction
    if (vb == null) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return desc ? -cmp : cmp
  })
}

// ---------------------------------------------------------------------------
// Create

export type CreateResult = { ok: true; influencer: Influencer } | { ok: false; status: number; code: string; message: string }

export function createInfluencer(body: InfluencerCreate, source: 'instagram' | 'manual' | 'csv'): CreateResult {
  const name = body.name?.trim()
  const handle = body.instagram_handle ? normalizeHandle(body.instagram_handle) : ''
  if (!name) return { ok: false, status: 422, code: 'validation_error', message: 'Name is required' }
  if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle)) {
    return { ok: false, status: 422, code: 'validation_error', message: 'Enter a valid Instagram handle' }
  }
  if (!body.category) return { ok: false, status: 422, code: 'validation_error', message: 'Category is required' }
  if (db.influencers.some((i) => i.instagram_handle === handle)) {
    return { ok: false, status: 409, code: 'handle_taken', message: `@${handle} is already in the CRM` }
  }

  const accountType = body.account_type ?? 'unknown'
  const hasIgData = body.followers != null && (accountType === 'business' || accountType === 'creator')
  const now = nowIso()
  const address = body.address ?? null
  const influencer: Influencer = {
    id: nextId('inf'),
    name,
    category: body.category,
    instagram_handle: handle,
    profile_url: `https://www.instagram.com/${handle}/`,
    phone: normalizePhone(body.phone),
    email: body.email?.trim().toLowerCase() || null,
    address,
    city: body.city ?? address?.city ?? null,
    state: body.state ?? address?.state ?? null,
    country: body.country ?? address?.country ?? null,
    followers: body.followers ?? null,
    following: body.following ?? null,
    posts_count: body.posts_count ?? null,
    engagement_rate: body.engagement_rate ?? null,
    bio: body.bio ?? null,
    is_verified: body.is_verified ?? false,
    account_type: accountType,
    profile_pic_url: body.profile_pic_url ?? null,
    ig_sync_status: accountType === 'personal' ? 'not_synced' : hasIgData ? 'synced' : 'pending',
    last_synced_at: hasIgData ? now : null,
    stage: 'data_gathered',
    assigned_to: body.assigned_to ?? null,
    tags: body.tags ?? [],
    notes: body.notes ?? null,
    onboarding_checklist: { called: false, terms_agreed: false, address_collected: address != null, ig_connected: false },
    created_at: now,
    updated_at: now,
  }
  db.influencers.unshift(influencer)
  logActivity(influencer.id, 'created', { source })
  if (influencer.assigned_to) logActivity(influencer.id, 'assigned', { from: null, to: influencer.assigned_to })
  return { ok: true, influencer }
}

/** Managers/admins can set any owner. Executives only pick themselves or nobody when they add an influencer. */
export function canSetOwnerOnCreate(user: User, to: string | null): boolean {
  return can(user.role, 'influencer:reassign') || to === null || to === user.id
}

export const OWNER_CHANGE_MESSAGE = 'Executives take influencers by claiming them from the pool, and hand them back by releasing'

// ---------------------------------------------------------------------------
// Visibility and the Unassigned Pool

/** Executives see only influencers they own; unassigned ones are reachable only through the pool. */
export function canSee(user: User, inf: Influencer): boolean {
  return user.role !== 'executive' || inf.assigned_to === user.id
}

export const visibleInfluencers = (user: User = currentUser()) => db.influencers.filter((i) => canSee(user, i))

/** The influencer if this user may see it; otherwise undefined, which handlers answer with 404. */
export function findVisible(id: string, user: User = currentUser()): Influencer | undefined {
  const inf = findInfluencer(id)
  return inf && canSee(user, inf) ? inf : undefined
}

export const poolInfluencers = () => db.influencers.filter((i) => i.assigned_to === null)

/** Executives get a preview: no phone, email, address, notes, tags or Instagram internals. */
export function toPoolItem(inf: Influencer, user: User = currentUser()): PoolItem {
  if (user.role !== 'executive') return inf
  const { id, name, category, instagram_handle, profile_url, profile_pic_url, is_verified, followers, city, state, country, stage, created_at } =
    inf
  return { id, name, category, instagram_handle, profile_url, profile_pic_url, is_verified, followers, city, state, country, stage, created_at }
}

/** Duplicate check as this user may see it: an executive learns that a teammate owns the handle, not which influencer. */
export function handleStatus(handle: string, user: User = currentUser()): CheckHandleResponse {
  const existing = db.influencers.find((i) => i.instagram_handle === handle)
  if (!existing) return { available: true, influencer_id: null, conflict: null }
  if (existing.assigned_to === null) return { available: false, influencer_id: existing.id, conflict: 'in_pool' }
  if (canSee(user, existing)) return { available: false, influencer_id: existing.id, conflict: 'exists' }
  return { available: false, influencer_id: null, conflict: 'assigned_to_other' }
}

export const inPoolMessage = (handle: string) => `@${handle} is already in the Unassigned Pool`
export const assignedToOtherMessage = (handle: string) => `@${handle} is already in the CRM, owned by a teammate`

type Failure = { ok: false; status: number; code: string; message: string }

/** Atomic: succeeds only while the influencer is unassigned (or already mine). */
export function claimInfluencer(inf: Influencer, user: User = currentUser()): { ok: true; influencer: Influencer } | Failure {
  if (inf.assigned_to === user.id) return { ok: true, influencer: inf }
  if (inf.assigned_to) return { ok: false, status: 409, code: 'already_claimed', message: 'Already claimed by a teammate' }
  const limit = db.poolSettings.claim_limit
  if (limit !== null && user.role === 'executive' && inf.stage === 'data_gathered') {
    const held = db.influencers.filter((i) => i.assigned_to === user.id && i.stage === 'data_gathered').length
    if (held >= limit) {
      return {
        ok: false,
        status: 409,
        code: 'claim_limit_reached',
        message: `You already hold ${held} uncontacted influencer${held === 1 ? '' : 's'} (the limit is ${limit}). Contact some before claiming more.`,
      }
    }
  }
  inf.assigned_to = user.id
  inf.updated_at = nowIso()
  logActivity(inf.id, 'claimed', {}, user.id)
  return { ok: true, influencer: inf }
}

/** Returns an influencer to the pool. `actor` null = the auto-release job. */
export function releaseInfluencer(inf: Influencer, reason: string, actor: string | null, auto = false) {
  const from = inf.assigned_to
  inf.assigned_to = null
  inf.updated_at = nowIso()
  logActivity(inf.id, 'released', auto ? { from, reason, auto: true } : { from, reason }, actor)
}

/** When the current owner claimed it, if their ownership came from a claim (not an assignment). */
function claimedAt(inf: Influencer): string | null {
  if (!inf.assigned_to) return null
  for (let i = db.activities.length - 1; i >= 0; i--) {
    const a = db.activities[i]!
    if (a.influencer_id !== inf.id) continue
    if (a.type === 'claimed') return a.actor === inf.assigned_to ? a.created_at : null
    if (a.type === 'assigned' || a.type === 'released') return null
  }
  return null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** When auto-release returns a claim to the pool: N days after claiming, unless a call has been logged since. */
function releaseAt(inf: Influencer): string | null {
  const days = db.poolSettings.auto_release_days
  const claimed = days === null ? null : claimedAt(inf)
  if (days === null || !claimed) return null
  if (db.calls.some((c) => c.influencer_id === inf.id && c.created_at >= claimed)) return null
  return new Date(Date.parse(claimed) + days * DAY_MS).toISOString()
}

/** The backend's scheduled auto-release job. The mock runs it before every request. */
export function runAutoRelease(now = Date.now()) {
  const days = db.poolSettings.auto_release_days
  if (days === null) return
  for (const inf of db.influencers) {
    const at = releaseAt(inf)
    if (at && Date.parse(at) <= now) releaseInfluencer(inf, `No call logged within ${days} days of claiming`, null, true)
  }
}

/** My claims that auto-release returns to the pool today or tomorrow (IST): the "one day before" warning. */
export function expiringClaims(user: User = currentUser()): ExpiringClaim[] {
  const tomorrow = todayKey(new Date(Date.now() + DAY_MS))
  return db.influencers
    .filter((i) => i.assigned_to === user.id)
    .flatMap((inf) => {
      const release_at = releaseAt(inf)
      const claimed_at = claimedAt(inf)
      return release_at && claimed_at && dayKey(release_at) <= tomorrow
        ? [{ influencer: toSummary(inf), claimed_at, release_at }]
        : []
    })
    .sort((a, b) => a.release_at.localeCompare(b.release_at))
}

/** Removes an influencer with its calls, packages and activity. False if it doesn't exist. */
export function deleteInfluencer(id: string): boolean {
  const index = db.influencers.findIndex((i) => i.id === id)
  if (index === -1) return false
  db.influencers.splice(index, 1)
  db.calls = db.calls.filter((c) => c.influencer_id !== id)
  db.packages = db.packages.filter((p) => p.influencer_id !== id)
  db.activities = db.activities.filter((a) => a.influencer_id !== id)
  return true
}

// ---------------------------------------------------------------------------
// Stage changes

export type StageResult = { ok: true; influencer: Influencer } | { ok: false; status: number; code: string; message: string }

export function changeStage(inf: Influencer, to: Stage, reason: string | undefined, user: User = currentUser()): StageResult {
  if (!STAGE_ORDER.includes(to)) return { ok: false, status: 422, code: 'validation_error', message: 'Unknown stage' }
  if (inf.stage === to) return { ok: false, status: 422, code: 'invalid_transition', message: 'Already in this stage' }

  const previous = inf.stage === 'on_hold' ? previousStageOf(inf.id) : null
  if (!getAllowedTransitions(inf.stage, user.role, previous).includes(to)) {
    if (inf.stage === 'rejected' && !can(user.role, 'stage:reopen')) {
      return { ok: false, status: 403, code: 'forbidden', message: 'Only managers and admins can reopen rejected influencers' }
    }
    return { ok: false, status: 422, code: 'invalid_transition', message: `Cannot move from ${inf.stage} to ${to}` }
  }

  const override = isOverride(inf.stage, to, user.role, previous)
  if (override && !reason) {
    return { ok: false, status: 422, code: 'reason_required', message: 'A reason is required to override the stage rules' }
  }
  if (!override) {
    if (to === 'contacted' && !db.calls.some((c) => c.influencer_id === inf.id && c.outcome === 'interested')) {
      return {
        ok: false,
        status: 422,
        code: 'requirement_missing',
        message: 'Log a call with outcome "Interested" before moving to Contacted',
      }
    }
    if (
      to === 'package_sent' &&
      !db.packages.some((p) => p.influencer_id === inf.id && p.courier && p.tracking_number)
    ) {
      return {
        ok: false,
        status: 422,
        code: 'requirement_missing',
        message: 'Create a package with courier and tracking number before moving to Package Sent',
      }
    }
  }

  const from = inf.stage
  inf.stage = to
  inf.updated_at = nowIso()
  const payload: Record<string, unknown> = { from, to }
  if (reason) payload.reason = reason
  if (override) payload.override = true
  logActivity(inf.id, 'stage_changed', payload, user.id)
  return { ok: true, influencer: inf }
}

// ---------------------------------------------------------------------------
// Instagram simulation

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

function titleCase(username: string): string {
  return username
    .replace(/[._\d]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Deterministic fake profile. Usernames containing "personal", "notfound" or "ratelimit"
 * simulate the matching Instagram errors.
 */
export function lookupInstagram(username: string): InstagramProfile {
  if (username.includes('ratelimit')) {
    throw new JobFailure('rate_limited', 'Instagram rate limit reached. Try again in a few minutes.')
  }
  if (username.includes('notfound')) {
    throw new JobFailure('not_found', `No Instagram account found for @${username}`)
  }
  if (username.includes('personal')) {
    throw new JobFailure(
      'personal_account',
      `@${username} is a personal account. Instagram only shares data for Business and Creator accounts — add details manually.`,
    )
  }
  const h = hash(username)
  const followers = 4000 + (h % 900_000)
  return {
    username,
    name: titleCase(username) || username,
    bio: 'Creator • Collabs via DM',
    followers,
    following: 150 + (h % 1500),
    posts_count: 80 + (h % 2000),
    engagement_rate: Math.round((1 + (h % 700) / 100) * 100) / 100,
    is_verified: followers > 700_000,
    account_type: h % 3 === 0 ? 'business' : 'creator',
    profile_pic_url: `https://i.pravatar.cc/300?u=${username}`,
    profile_url: `https://www.instagram.com/${username}/`,
  }
}

/** Applied when a sync job finishes. */
export function completeSync(id: string): { influencer_id: string; followers: number | null } {
  const inf = findInfluencer(id)
  if (!inf) throw new JobFailure('not_found', 'Influencer no longer exists')
  if (inf.account_type === 'personal') {
    inf.ig_sync_status = 'not_synced'
    throw new JobFailure(
      'personal_account',
      'This is a personal account. Instagram only shares data for Business and Creator accounts.',
    )
  }
  if (inf.account_type === 'unknown' && inf.ig_sync_status === 'error') {
    throw new JobFailure('not_found', `No Instagram account found for @${inf.instagram_handle}`)
  }
  // Same simulated failures as the lookup: handles containing "personal", "notfound" or "ratelimit".
  let profile: InstagramProfile
  try {
    profile = lookupInstagram(inf.instagram_handle)
  } catch (err) {
    if (err instanceof JobFailure && err.code === 'personal_account') {
      inf.account_type = 'personal'
      inf.ig_sync_status = 'not_synced'
    } else {
      inf.ig_sync_status = 'error'
    }
    inf.updated_at = nowIso()
    throw err
  }
  if (inf.followers == null) {
    Object.assign(inf, {
      followers: profile.followers,
      following: profile.following,
      posts_count: profile.posts_count,
      engagement_rate: profile.engagement_rate,
      bio: profile.bio,
      is_verified: profile.is_verified,
      account_type: profile.account_type,
      profile_pic_url: profile.profile_pic_url,
    })
  } else {
    inf.followers = Math.round(inf.followers * (1 + Math.random() * 0.01))
  }
  inf.ig_sync_status = 'synced'
  inf.last_synced_at = nowIso()
  inf.updated_at = inf.last_synced_at
  logActivity(inf.id, 'ig_synced', { followers: inf.followers }, null)
  return { influencer_id: inf.id, followers: inf.followers }
}

// ---------------------------------------------------------------------------
// CSV

export const EXPORT_COLUMNS: (keyof Influencer)[] = [
  'name',
  'instagram_handle',
  'category',
  'followers',
  'engagement_rate',
  'phone',
  'email',
  'city',
  'state',
  'country',
  'stage',
  'assigned_to',
  'ig_sync_status',
  'last_synced_at',
  'tags',
  'created_at',
]

export function toCsv(list: Influencer[]): string {
  const team = new Map(db.team.map((u) => [u.id, u.name]))
  const lines = [EXPORT_COLUMNS.join(',')]
  for (const inf of list) {
    lines.push(
      EXPORT_COLUMNS.map((col) => csvCell(col === 'assigned_to' ? team.get(inf.assigned_to ?? '') : inf[col])).join(','),
    )
  }
  return lines.join('\n')
}
