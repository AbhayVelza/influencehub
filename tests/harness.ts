import { getResponse } from 'msw'
import { db, defaultSettings, newWorkspace, readChangedData, resolveActingUid, setActingUid } from '@/backend/db'
import { handlers } from '@/backend/handlers'
import { commitJobs, executeJob, readJob } from '@/backend/jobs'
import { OWNER_ID } from '@/lib/mode'
import { ACTING_AS_HEADER, API_BASE } from '@/lib/env'
import type { Role, User } from '@/types'

/** A fresh workspace: the owner admin and the default categories, nothing else. */
export function resetWorkspace() {
  Object.assign(db, {
    ...newWorkspace(),
    influencers: [],
    documents: [],
    calls: [],
    packages: [],
    activities: [],
    savedViews: [],
    ...defaultSettings(),
    jobs: [],
    dismissedDuplicates: new Set<string>(),
    documentUploads: new Map(),
    uploads: new Map(),
  })
}

export const ADMIN = OWNER_ID

export interface ApiResult<T = any> {
  status: number
  body: T
  /** A read that said it changed data (noteChangedOnRead), so the API server saves after it. */
  changedOnRead: boolean
}

/** One API request answered as the API server answers it (jobs run inside the request that starts them). */
export async function api<T = any>(method: string, path: string, opts: { as?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const request = new Request(`http://test${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', [ACTING_AS_HEADER]: opts.as ?? ADMIN },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  setActingUid(resolveActingUid(request.headers.get(ACTING_AS_HEADER)))
  try {
    const response = (await getResponse(handlers, request)) ?? new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 })
    let body: any = null
    const text = await response.text()
    if (text) body = JSON.parse(text)
    if (response.status === 202 && typeof body?.job_id === 'string') executeJob(body.job_id)
    commitJobs()
    return { status: response.status, body, changedOnRead: readChangedData() }
  } finally {
    setActingUid(null)
  }
}

/** Starts a job request and returns the finished job. */
export async function runJob<T = any>(method: string, path: string, opts: { as?: string; body?: unknown } = {}) {
  const started = await api(method, path, opts)
  if (started.status !== 202) throw new Error(`Expected 202, got ${started.status}: ${JSON.stringify(started.body)}`)
  const job = readJob(started.body.job_id)!
  return job as { status: string; result: T; error: { code: string; message: string } | null }
}

/** Adds a team member (as the admin) and returns it. */
export async function addMember(role: Role, name = `${role} member`): Promise<User> {
  const res = await api<User>('POST', '/team', { body: { name, email: `${name.replace(/\W/g, '.')}@test.local`, role } })
  if (res.status !== 201 && res.status !== 200) throw new Error(`addMember ${res.status}: ${JSON.stringify(res.body)}`)
  return res.body
}

/** Adds an influencer with one Instagram account; `as` decides the owner (executives get it assigned). */
export async function addInfluencer(handle: string, opts: { as?: string; body?: Record<string, unknown> } = {}) {
  const res = await api('POST', '/influencers', {
    as: opts.as,
    body: { name: `Creator ${handle}`, category: db.categories[0]!.name, accounts: [{ platform: 'instagram', handle }], ...opts.body },
  })
  return res
}

/** An influencer owned by `owner` (default: the admin), with one Instagram account. Returns its id. */
export async function influencer(handle: string, owner: string | null = ADMIN, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await addInfluencer(handle, { body: { assigned_to: owner, ...extra } })
  if (res.status !== 201) throw new Error(`influencer ${handle}: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.id
}

/** Documents: presign, "upload" the file (what the API server's PUT records), save the metadata. */
export async function uploadDocument(influencerId: string, doc: Record<string, unknown>, as = ADMIN) {
  const type = doc.type as string
  const presign = await api('POST', '/documents/presign', {
    as,
    body: { influencer_id: influencerId, type, file_name: 'file.pdf', content_type: 'application/pdf', size: 1000 },
  })
  if (presign.status !== 200) return presign
  db.documentUploads.get(presign.body.key)!.uploaded = true
  return api('POST', `/influencers/${influencerId}/documents`, { as, body: { key: presign.body.key, title: 'Doc', ...doc } })
}

export const agreement = (signed_on = '2026-01-10') => ({ type: 'agreement', signed_on })
export const insights = () => ({ type: 'insights_summary', period_start: '2026-01-01', period_end: '2026-01-31' })

/** Logs a call (and with it any automatic stage move). */
export const logCall = (id: string, outcome: string, extra: Record<string, unknown> = {}, as = ADMIN) =>
  api('POST', `/influencers/${id}/calls`, { as, body: { outcome, ...extra } })

export const move = (id: string, to: string, opts: { as?: string; reason?: string } = {}) =>
  api('POST', `/influencers/${id}/stage`, { as: opts.as, body: { to, reason: opts.reason } })

/** Takes an influencer to Onboarded the standard way: interested call, agreement, insights. */
export async function onboard(id: string) {
  await logCall(id, 'interested')
  await move(id, 'contacted')
  await uploadDocument(id, agreement())
  await uploadDocument(id, insights())
  const res = await move(id, 'onboarded')
  if (res.status !== 200) throw new Error(`onboard: ${res.status} ${JSON.stringify(res.body)}`)
}

export const address = { line1: '1 MG Road', line2: null, city: 'Pune', state: 'Maharashtra', postal_code: '411001', country: 'India' }
