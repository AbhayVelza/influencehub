import { http, HttpResponse } from 'msw'
import { ALL_STAGES, STAGE_META } from '@/lib/constants'
import { can } from '@/lib/permissions'
import type {
  BulkRequest,
  BulkResult,
  BulkSyncResult,
  CallLog,
  CallLogCreate,
  FilterOption,
  FilterOptions,
  Influencer,
  InfluencerCreate,
  InfluencerUpdate,
  ReleaseRequest,
  StageChangeRequest,
} from '@/types'
import { currentUser, db, findInfluencer, logActivity, mediaFor, nextId, nowIso, snapshotsFor } from '../db'
import {
  assignedToOtherMessage,
  canSetOwnerOnCreate,
  changeStage,
  claimInfluencer,
  completeSync,
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
import { all, api, apiError, forbidden, latency, notFound, paginate, readJson } from '../utils'

function countBy(list: Influencer[], key: (i: Influencer) => string | null, label = (v: string) => v): FilterOption[] {
  const counts = new Map<string, number>()
  for (const inf of list) {
    const value = key(inf)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Cascading options with counts over `source`: states narrow by country, cities by country + state. */
export function filterOptionsFor(source: Influencer[], params: URLSearchParams): FilterOptions {
  const countries = params.getAll('country')
  const states = params.getAll('state')
  const inCountries = countries.length ? source.filter((i) => countries.includes(i.country ?? '')) : source
  const inStates = states.length ? inCountries.filter((i) => states.includes(i.state ?? '')) : inCountries
  const team = new Map(db.team.map((u) => [u.id, u.name]))
  return {
    categories: countBy(source, (i) => i.category),
    countries: countBy(source, (i) => i.country),
    states: countBy(inCountries, (i) => i.state),
    cities: countBy(inStates, (i) => i.city),
    stages: ALL_STAGES.map((stage) => ({
      value: stage,
      label: STAGE_META[stage].label,
      count: source.filter((i) => i.stage === stage).length,
    })),
    assigned_to: countBy(source, (i) => i.assigned_to, (id) => team.get(id) ?? id),
  }
}

const CALL_OUTCOMES = ['interested', 'not_interested', 'call_back', 'no_answer', 'wrong_number']

// Executives only ever reach influencers they own: everything else answers 404 (unassigned ones via /pool).
export const influencerHandlers = [
  http.get(api('/influencers'), async ({ request }) => {
    await latency()
    const params = new URL(request.url).searchParams
    const list = sortInfluencers(filterInfluencers(params, visibleInfluencers()), params.get('sort'))
    return HttpResponse.json(paginate(list, params))
  }),

  http.get(api('/influencers/filter-options'), async ({ request }) => {
    await latency()
    return HttpResponse.json(filterOptionsFor(visibleInfluencers(), new URL(request.url).searchParams))
  }),

  http.get(api('/influencers/check-handle'), async ({ request }) => {
    await latency()
    const handle = normalizeHandle(new URL(request.url).searchParams.get('handle') ?? '')
    return HttpResponse.json(handleStatus(handle))
  }),

  http.post(api('/influencers/bulk'), async ({ request }) => {
    await latency()
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
        const res = changeStage(inf, body.value as Influencer['stage'], undefined, user)
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
      const found = ids.filter((id) => findVisible(id, user))
      for (const id of found) {
        const inf = findInfluencer(id)!
        if (inf.account_type !== 'personal') inf.ig_sync_status = 'pending'
      }
      result.succeeded = found
      ids.filter((id) => !found.includes(id)).forEach(notFoundRow)
      result.job_id = createJob((): BulkSyncResult => {
        const sync: BulkSyncResult = { synced: 0, failed: [] }
        for (const id of found) {
          try {
            completeSync(id)
            sync.synced++
          } catch (err) {
            sync.failed.push({ id, message: err instanceof Error ? err.message : 'Sync failed' })
          }
        }
        return sync
      }, 2000 + found.length * 300)
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
    await latency()
    const body = await readJson<InfluencerCreate>(request)
    if (!canSetOwnerOnCreate(currentUser(), body.assigned_to ?? null)) return forbidden(OWNER_CHANGE_MESSAGE)
    const handle = normalizeHandle(body.instagram_handle ?? '')
    const conflict = handle ? handleStatus(handle).conflict : null
    if (conflict === 'in_pool') return apiError(409, 'in_pool', inPoolMessage(handle))
    if (conflict === 'assigned_to_other') return apiError(409, 'assigned_to_other', assignedToOtherMessage(handle))
    const source = body.followers != null && body.account_type !== 'personal' ? 'instagram' : 'manual'
    const res = createInfluencer(body, source)
    if (!res.ok) return apiError(res.status, res.code, res.message)
    return HttpResponse.json(res.influencer, { status: 201 })
  }),

  http.get(api('/influencers/:id'), async ({ params }) => {
    await latency()
    const inf = findVisible(String(params.id))
    return inf ? HttpResponse.json(inf) : notFound('Influencer')
  }),

  http.post(api('/influencers/:id/claim'), async ({ params }) => {
    await latency()
    const inf = findInfluencer(String(params.id))
    if (!inf) return notFound('Influencer')
    const res = claimInfluencer(inf)
    return res.ok ? HttpResponse.json(res.influencer) : apiError(res.status, res.code, res.message)
  }),

  http.post(api('/influencers/:id/release'), async ({ params, request }) => {
    await latency()
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
    await latency()
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<InfluencerUpdate>(request)
    const user = currentUser()

    if (body.instagram_handle !== undefined) {
      const handle = normalizeHandle(body.instagram_handle)
      if (!handle) return apiError(422, 'validation_error', 'Instagram handle is required')
      if (db.influencers.some((i) => i.id !== inf.id && i.instagram_handle === handle)) {
        return apiError(409, 'handle_taken', `@${handle} is already in the CRM`)
      }
      body.instagram_handle = handle
      body.profile_url = `https://www.instagram.com/${handle}/`
    }
    if (body.phone !== undefined) body.phone = normalizePhone(body.phone)
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
    await latency()
    if (!can(currentUser().role, 'influencer:delete')) return forbidden('Only managers and admins can delete influencers')
    if (!deleteInfluencer(String(params.id))) return notFound('Influencer')
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(api('/influencers/:id/stage'), async ({ params, request }) => {
    await latency()
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<StageChangeRequest>(request)
    const res = changeStage(inf, body.to, body.reason?.trim() || undefined)
    return res.ok ? HttpResponse.json(res.influencer) : apiError(res.status, res.code, res.message)
  }),

  http.get(api('/influencers/:id/activity'), async ({ params, request }) => {
    await latency()
    const id = String(params.id)
    if (!findVisible(id)) return notFound('Influencer')
    const list = db.activities.filter((a) => a.influencer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return HttpResponse.json(paginate(list, new URL(request.url).searchParams, 50))
  }),

  http.get(api('/influencers/:id/snapshots'), async ({ params }) => {
    await latency()
    const inf = findVisible(String(params.id))
    return inf ? HttpResponse.json(all(snapshotsFor(inf))) : notFound('Influencer')
  }),

  http.get(api('/influencers/:id/media'), async ({ params }) => {
    await latency()
    const inf = findVisible(String(params.id))
    return inf ? HttpResponse.json(all(mediaFor(inf))) : notFound('Influencer')
  }),

  http.post(api('/influencers/:id/sync'), async ({ params }) => {
    await latency()
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    if (inf.account_type !== 'personal') inf.ig_sync_status = 'pending'
    return HttpResponse.json({ job_id: createJob(() => completeSync(inf.id)) }, { status: 202 })
  }),

  http.get(api('/influencers/:id/calls'), async ({ params, request }) => {
    await latency()
    const id = String(params.id)
    if (!findVisible(id)) return notFound('Influencer')
    const list = db.calls.filter((c) => c.influencer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return HttpResponse.json(paginate(list, new URL(request.url).searchParams, 50))
  }),

  http.post(api('/influencers/:id/calls'), async ({ params, request }) => {
    await latency()
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<CallLogCreate>(request)
    if (!CALL_OUTCOMES.includes(body.outcome)) return apiError(422, 'validation_error', 'Choose a call outcome')

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
    return HttpResponse.json(call, { status: 201 })
  }),
]
