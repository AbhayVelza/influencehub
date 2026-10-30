import { csvCell } from '@/lib/csv'
import { dayKey, todayKey } from '@/lib/format'
import { can } from '@/lib/permissions'
import { audienceOf, normalizeHandle, PLATFORM_META, PLATFORMS, primaryAccount, toRef } from '@/lib/platforms'
import { normalizePhone } from '@/lib/schemas'
import { getAllowedTransitions, isOverride } from '@/lib/stages'
import type {
  AccountCreate,
  CheckHandleResponse,
  ExpiringClaim,
  Influencer,
  InfluencerCreate,
  Platform,
  PoolItem,
  Stage,
  User,
} from '@/types'
import { currentUser, db, findInfluencer, logActivity, nextId, nowIso, previousStageOf, refreshDerived, toSummary } from './db'
import { buildAccount } from './social'

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
  const q = params.get('q')?.trim().toLowerCase().replace(/^@/, '')
  const sets = {
    category: params.getAll('category'),
    country: params.getAll('country'),
    state: params.getAll('state'),
    city: params.getAll('city'),
    stage: params.getAll('stage'),
    assigned_to: params.getAll('assigned_to'),
  }
  const platforms = params.getAll('platform')
  const min = params.get('reach_min')
  const max = params.get('reach_max')

  return source.filter((inf) => {
    if (q) {
      const handles = inf.accounts.map((a) => a.handle)
      const fields = limitedSearch ? [inf.name, ...handles, inf.city] : [inf.name, ...handles, inf.email, inf.phone, inf.city]
      if (!fields.join(' ').toLowerCase().includes(q)) return false
    }
    for (const [key, values] of Object.entries(sets)) {
      if (values.length && !values.includes(String(inf[key as keyof typeof sets] ?? ''))) return false
    }
    if (platforms.length && !inf.accounts.some((a) => platforms.includes(a.platform))) return false
    if (min && (inf.total_reach == null || inf.total_reach < Number(min))) return false
    if (max && (inf.total_reach == null || inf.total_reach > Number(max))) return false
    return true
  })
}

const STAGE_ORDER: Stage[] = ['data_gathered', 'contacted', 'onboarded', 'package_sent', 'delivered', 'on_hold', 'rejected']

