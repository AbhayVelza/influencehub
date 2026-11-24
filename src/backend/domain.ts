import { STAGE_META } from '@/lib/constants'
import { csvCell } from '@/lib/csv'
import { dayKey, formatDate, todayKey } from '@/lib/format'
import { can } from '@/lib/permissions'
import { audienceOf, instagramFollowers, normalizeHandle, PLATFORM_META, PLATFORMS, primaryAccount, toRef } from '@/lib/platforms'
import { fieldSchemas, MAX_TAGS, normalizeEmailField, normalizePhone } from '@/lib/schemas'
import { getAllowedTransitions, isOverride, ONBOARDED_OR_LATER, overrideBlockReason, STAGE_TRANSITIONS } from '@/lib/stages'
import type {
  Activity,
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
import {
  attachDocumentSummary,
  currentUser,
  db,
  documentSummaries,
  findInfluencer,
  logActivity,
  nextId,
  nowIso,
  everOnboarded,
  previousStageOf,
  refreshDerived,
  toSummary,
} from './db'
import { hasCurrentAgreement, hasInsightsSummary, purgeDocuments } from './documents'
import { buildAccount } from './social'

export { parseCsv } from '@/lib/csv'

// Same normalisation as the UI's validation, so the data layer accepts what the forms do.
export { normalizeHandle, normalizePhone }

// ---------------------------------------------------------------------------
// Filtering & sorting (shared by list, pipeline and export)

/** Every filter the list understands; `FilterKey`s that have options with counts are the facets. */
export type FilterKey =
  | 'q'
  | 'category'
  | 'country'
  | 'state'
  | 'city'
  | 'stage'
  | 'assigned_to'
  | 'platform'
  | 'reach'
  | 'followers'
  | 'agreement'
  | 'insights'

/**
 * Compiles the filter params into one function that returns the filters a row fails (none = it matches).
 * The list keeps rows that fail nothing; filter options keep rows that fail nothing but the facet being counted.
 * `limitedSearch`: match only fields an executive may see in the pool (no probing by phone or email).
 */
export function compileFilters(params: URLSearchParams, { limitedSearch = false } = {}): (inf: Influencer) => FilterKey[] {
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
  const followersMin = params.get('followers_min')
  const followersMax = params.get('followers_max')
  const agreement = params.get('agreement')
  const insights = params.get('insights')
  // Worked out once per request, not per influencer (NFR-01: 100,000 influencers).
  const active = Object.entries(sets)
    .filter(([, values]) => values.length)
    .map(([key, values]) => [key as keyof typeof sets, new Set(values)] as const)
  const summaryOf = agreement || insights ? documentSummaries() : null

  return (inf) => {
    const failed: FilterKey[] = []
    if (q) {
      const handles = inf.accounts.map((a) => a.handle)
      const fields = limitedSearch ? [inf.name, ...handles, inf.city] : [inf.name, ...handles, inf.email, inf.phone, inf.city]
      if (!fields.join(' ').toLowerCase().includes(q)) failed.push('q')
    }
    for (const [key, values] of active) {
      if (!values.has(String(inf[key] ?? ''))) failed.push(key)
    }
    if (platforms.length && !inf.accounts.some((a) => platforms.includes(a.platform))) failed.push('platform')
    if (min && (inf.total_reach == null || inf.total_reach < Number(min))) failed.push('reach')
    else if (max && (inf.total_reach == null || inf.total_reach > Number(max))) failed.push('reach')
    if (followersMin || followersMax) {
      // One account has to satisfy the whole range: on a selected platform, or on any when none is selected.
      const inRange = inf.accounts.some((a) => {
        if (platforms.length && !platforms.includes(a.platform)) return false
        const audience = audienceOf(a)
        return audience !== null && (!followersMin || audience >= Number(followersMin)) && (!followersMax || audience <= Number(followersMax))
      })
      if (!inRange) failed.push('followers')
    }
    if (summaryOf) {
      // Unassigned influencers have no documents to judge: they match neither "signed" nor "missing".
      const docs = summaryOf(inf)
      if (agreement && (!docs || docs.has_agreement !== (agreement === 'signed'))) failed.push('agreement')
      if (insights && (!docs || docs.insights_count > 0 !== (insights === 'received'))) failed.push('insights')
    }
    return failed
  }
}

/** The query parameters compileFilters reads: with none of them, nothing is filtered out. */
const FILTER_PARAMS = ['q', 'category', 'country', 'state', 'city', 'stage', 'assigned_to', 'platform', 'reach_min', 'reach_max', 'followers_min', 'followers_max', 'agreement', 'insights']

export function filterInfluencers(
  params: URLSearchParams,
  source: Influencer[] = db.influencers,
  options: { limitedSearch?: boolean } = {},
): Influencer[] {
  if (!FILTER_PARAMS.some((p) => params.has(p))) return [...source]
  const failures = compileFilters(params, options)
  return source.filter((inf) => failures(inf).length === 0)
}

const STAGE_ORDER: Stage[] = ['data_gathered', 'contacted', 'onboarded', 'package_sent', 'delivered', 'on_hold', 'rejected']

export function sortInfluencers(list: Influencer[], sort: string | null, platforms: string[] = []): Influencer[] {
  const raw = sort || '-created_at'
  const desc = raw.startsWith('-')
  const key = raw.replace(/^-/, '')
  const value = (inf: Influencer): string | number | null => {
    if (key === 'stage') return STAGE_ORDER.indexOf(inf.stage)
    if (key === 'followers') {
      const known = inf.accounts.filter((a) => !platforms.length || platforms.includes(a.platform)).map(audienceOf).filter((n): n is number => n !== null)
      return known.length ? Math.max(...known) : null
    }
    if (key === 'instagram_followers') return instagramFollowers(inf)
    const v = inf[key as keyof Influencer]
    return typeof v === 'number' || typeof v === 'string' ? v : null
  }
  // Each value is worked out once, not on every comparison (NFR-01: lists of 100,000).
  return list
    .map((inf) => ({ inf, v: value(inf) }))
    .sort(({ v: va }, { v: vb }) => {
      if (va == null && vb == null) return 0
      if (va == null) return 1 // nulls last regardless of direction
      if (vb == null) return -1
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : collate(String(va), String(vb))
      return desc ? -cmp : cmp
    })
    .map(({ inf }) => inf)
}

/** localeCompare's order, much faster over many strings. */
const collate = new Intl.Collator().compare

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

/** FR-INF-12: at most MAX_TAGS tags, each as the form takes it (trimmed, lower case, 1–30 characters); repeats dropped. */
export function cleanTags(tags: unknown): { ok: true; tags: string[] } | Failure {
  const fail = (message: string): Failure => ({ ok: false, status: 422, code: 'validation_error', message })
  if (!Array.isArray(tags)) return fail('Tags must be a list')
  const out: string[] = []
  for (const tag of tags) {
    const parsed = fieldSchemas.tag.safeParse(tag)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid tag')
    if (!out.includes(parsed.data)) out.push(parsed.data)
  }
  if (out.length > MAX_TAGS) return fail(`At most ${MAX_TAGS} tags`)
  return { ok: true, tags: out }
}

/** `createdAt`: a CSV row's "added on" date; defaults to now. */
export function createInfluencer(body: InfluencerCreate, source: 'lookup' | 'manual' | 'csv', createdAt?: string): CreateResult {
  const name = body.name?.trim()
  if (!name) return { ok: false, status: 422, code: 'validation_error', message: 'Name is required' }
  if (!body.category) return { ok: false, status: 422, code: 'validation_error', message: 'Category is required' }
  if (!Array.isArray(body.accounts) || body.accounts.length === 0) {
    return { ok: false, status: 422, code: 'validation_error', message: 'Add at least one social account' }
  }
  const checked = validateAccounts(body.accounts)
  if (!checked.ok) return checked as Failure
  const tags = cleanTags(body.tags ?? [])
  if (!tags.ok) return tags

  const now = createdAt ?? nowIso()
  const address = body.address ?? null
  const influencer: Influencer = {
    id: nextId('inf'),
    name,
    category: body.category,
    phone: normalizePhone(body.phone),
    email: normalizeEmailField(body.email),
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
    tags: tags.tags,
    notes: body.notes ?? null,
    onboarding_checklist: { called: false, agreement_signed: false, insights_received: false, address_collected: address != null, ig_connected: false },
    documents: null,
    created_at: now,
    updated_at: now,
  }
  influencer.accounts = body.accounts.map((a, i) => buildAccount(influencer, a, i === 0))
  refreshDerived(influencer)
  attachDocumentSummary(influencer)
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

/**
 * Executives see only influencers they own; unassigned ones are reachable only through the pool. Brand Specialists see
 * only onboarded creators (Onboarded, Welcome Kit, Delivered).
 */
export function canSee(user: User, inf: Influencer): boolean {
  if (user.role === 'brand_specialist') return ONBOARDED_OR_LATER.includes(inf.stage)
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

/**
 * What auto-release needs, from one pass over the activity log and the calls: each influencer's latest ownership
 * change (claim, assignment or release) and latest call. A scan per influencer would run on every request and cost
 * influencers × activities (NFR-01: 100,000 influencers).
 */
function buildClaimFacts() {
  const ownership = new Map<string, Activity>()
  for (const a of db.activities) {
    if (a.type === 'claimed' || a.type === 'assigned' || a.type === 'released') ownership.set(a.influencer_id, a)
  }
  const lastCall = new Map<string, string>()
  for (const c of db.calls) if ((lastCall.get(c.influencer_id) ?? '') < c.created_at) lastCall.set(c.influencer_id, c.created_at)
  // Current claims, time parsed once: auto-release checks only these, not every influencer, on every request.
  const claims: { influencerId: string; actor: string | null; at: string; ms: number }[] = []
  for (const a of ownership.values()) {
    if (a.type === 'claimed') claims.push({ influencerId: a.influencer_id, actor: a.actor, at: a.created_at, ms: Date.parse(a.created_at) })
  }
  return { ownership, lastCall, claims }
}

type ClaimFacts = ReturnType<typeof buildClaimFacts>

/**
 * Kept between requests (auto-release checks on every one): rebuilt when the activity log or the calls are replaced
 * or grow, or when a merge re-points them (`invalidateEverOnboarded`, which also drops this).
 */
let claimCache: { activities: unknown[]; activityCount: number; calls: unknown[]; callCount: number; facts: ClaimFacts } | null = null

export function invalidateClaimFacts() {
  claimCache = null
}

function claimFacts(): ClaimFacts {
  const c = claimCache
  if (c && c.activities === db.activities && c.activityCount === db.activities.length && c.calls === db.calls && c.callCount === db.calls.length) {
    return c.facts
  }
  const facts = buildClaimFacts()
  claimCache = { activities: db.activities, activityCount: db.activities.length, calls: db.calls, callCount: db.calls.length, facts }
  return facts
}

/** When the current owner claimed it, if their ownership came from a claim (not an assignment). */
function claimedAt(inf: Influencer, facts: ClaimFacts): string | null {
  if (!inf.assigned_to) return null
  const a = facts.ownership.get(inf.id)
  return a?.type === 'claimed' && a.actor === inf.assigned_to ? a.created_at : null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** When auto-release returns a claim to the pool: N days after claiming, unless a call has been logged since. */
function releaseAt(inf: Influencer, facts: ClaimFacts): string | null {
  const days = db.poolSettings.auto_release_days
  const claimed = days === null ? null : claimedAt(inf, facts)
  if (days === null || !claimed) return null
  if ((facts.lastCall.get(inf.id) ?? '') >= claimed) return null
  return new Date(Date.parse(claimed) + days * DAY_MS).toISOString()
}

/**
 * Auto-release (no scheduler without a server): runs before every request, in whoever's browser makes it. Returns how
 * many influencers it released (the API server saves after a read only when this or link expiry changed something).
 */
export function runAutoRelease(now = Date.now()): number {
  const days = db.poolSettings.auto_release_days
  if (days === null) return 0
  const facts = claimFacts()
  const window = days * DAY_MS
  let released = 0
  // releaseAt over the current claims only, without building a date string per claim (this runs on every request).
  for (const c of facts.claims) {
    if (c.ms + window > now) continue
    const inf = findInfluencer(c.influencerId)
    // Still owned through that claim (claimedAt), and no call logged since.
    if (!inf || !inf.assigned_to || inf.assigned_to !== c.actor || (facts.lastCall.get(inf.id) ?? '') >= c.at) continue
    releaseInfluencer(inf, `No call logged within ${days} days of claiming`, null, true)
    released += 1
  }
  return released
}

/** My claims that auto-release returns to the pool today or tomorrow (IST): the "one day before" warning. */
export function expiringClaims(user: User = currentUser()): ExpiringClaim[] {
  const tomorrow = todayKey(new Date(Date.now() + DAY_MS))
  const facts = claimFacts()
  return db.influencers
    .filter((i) => i.assigned_to === user.id)
    .flatMap((inf) => {
      const release_at = releaseAt(inf, facts)
      const claimed_at = claimedAt(inf, facts)
      return release_at && claimed_at && dayKey(release_at) <= tomorrow
        ? [{ influencer: toSummary(inf), claimed_at, release_at }]
        : []
    })
    .sort((a, b) => a.release_at.localeCompare(b.release_at))
}

/** Removes an influencer with its calls, Welcome Kits and activity. False if it doesn't exist. */
export function deleteInfluencer(id: string): boolean {
  const index = db.influencers.findIndex((i) => i.id === id)
  if (index === -1) return false
  db.influencers.splice(index, 1)
  db.calls = db.calls.filter((c) => c.influencer_id !== id)
  db.packages = db.packages.filter((p) => p.influencer_id !== id)
  db.activities = db.activities.filter((a) => a.influencer_id !== id)
  purgeDocuments(id)
  return true
}

// ---------------------------------------------------------------------------
// Stage changes

export type StageResult = { ok: true; influencer: Influencer } | { ok: false; status: number; code: string; message: string }

/**
 * `skipRequirements`: the caller has already proven the target stage's requirement some other way (a delivered
 * package moving an Onboarded creator through Welcome Kit). The transition rules still apply.
 * `allowOverride: false`: standard moves only, even for an admin (bulk changes and automatic moves, which carry no
 * override reason), so a refusal is reported as a plain "can't move" rather than an override rule.
 */
export function changeStage(
  inf: Influencer,
  to: Stage,
  reason: string | undefined,
  user: User = currentUser(),
  { skipRequirements = false, allowOverride = true }: { skipRequirements?: boolean; allowOverride?: boolean } = {},
): StageResult {
  if (!STAGE_ORDER.includes(to)) return { ok: false, status: 422, code: 'validation_error', message: 'Unknown stage' }
  if (inf.stage === to) return { ok: false, status: 422, code: 'invalid_transition', message: 'Already in this stage' }

  const previous = inf.stage === 'on_hold' ? previousStageOf(inf.id) : null
  const ctx = { previousStage: previous, everOnboarded: everOnboarded(inf) }
  if (!getAllowedTransitions(inf.stage, user.role, ctx, allowOverride).includes(to)) {
    // Only an actual reopen (Rejected → Data Gathered) is a matter of role; any other move out of Rejected is just not a move.
    if (inf.stage === 'rejected' && STAGE_TRANSITIONS.rejected.includes(to) && !can(user.role, 'stage:reopen')) {
      return { ok: false, status: 403, code: 'forbidden', message: 'Only managers and admins can reopen rejected influencers' }
    }
    // The override rule's own reason (src/lib/stages.ts), only where an override was on the table.
    const blocked = allowOverride && user.role === 'admin' ? overrideBlockReason(inf.stage, to, user.role, ctx) : null
    const label = (s: Stage) => STAGE_META[s].label
    return { ok: false, status: 422, code: 'invalid_transition', message: blocked ?? `Can’t move from ${label(inf.stage)} to ${label(to)}` }
  }

  const override = isOverride(inf.stage, to, user.role, previous)
  if (override && !reason) {
    return { ok: false, status: 422, code: 'reason_required', message: 'A reason is required to override the stage rules' }
  }
  // Agreements are the onboarding requirement that even an override can't skip.
  if (override && to === 'onboarded' && !hasCurrentAgreement(inf.id)) {
    return {
      ok: false,
      status: 422,
      code: 'requirement_missing',
      message: 'Upload the signed agreement before moving to Onboarded',
    }
  }
  if (!override && !skipRequirements) {
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
        message: 'Create a Welcome Kit with courier and tracking number before moving to Welcome Kit',
      }
    }
    // Entering Onboarded from Contacted needs a current agreement and an insights summary, collected together
    // (resuming from hold or a returned package doesn't).
    if (to === 'onboarded' && inf.stage === 'contacted') {
      const missing = [
        !hasCurrentAgreement(inf.id) && 'the signed agreement',
        !hasInsightsSummary(inf.id) && 'an insights summary',
      ].filter(Boolean)
      if (missing.length) {
        return {
          ok: false,
          status: 422,
          code: 'requirement_missing',
          message: `Upload ${missing.join(' and ')} before moving to Onboarded`,
        }
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
    const details = EXPORT_COLUMNS.map((col) =>
      csvCell(col === 'assigned_to' ? team.get(inf.assigned_to ?? '') : col === 'created_at' ? formatDate(inf.created_at) : inf[col]),
    )
    const handles = PLATFORMS.map((p) => csvCell(inf.accounts.filter((a) => a.platform === p).map((a) => a.handle).join('; ')))
    lines.push([...details, ...handles].join(','))
  }
  return lines.join('\n')
}
