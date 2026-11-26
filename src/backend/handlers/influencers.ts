import { http, HttpResponse } from 'msw'
import { ALL_STAGES, CALL_OUTCOME_META, STAGE_META } from '@/lib/constants'
import { can } from '@/lib/permissions'
import { PLATFORM_META, PLATFORMS } from '@/lib/platforms'
import type {
  RejectedInfluencer,
  BulkRequest,
  BulkResult,
  BulkSyncResult,
  CallLog,
  CallLogCreated,
  CallLogCreate,
  FilterOption,
  FilterOptions,
  Influencer,
  InfluencerCreate,
  InfluencerUpdate,
  Platform,
  ReleaseRequest,
  Stage,
  StageChangeRequest,
} from '@/types'
import { formatDateTime } from '@/lib/format'
import { currentUser, db, documentSummaries, findAccount, findInfluencer, logActivity, nextId, nowIso } from '../db'
import {
  cleanTags,
  assignedToOtherMessage,
  canSetOwnerOnCreate,
  changeStage,
  claimInfluencer,
  compileFilters,
  createInfluencer,
  deleteInfluencer,
  filterInfluencers,
  findVisible,
  handleStatus,
  inPoolMessage,
  normalizeHandle,
  normalizePhone,
  OWNER_CHANGE_MESSAGE,
  releaseInfluencer,
  sortInfluencers,
  visibleInfluencers,
} from '../domain'
import { createJob } from '../jobs'
import { connectedPlatforms, queueSync, switchToAutoSync, syncAccount } from '../social'
import { all, api, apiError, forbidden, notFound, paginate, readJson } from '../utils'
import { publicDocument } from '../documents'

/** The minute a date-time falls in, so two follow-ups at 05:00 PM clash whatever their seconds. */
const minuteOf = (iso: string) => Math.floor(Date.parse(iso) / 60_000)

/** A full ISO timestamp with a time and a zone (what the Log Call dialog sends); a bare date like 2026-11-07 isn't. */
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
  !Number.isNaN(Date.parse(value))

type Facet = 'category' | 'country' | 'state' | 'city' | 'stage' | 'assigned_to' | 'platform' | 'agreement' | 'insights'

/**
 * Filter options with counts over `source`, in one pass over the rows.
 *
 * Counts are faceted: an option's count is the number of influencers that match every active filter except the
 * options' own facet (ticking more options of one facet widens it, other facets narrow it), so it is what ticking
 * that option would show. The option lists themselves stay put: states are those of the selected countries, cities
 * those of the selected states (a selected value with no matches stays listed with count 0), so choices are never
 * pulled out from under the user. A row that fails two or more filters counts nowhere.
 */
export function filterOptionsFor(source: Influencer[], params: URLSearchParams, options: { limitedSearch?: boolean } = {}): FilterOptions {
  const failures = compileFilters(params, options)
  const summaryOf = documentSummaries()
  const team = new Map(db.team.map((u) => [u.id, u.name]))
  const counts: Record<Facet, Map<string, number>> = {
    category: new Map(),
    country: new Map(),
    state: new Map(),
    city: new Map(),
    stage: new Map(ALL_STAGES.map((s) => [s, 0])),
    assigned_to: new Map(),
    platform: new Map(PLATFORMS.map((p) => [p, 0])),
    agreement: new Map([['signed', 0], ['missing', 0]]),
    insights: new Map([['received', 0], ['missing', 0]]),
  }
  const add = (facet: Facet, value: string | null | undefined, counted: boolean) => {
    if (!value) return
    const map = counts[facet]
    map.set(value, (map.get(value) ?? 0) + (counted ? 1 : 0))
  }

  for (const inf of source) {
    const failed = failures(inf)
    // The row counts for a facet when nothing but that facet's own filter rules it out.
    const counted = (facet: Facet) => failed.every((f) => f === facet)
    // Hierarchy: a state is listed once its country is selected (or none is), a city once its state is too.
    const inCountries = !failed.includes('country')
    const inStates = inCountries && !failed.includes('state')

    add('category', inf.category, counted('category'))
    add('country', inf.country, counted('country'))
    if (inCountries) add('state', inf.state, counted('state'))
    if (inStates) add('city', inf.city, counted('city'))
    add('stage', inf.stage, counted('stage'))
    add('assigned_to', inf.assigned_to, counted('assigned_to'))
    for (const platform of new Set(inf.accounts.map((a) => a.platform))) add('platform', platform, counted('platform'))
    const docs = summaryOf(inf)
    if (docs) {
      add('agreement', docs.has_agreement ? 'signed' : 'missing', counted('agreement'))
      add('insights', docs.insights_count > 0 ? 'received' : 'missing', counted('insights'))
    }
  }

  const list = (facet: Facet, label = (v: string) => v, keepOrder = false): FilterOption[] => {
    const options = [...counts[facet].entries()].map(([value, count]) => ({ value, label: label(value), count }))
    return keepOrder ? options : options.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }
  return {
    categories: list('category'),
    countries: list('country'),
    states: list('state'),
    cities: list('city'),
    stages: list('stage', (v) => STAGE_META[v as Stage].label, true),
    assigned_to: list('assigned_to', (id) => team.get(id) ?? id),
    platforms: list('platform', (v) => PLATFORM_META[v as Platform].label, true),
    agreement: list('agreement', (v) => (v === 'signed' ? 'Signed' : 'Missing'), true),
    insights: list('insights', (v) => (v === 'received' ? 'Received' : 'Missing'), true),
  }
}