export function sortInfluencers(list: Influencer[], sort: string | null): Influencer[] {
  const raw = sort || '-created_at'
  const desc = raw.startsWith('-')
  const key = raw.replace(/^-/, '')
  const value = (inf: Influencer): string | number | null => {
    if (key === 'stage') return STAGE_ORDER.indexOf(inf.stage)
    if (key === 'primary_followers') {
      const primary = primaryAccount(inf)
      return primary && audienceOf(primary)
    }
    const v = inf[key as keyof Influencer]
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

const HANDLE = /^[a-z0-9._-]{1,60}$/

/** Checks new accounts: known platform, valid handle, not repeated, not already in the CRM. */
export function validateAccounts(accounts: AccountCreate[] | undefined, ownerId?: string): { ok: true } | Failure {
  const seen = new Set<string>()
  for (const a of accounts ?? []) {
    if (!PLATFORMS.includes(a?.platform)) return { ok: false, status: 422, code: 'validation_error', message: 'Unknown platform' }
    const handle = normalizeHandle(a.handle ?? '', a.platform)
    const label = PLATFORM_META[a.platform].label
    if (!HANDLE.test(handle)) return { ok: false, status: 422, code: 'validation_error', message: `Enter a valid ${label} handle` }
    const key = `${a.platform}:${handle}`
    if (seen.has(key)) return { ok: false, status: 422, code: 'validation_error', message: `${label} @${handle} is listed twice` }
    seen.add(key)
    const existing = findByHandle(a.platform, handle)
    if (existing && existing.id !== ownerId) {
      return { ok: false, status: 409, code: 'handle_taken', message: `${label} @${handle} is already in the CRM` }
    }
  }
  return { ok: true }
}

export function createInfluencer(body: InfluencerCreate, source: 'lookup' | 'manual' | 'csv'): CreateResult {
  const name = body.name?.trim()
  if (!name) return { ok: false, status: 422, code: 'validation_error', message: 'Name is required' }
  if (!body.category) return { ok: false, status: 422, code: 'validation_error', message: 'Category is required' }
  if (!Array.isArray(body.accounts) || body.accounts.length === 0) {
    return { ok: false, status: 422, code: 'validation_error', message: 'Add at least one social account' }
  }
  const checked = validateAccounts(body.accounts)
  if (!checked.ok) return checked

  const now = nowIso()
  const address = body.address ?? null
  const influencer: Influencer = {
    id: nextId('inf'),
    name,
    category: body.category,
    phone: normalizePhone(body.phone),
    email: body.email?.trim().toLowerCase() || null,
    address,
    city: body.city ?? address?.city ?? null,
    state: body.state ?? address?.state ?? null,
    country: body.country ?? address?.country ?? null,
    profile_pic_url: null,
    is_verified: false,
    accounts: [],
    total_reach: null,
    stage: 'data_gathered',
    assigned_to: body.assigned_to ?? null,
    tags: body.tags ?? [],
    notes: body.notes ?? null,
    onboarding_checklist: { called: false, terms_agreed: false, address_collected: address != null, ig_connected: false },
    created_at: now,
    updated_at: now,
  }
  influencer.accounts = body.accounts.map((a, i) => buildAccount(influencer, a, i === 0))
  refreshDerived(influencer)
  db.influencers.unshift(influencer)
  logActivity(influencer.id, 'created', { source })
  if (influencer.assigned_to) logActivity(influencer.id, 'assigned', { from: null, to: influencer.assigned_to })
  return { ok: true, influencer }
}

export function findByHandle(platform: Platform, handle: string): Influencer | undefined {
  return db.influencers.find((i) => i.accounts.some((a) => a.platform === platform && a.handle === handle))
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

/** Executives get a preview: no phone, email, address, notes, tags or account details beyond the handles. */
export function toPoolItem(inf: Influencer, user: User = currentUser()): PoolItem {
  if (user.role !== 'executive') return inf
  const { id, name, category, profile_pic_url, is_verified, total_reach, city, state, country, stage, created_at } = inf
  const primary = primaryAccount(inf)
  return {
    id,
    name,
    category,
    profile_pic_url,
    is_verified,
    total_reach,
    city,
    state,
    country,
    stage,
    created_at,
    primary_account: primary ? toRef(primary) : null,
    platforms: [...new Set(inf.accounts.map((a) => a.platform))],
  }
}

/** Duplicate check as this user may see it: an executive learns that a teammate owns the handle, not which influencer. */
export function handleStatus(platform: Platform, handle: string, user: User = currentUser()): CheckHandleResponse {
  const existing = findByHandle(platform, handle)
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
// CSV

const EXPORT_COLUMNS = ['name', 'category', 'total_reach', 'phone', 'email', 'city', 'state', 'country', 'stage', 'assigned_to', 'tags', 'created_at'] as const

/** One handle column per platform, after the details. */
export function toCsv(list: Influencer[]): string {
  const team = new Map(db.team.map((u) => [u.id, u.name]))
  const lines = [[...EXPORT_COLUMNS, ...PLATFORMS].join(',')]
  for (const inf of list) {
    const details = EXPORT_COLUMNS.map((col) => csvCell(col === 'assigned_to' ? team.get(inf.assigned_to ?? '') : inf[col]))
    const handles = PLATFORMS.map((p) => csvCell(inf.accounts.filter((a) => a.platform === p).map((a) => a.handle).join('; ')))
    lines.push([...details, ...handles].join(','))
  }
  return lines.join('\n')
}
