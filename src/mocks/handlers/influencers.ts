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
  StageChangeRequest,
} from '@/types'
import { currentUser, db, findInfluencer, logActivity, mediaFor, nextId, nowIso, snapshotsFor } from '../db'
import {
  changeStage,
  completeSync,
  createInfluencer,
  deleteInfluencer,
  filterInfluencers,
  normalizeHandle,
  normalizePhone,
  sortInfluencers,
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

const CALL_OUTCOMES = ['interested', 'not_interested', 'call_back', 'no_answer', 'wrong_number']

export const influencerHandlers = [
  http.get(api('/influencers'), async ({ request }) => {
    await latency()
    const params = new URL(request.url).searchParams
    const list = sortInfluencers(filterInfluencers(params), params.get('sort'))
    return HttpResponse.json(paginate(list, params))
  }),

  http.get(api('/influencers/filter-options'), async ({ request }) => {
    await latency()
    const params = new URL(request.url).searchParams
    const countries = params.getAll('country')
    const states = params.getAll('state')
    const inCountries = countries.length ? db.influencers.filter((i) => countries.includes(i.country ?? '')) : db.influencers
    const inStates = states.length ? inCountries.filter((i) => states.includes(i.state ?? '')) : inCountries
    const team = new Map(db.team.map((u) => [u.id, u.name]))

    const body: FilterOptions = {
      categories: countBy(db.influencers, (i) => i.category),
      countries: countBy(db.influencers, (i) => i.country),
      states: countBy(inCountries, (i) => i.state),
      cities: countBy(inStates, (i) => i.city),
      stages: ALL_STAGES.map((stage) => ({
        value: stage,
        label: STAGE_META[stage].label,
        count: db.influencers.filter((i) => i.stage === stage).length,
      })),
      assigned_to: countBy(db.influencers, (i) => i.assigned_to, (id) => team.get(id) ?? id),
    }
    return HttpResponse.json(body)
  }),

  http.get(api('/influencers/check-handle'), async ({ request }) => {
    await latency()
    const handle = normalizeHandle(new URL(request.url).searchParams.get('handle') ?? '')
    const existing = db.influencers.find((i) => i.instagram_handle === handle)
    return HttpResponse.json({ available: !existing, influencer_id: existing?.id ?? null })
  }),

  http.post(api('/influencers/bulk'), async ({ request }) => {
    await latency()
    const body = await readJson<BulkRequest>(request)
    const user = currentUser()
    const ids = Array.isArray(body.ids) ? body.ids : []
    if (!ids.length) return apiError(422, 'validation_error', 'Select at least one influencer')
    const result: BulkResult = { succeeded: [], failed: [], job_id: null }

    if (body.action === 'change_stage') {
      for (const id of ids) {
        const inf = findInfluencer(id)
        if (!inf) {
          result.failed.push({ id, code: 'not_found', message: 'Influencer not found' })
          continue
        }
        const res = changeStage(inf, body.value as Influencer['stage'], undefined, user)
        if (res.ok) result.succeeded.push(id)
        else result.failed.push({ id, code: res.code, message: res.message })
      }
    } else if (body.action === 'assign') {
      if (!can(user.role, 'influencer:reassign')) return forbidden('Only managers and admins can reassign influencers')
      if (body.value && !db.team.some((u) => u.id === body.value)) return apiError(422, 'validation_error', 'Unknown user')
      for (const id of ids) {
        const inf = findInfluencer(id)
        if (!inf) {
          result.failed.push({ id, code: 'not_found', message: 'Influencer not found' })
          continue
        }
        const from = inf.assigned_to
        inf.assigned_to = body.value ?? null
        inf.updated_at = nowIso()
        logActivity(id, 'assigned', { from, to: inf.assigned_to })
        result.succeeded.push(id)
      }
    } else if (body.action === 'sync') {
      const found = ids.filter((id) => findInfluencer(id))
      for (const id of found) {
        const inf = findInfluencer(id)!
        if (inf.account_type !== 'personal') inf.ig_sync_status = 'pending'
      }
      result.succeeded = found
      result.failed = ids.filter((id) => !found.includes(id)).map((id) => ({ id, code: 'not_found', message: 'Influencer not found' }))
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
        else result.failed.push({ id, code: 'not_found', message: 'Influencer not found' })
      }
    } else {
      return apiError(422, 'validation_error', 'Unknown bulk action')
    }
    return HttpResponse.json(result)
  }),

  http.post(api('/influencers'), async ({ request }) => {
    await latency()
    const body = await readJson<InfluencerCreate>(request)
    const source = body.followers != null && body.account_type !== 'personal' ? 'instagram' : 'manual'
    const res = createInfluencer(body, source)
    if (!res.ok) return apiError(res.status, res.code, res.message)
    return HttpResponse.json(res.influencer, { status: 201 })
  }),

  http.get(api('/influencers/:id'), async ({ params }) => {
    await latency()
    const inf = findInfluencer(String(params.id))
    return inf ? HttpResponse.json(inf) : notFound('Influencer')
  }),

  http.patch(api('/influencers/:id'), async ({ params, request }) => {
    await latency()
    const inf = findInfluencer(String(params.id))
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
      // Any owner change (including claiming an unassigned influencer) is a manager/admin action.
      if (!can(user.role, 'influencer:reassign')) {
        return forbidden('Only managers and admins can reassign influencers')
      }
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
    const inf = findInfluencer(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<StageChangeRequest>(request)
    const res = changeStage(inf, body.to, body.reason?.trim() || undefined)
    return res.ok ? HttpResponse.json(res.influencer) : apiError(res.status, res.code, res.message)
  }),

  http.get(api('/influencers/:id/activity'), async ({ params, request }) => {
    await latency()
    const id = String(params.id)
    if (!findInfluencer(id)) return notFound('Influencer')
    const list = db.activities.filter((a) => a.influencer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return HttpResponse.json(paginate(list, new URL(request.url).searchParams, 50))
  }),

  http.get(api('/influencers/:id/snapshots'), async ({ params }) => {
    await latency()
    const inf = findInfluencer(String(params.id))
    return inf ? HttpResponse.json(all(snapshotsFor(inf))) : notFound('Influencer')
  }),

  http.get(api('/influencers/:id/media'), async ({ params }) => {
    await latency()
    const inf = findInfluencer(String(params.id))
    return inf ? HttpResponse.json(all(mediaFor(inf))) : notFound('Influencer')
  }),

  http.post(api('/influencers/:id/sync'), async ({ params }) => {
    await latency()
    const inf = findInfluencer(String(params.id))
    if (!inf) return notFound('Influencer')
    if (inf.account_type !== 'personal') inf.ig_sync_status = 'pending'
    return HttpResponse.json({ job_id: createJob(() => completeSync(inf.id)) }, { status: 202 })
  }),

  http.get(api('/influencers/:id/calls'), async ({ params, request }) => {
    await latency()
    const id = String(params.id)
    if (!findInfluencer(id)) return notFound('Influencer')
    const list = db.calls.filter((c) => c.influencer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return HttpResponse.json(paginate(list, new URL(request.url).searchParams, 50))
  }),

  http.post(api('/influencers/:id/calls'), async ({ params, request }) => {
    await latency()
    const inf = findInfluencer(String(params.id))
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