/** Accounts a sync can refresh: public lookups, and connect accounts the creator has connected. */
export const syncableAccounts = (inf: Influencer) =>
  inf.accounts.filter((a) => a.sync_method === 'lookup' || (a.sync_method === 'connect' && a.connect_status === 'connected'))

/** 409 when any of these handles is already in the CRM, in the shape the caller may see. */
export function accountConflict(accounts: { platform: Platform; handle: string }[] | undefined) {
  for (const a of accounts ?? []) {
    if (!PLATFORMS.includes(a?.platform)) continue
    const handle = normalizeHandle(a.handle ?? '', a.platform)
    const status = handleStatus(a.platform, handle)
    const label = `${PLATFORM_META[a.platform].label} @${handle}`
    if (status.conflict === 'in_pool') return apiError(409, 'in_pool', inPoolMessage(label))
    if (status.conflict === 'assigned_to_other') return apiError(409, 'assigned_to_other', assignedToOtherMessage(label))
    if (status.conflict === 'exists') return apiError(409, 'handle_taken', `${label} is already in the CRM`)
  }
  return null
}

const CALL_OUTCOMES = ['interested', 'not_interested', 'call_back', 'no_answer', 'wrong_number']

// Executives only ever reach influencers they own: everything else answers 404 (unassigned ones via /pool).
export const influencerHandlers = [
  http.get(api('/influencers'), async ({ request }) => {
    const params = new URL(request.url).searchParams
    // Rejected influencers live in the Rejected tab: listed here only when the stage filter asks for them.
    const source = params.has('stage') ? visibleInfluencers() : visibleInfluencers().filter((i) => i.stage !== 'rejected')
    const list = sortInfluencers(filterInfluencers(params, source), params.get('sort'), params.getAll('platform'))
    return HttpResponse.json(paginate(list, params))
  }),

  // The Rejected tab: name and Instagram handle only, newest rejection first (the whole list; rows are small).
  http.get(api('/influencers/rejected'), async () => {
    if (!can(currentUser().role, 'crm:access')) return forbidden()
    const rows: RejectedInfluencer[] = visibleInfluencers()
      .filter((i) => i.stage === 'rejected')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((i) => ({ id: i.id, name: i.name, instagram: i.accounts.find((a) => a.platform === 'instagram')?.handle ?? null }))
    return HttpResponse.json(all(rows))
  }),

  http.get(api('/influencers/filter-options'), async ({ request }) => {
    return HttpResponse.json(filterOptionsFor(visibleInfluencers(), new URL(request.url).searchParams))
  }),

  http.get(api('/influencers/check-handle'), async ({ request }) => {
    const params = new URL(request.url).searchParams
    const platform = (params.get('platform') ?? 'instagram') as Platform
    if (!PLATFORMS.includes(platform)) return apiError(422, 'validation_error', 'Unknown platform')
    return HttpResponse.json(handleStatus(platform, normalizeHandle(params.get('handle') ?? '', platform)))
  }),

  http.post(api('/influencers/bulk'), async ({ request }) => {
    const body = await readJson<BulkRequest>(request)
    const user = currentUser()
    const ids = Array.isArray(body.ids) ? body.ids : []
    if (!ids.length) return apiError(422, 'validation_error', 'Select at least one influencer')
    const result: BulkResult = { succeeded: [], failed: [], job_id: null }
    const notFoundRow = (id: string) => result.failed.push({ id, code: 'not_found', message: 'Influencer not found' })

    if (body.action === 'change_stage') {
      for (const id of ids) {
        const inf = findVisible(id, user)
        if (!inf) {
          notFoundRow(id)
          continue
        }
        const res = changeStage(inf, body.value as Influencer['stage'], undefined, user, { allowOverride: false })
        if (res.ok) result.succeeded.push(id)
        else result.failed.push({ id, code: res.code, message: res.message })
      }
    } else if (body.action === 'assign') {
      const to = body.value ?? null
      if (!can(user.role, 'influencer:reassign')) return forbidden(OWNER_CHANGE_MESSAGE)
      if (to && !db.team.some((u) => u.id === to)) return apiError(422, 'validation_error', 'Unknown user')
      for (const id of ids) {
        const inf = findInfluencer(id)
        if (!inf) {
          notFoundRow(id)
          continue
        }
        const from = inf.assigned_to
        inf.assigned_to = to
        inf.updated_at = nowIso()
        logActivity(id, 'assigned', { from, to })
        result.succeeded.push(id)
      }
    } else if (body.action === 'pool_assign') {
      // Like a claim on someone's behalf: a row a teammate took meanwhile is left alone, never reassigned.
      const to = body.value
      if (!can(user.role, 'influencer:reassign')) return forbidden(OWNER_CHANGE_MESSAGE)
      if (!to || !db.team.some((u) => u.id === to && u.is_active)) return apiError(422, 'validation_error', 'Choose an active team member')
      for (const id of ids) {
        const inf = findInfluencer(id)
        if (!inf) {
          notFoundRow(id)
          continue
        }
        if (inf.assigned_to) {
          result.failed.push({ id, code: 'not_in_pool', message: 'No longer in the pool' })
          continue
        }
        inf.assigned_to = to
        inf.updated_at = nowIso()
        logActivity(id, 'assigned', { from: null, to })
        result.succeeded.push(id)
      }
    } else if (body.action === 'claim') {
      // One row at a time: each claim is atomic, and a claim limit stops partway with per-row failures.
      for (const id of ids) {
        const inf = findInfluencer(id)
        if (!inf) {
          notFoundRow(id)
          continue
        }
        const res = claimInfluencer(inf, user)
        if (res.ok) result.succeeded.push(id)
        else result.failed.push({ id, code: res.code, message: res.message })
      }
    } else if (body.action === 'sync') {
      const found = ids.map((id) => findVisible(id, user)).filter((i): i is Influencer => !!i)
      const accounts = found.flatMap((inf) => syncableAccounts(inf).map((a) => ({ influencerId: inf.id, accountId: a.id, platform: a.platform })))
      result.succeeded = found.map((i) => i.id)
      ids.filter((id) => !result.succeeded.includes(id)).forEach(notFoundRow)
      result.job_id = createJob(async (): Promise<BulkSyncResult> => {
        const sync: BulkSyncResult = { synced: 0, failed: [], queued: 0 }
        const connected = connectedPlatforms()
        for (const target of accounts) {
          // Connected platforms: queued for the API server's background sync, paced by the platform's rate limit.
          const found = findAccount(target.accountId)
          if (found && connected.includes(target.platform) && found.account.sync_method === 'lookup') {
            sync.queued! += queueSync([found.account])
            continue
          }
          try {
            await syncAccount(target.accountId)
            sync.synced++
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Sync failed'
            sync.failed.push({ id: target.influencerId, message: `${PLATFORM_META[target.platform].label}: ${message}` })
          }
        }
        return sync
      })
    } else if (body.action === 'auto_sync') {
      // Manual accounts on connected platforms switch to auto-sync and are queued; the rest are left as they are.
      for (const id of ids) {
        const inf = findVisible(id, user)
        if (!inf) {
          notFoundRow(id)
          continue
        }
        const switched = inf.accounts.filter((a) => switchToAutoSync(a)).length
        if (switched) {
          inf.updated_at = nowIso()
          logActivity(inf.id, 'updated', { fields: ['auto-sync on'] })
          result.succeeded.push(id)
        } else {
          result.failed.push({ id, code: 'nothing_to_switch', message: 'No typed-in account on a connected platform' })
        }
      }
    } else if (body.action === 'delete') {
      if (!can(user.role, 'influencer:delete')) return forbidden('Only managers and admins can delete influencers')
      for (const id of ids) {
        if (deleteInfluencer(id)) result.succeeded.push(id)
        else notFoundRow(id)
      }
    } else {
      return apiError(422, 'validation_error', 'Unknown bulk action')
    }
    return HttpResponse.json(result)
  }),

  http.post(api('/influencers'), async ({ request }) => {
    const body = await readJson<InfluencerCreate>(request)
    const user = currentUser()
    if (!canSetOwnerOnCreate(user, body.assigned_to ?? null)) return forbidden(OWNER_CHANGE_MESSAGE)
    // Executives have no pool: what they add is theirs.
    if (!can(user.role, 'influencer:reassign')) body.assigned_to = user.id
    const conflict = accountConflict(body.accounts)
    if (conflict) return conflict
    const source = body.accounts?.some((a) => a.metrics !== undefined && a.sync_method !== 'manual') ? 'lookup' : 'manual'
    const res = createInfluencer(body, source)
    if (!res.ok) return apiError(res.status, res.code, res.message)
    return HttpResponse.json(res.influencer, { status: 201 })
  }),

  http.get(api('/influencers/:id'), async ({ params }) => {
    const inf = findVisible(String(params.id))
    return inf ? HttpResponse.json(inf) : notFound('Influencer')
  }),

  // Personal data request: everything stored about one influencer, as JSON (admins; erasing is Delete influencer).
  http.get(api('/influencers/:id/export'), async ({ params }) => {
    if (!can(currentUser().role, 'influencer:export')) return forbidden('Only admins can export an influencer’s data')
    const inf = findInfluencer(String(params.id))
    if (!inf) return notFound('Influencer')
    const mine = <T extends { influencer_id: string }>(rows: T[]) => rows.filter((r) => r.influencer_id === inf.id)
    return HttpResponse.json({
      exported_at: nowIso(),
      influencer: inf,
      calls: mine(db.calls),
      welcome_kits: mine(db.packages),
      documents: mine(db.documents).filter((d) => !d.deleted_at).map(publicDocument),
      activity: mine(db.activities),
    })
  }),

  http.post(api('/influencers/:id/claim'), async ({ params }) => {
    const inf = findInfluencer(String(params.id))
    if (!inf) return notFound('Influencer')
    const res = claimInfluencer(inf)
    return res.ok ? HttpResponse.json(res.influencer) : apiError(res.status, res.code, res.message)
  }),

  http.post(api('/influencers/:id/release'), async ({ params, request }) => {
    const user = currentUser()
    // An executive can only see, and so only release, their own influencers.
    const inf = findVisible(String(params.id), user)
    if (!inf) return notFound('Influencer')
    if (!inf.assigned_to) return apiError(409, 'not_assigned', 'Already in the Unassigned Pool')
    const reason = (await readJson<Partial<ReleaseRequest>>(request)).reason?.trim()
    if (!reason) return apiError(422, 'reason_required', 'Give a reason for releasing to the pool')
    releaseInfluencer(inf, reason, user.id)
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch(api('/influencers/:id'), async ({ params, request }) => {
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<InfluencerUpdate>(request)
    const user = currentUser()
    // Accounts and what's derived from them change through /accounts endpoints only.
    for (const key of ['accounts', 'total_reach', 'is_verified', 'profile_pic_url', 'id', 'stage', 'created_at', 'updated_at']) {
      delete (body as Record<string, unknown>)[key]
    }
    if (body.phone !== undefined) body.phone = normalizePhone(body.phone)
    if (body.tags !== undefined) {
      const tags = cleanTags(body.tags)
      if (!tags.ok) return apiError(tags.status, tags.code, tags.message)
      body.tags = tags.tags
    }
    if (body.assigned_to !== undefined && body.assigned_to !== inf.assigned_to) {
      if (!can(user.role, 'influencer:reassign')) return forbidden(OWNER_CHANGE_MESSAGE)
      logActivity(inf.id, 'assigned', { from: inf.assigned_to, to: body.assigned_to })
    }

    const changed = Object.keys(body).filter((k) => k !== 'assigned_to')
    const { onboarding_checklist, ...rest } = body
    Object.assign(inf, rest)
    if (onboarding_checklist) inf.onboarding_checklist = { ...inf.onboarding_checklist, ...onboarding_checklist }
    if (body.address !== undefined) inf.onboarding_checklist.address_collected = body.address != null
    inf.updated_at = nowIso()
    if (changed.length) logActivity(inf.id, 'updated', { fields: changed })
    return HttpResponse.json(inf)
  }),

  http.delete(api('/influencers/:id'), async ({ params }) => {
    if (!can(currentUser().role, 'influencer:delete')) return forbidden('Only managers and admins can delete influencers')
    if (!deleteInfluencer(String(params.id))) return notFound('Influencer')
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(api('/influencers/:id/stage'), async ({ params, request }) => {
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<StageChangeRequest>(request)
    const res = changeStage(inf, body.to, body.reason?.trim() || undefined)
    return res.ok ? HttpResponse.json(res.influencer) : apiError(res.status, res.code, res.message)
  }),

  http.get(api('/influencers/:id/activity'), async ({ params, request }) => {
    const id = String(params.id)
    if (!findVisible(id)) return notFound('Influencer')
    const list = db.activities.filter((a) => a.influencer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return HttpResponse.json(paginate(list, new URL(request.url).searchParams, 50))
  }),

  http.get(api('/influencers/:id/calls'), async ({ params, request }) => {
    const id = String(params.id)
    if (!findVisible(id)) return notFound('Influencer')
    const list = db.calls.filter((c) => c.influencer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return HttpResponse.json(paginate(list, new URL(request.url).searchParams, 50))
  }),

  http.post(api('/influencers/:id/calls'), async ({ params, request }) => {
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<CallLogCreate>(request)
    if (!CALL_OUTCOMES.includes(body.outcome)) return apiError(422, 'validation_error', 'Choose a call outcome')

    // One call per time slot per executive: no other open follow-up for this executive at the same date and minute.
    // Two different executives can schedule calls at the same time for different influencers.
    // This influencer's own open follow-ups don't count (logging this call completes them, just below).
    // null / undefined = no follow-up; anything else (an empty string included) must be a full timestamp.
    // FR-CALL-02 (the form checks the same): "call back" needs a follow-up, and a follow-up is in the future.
    if (body.outcome === 'call_back' && body.follow_up_date == null) return apiError(422, 'validation_error', 'Pick when to call back')
    if (body.follow_up_date != null) {
      if (!isTimestamp(body.follow_up_date)) return apiError(422, 'validation_error', 'Enter a valid follow-up date and time')
      if (Date.parse(body.follow_up_date) <= Date.now()) return apiError(422, 'validation_error', 'Pick a time in the future')
      const slot = minuteOf(body.follow_up_date)
      const executiveId = inf.assigned_to ?? currentUser().id
      const taken = db.calls.some((c) => {
        if (c.influencer_id === inf.id || !c.follow_up_date || c.follow_up_done) return false
        if (minuteOf(c.follow_up_date) !== slot) return false
        const cInf = findInfluencer(c.influencer_id)
        const cExecId = cInf?.assigned_to ?? c.called_by
        return cExecId === executiveId
      })
      if (taken) {
        return apiError(
          409,
          'time_taken',
          `Another call is already scheduled for ${formatDateTime(body.follow_up_date)}. Pick a different time.`,
        )
      }
    }

    // A new call completes any follow-ups still open for this influencer.
    for (const c of db.calls) {
      if (c.influencer_id === inf.id && c.follow_up_date && !c.follow_up_done) c.follow_up_done = true
    }
    const call: CallLog = {
      id: nextId('call'),
      influencer_id: inf.id,
      called_by: currentUser().id,
      outcome: body.outcome,
      notes: body.notes?.trim() || null,
      follow_up_date: body.follow_up_date ?? null,
      follow_up_done: false,
      created_at: nowIso(),
    }
    db.calls.push(call)
    inf.onboarding_checklist.called = true
    inf.updated_at = call.created_at
    logActivity(inf.id, 'call_logged', { call_id: call.id, outcome: call.outcome })

    // Automatic moves from the outcome: not interested → Rejected; no answer / wrong number → On Hold. Standard moves
    // only (never an override, so never past the "no override once onboarded" rule); the response says whether it
    // happened, so the caller can tell the user instead of claiming a move that didn't take place.
    const autoTo: Stage | null =
      body.outcome === 'not_interested' ? 'rejected' : body.outcome === 'no_answer' || body.outcome === 'wrong_number' ? 'on_hold' : null
    let stage_change: CallLogCreated['stage_change'] = null
    if (autoTo && inf.stage !== autoTo) {
      const reason = `Call outcome: ${CALL_OUTCOME_META[body.outcome].label}`
      const res = changeStage(inf, autoTo, reason, currentUser(), { allowOverride: false })
      stage_change = { to: autoTo, moved: res.ok, message: res.ok ? null : res.message }
    }

    return HttpResponse.json({ ...call, stage_change } satisfies CallLogCreated, { status: 201 })
  }),
]
