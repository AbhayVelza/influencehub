import { http, HttpResponse } from 'msw'
import { mapImportRow, validateImportRow } from '@/lib/csv-import'
import { can } from '@/lib/permissions'
import { LOOKUP_PLATFORMS, PLATFORM_META } from '@/lib/platforms'
import { toSearchParams } from '@/services/http'
import type { CsvImportRequest, CsvImportResult, ExportRequest, ExportResult, Influencer, InfluencerCreate, LookupRequest } from '@/types'
import { currentUser, db, logActivity, nowIso, refreshDerived } from '../db'
import {
  assignedToOtherMessage,
  createInfluencer,
  filterInfluencers,
  findByHandle,
  handleStatus,
  inPoolMessage,
  normalizeHandle,
  parseCsv,
  toCsv,
} from '../domain'
import { createJob, readJob } from '../jobs'
import { buildAccount, lookupProfile, syncAccount } from '../social'
import { api, apiError, forbidden, latency, notFound, readJson } from '../utils'
import { syncableAccounts } from './influencers'

const HANDLE = /^[a-z0-9._-]{1,60}$/

export const asyncHandlers = [
  http.get(api('/jobs/:id'), async ({ params }) => {
    await latency()
    const job = readJob(String(params.id))
    return job ? HttpResponse.json(job) : notFound('Job')
  }),

  http.post(api('/lookup'), async ({ request }) => {
    await latency()
    const body = await readJson<Partial<LookupRequest>>(request)
    const platform = body.platform
    if (!platform || !LOOKUP_PLATFORMS.includes(platform)) {
      return apiError(422, 'not_supported', 'Only Instagram, YouTube, Threads and Facebook Pages can be looked up')
    }
    const username = normalizeHandle(body.username ?? '', platform)
    const label = `${PLATFORM_META[platform].label} @${username}`
    if (!HANDLE.test(username)) return apiError(422, 'validation_error', `Enter a valid ${PLATFORM_META[platform].label} username`)
    const { conflict } = handleStatus(platform, username)
    if (conflict === 'exists') return apiError(409, 'already_exists', `${label} is already in the CRM`)
    if (conflict === 'in_pool') return apiError(409, 'in_pool', inPoolMessage(label))
    if (conflict === 'assigned_to_other') return apiError(409, 'assigned_to_other', assignedToOtherMessage(label))
    return HttpResponse.json({ job_id: createJob(() => lookupProfile(platform, username), 2500) }, { status: 202 })
  }),

  // ---- CSV import ---------------------------------------------------------
  http.post(api('/imports/csv/presign'), async ({ request }) => {
    await latency()
    if (!can(currentUser().role, 'data:import')) return forbidden('Only managers and admins can import')
    const filename = (await readJson<{ filename?: string }>(request)).filename ?? 'import.csv'
    const key = `imports/${Date.now()}-${filename.replace(/[^\w.-]/g, '_')}`
    // In production this is an S3 presigned URL; in mock mode MSW receives the upload below.
    return HttpResponse.json({ upload_url: api(`/mock-uploads/${encodeURIComponent(key)}`), key })
  }),

  http.put(api('/mock-uploads/:key'), async ({ params, request }) => {
    await latency()
    db.uploads.set(decodeURIComponent(String(params.key)), await request.text())
    return new HttpResponse(null, { status: 200 })
  }),

  http.post(api('/imports/csv'), async ({ request }) => {
    await latency()
    if (!can(currentUser().role, 'data:import')) return forbidden('Only managers and admins can import')
    const body = await readJson<CsvImportRequest>(request)
    const text = db.uploads.get(body.key)
    if (text === undefined) return apiError(422, 'validation_error', 'Upload not found. Upload the file again.')
    const mapping = body.mapping ?? {}
    if (!mapping.name || !Object.keys(PLATFORM_META).some((p) => mapping[p as keyof typeof mapping])) {
      return apiError(422, 'validation_error', 'Map the name column and at least one platform handle column')
    }

    const run = (): CsvImportResult => {
      const [rawHeader = [], ...rows] = parseCsv(text)
      const headers = rawHeader.map((h) => h.trim())
      const categoryNames = db.categories.filter((c) => c.is_active).map((c) => c.name)
      const result: CsvImportResult = {
        total_rows: rows.length,
        created: 0,
        updated: 0,
        duplicates: 0,
        failed: 0,
        errors: [],
        profiles: body.fetch_profiles ? { synced: 0, failed: 0 } : null,
      }
      const seen = new Set<string>()
      const touched: Influencer[] = []

      rows.forEach((row, idx) => {
        const line = idx + 2 // header is line 1
        const raw = mapImportRow(row, headers, mapping)
        const { values, accounts, errors } = validateImportRow(raw, categoryNames)
        const firstHandle = accounts[0]?.handle ?? null
        const problems = Object.values(errors)
        if (problems.length) {
          result.failed++
          result.errors.push({ row: line, handle: firstHandle, message: problems.join('; ') })
          return
        }
        const keys = accounts.map((a) => `${a.platform}:${a.handle}`)
        if (keys.some((k) => seen.has(k))) {
          result.duplicates++
          return
        }
        keys.forEach((k) => seen.add(k))

        // The row is an existing creator when any of its handles is already in the CRM.
        const existing = accounts.map((a) => findByHandle(a.platform, a.handle)).find(Boolean)
        if (existing) {
          if (body.on_duplicate !== 'update') {
            result.duplicates++
            return
          }
          // Only fields present in the row overwrite; tags are merged; new handles are added as accounts.
          const { tags, ...rest } = values
          const fields = Object.keys(raw).filter((k) => k in rest)
          Object.assign(existing, Object.fromEntries(Object.entries(rest).filter(([k]) => fields.includes(k))))
          if (tags) existing.tags = [...new Set([...existing.tags, ...tags])]
          for (const a of accounts) {
            if (!findByHandle(a.platform, a.handle)) existing.accounts.push(buildAccount(existing, a, false))
          }
          existing.updated_at = nowIso()
          refreshDerived(existing)
          logActivity(existing.id, 'updated', { fields: Object.keys(raw), source: 'csv' })
          result.updated++
          touched.push(existing)
          return
        }

        const res = createInfluencer({ ...values, accounts } as InfluencerCreate, 'csv')
        if (res.ok) {
          result.created++
          touched.push(res.influencer)
        } else {
          result.failed++
          result.errors.push({ row: line, handle: firstHandle, message: res.message })
        }
      })

      if (result.profiles) {
        for (const inf of touched) {
          for (const account of syncableAccounts(inf)) {
            try {
              syncAccount(account.id)
              result.profiles.synced++
            } catch {
              result.profiles.failed++
            }
          }
        }
      }
      db.uploads.delete(body.key)
      return result
    }
    // Profile lookups make the job noticeably longer, like the real thing.
    return HttpResponse.json({ job_id: createJob(run, body.fetch_profiles ? 5000 : 3000) }, { status: 202 })
  }),

  // ---- Export -------------------------------------------------------------
  http.post(api('/exports/influencers'), async ({ request }) => {
    await latency()
    if (!can(currentUser().role, 'data:export')) return forbidden('Only managers and admins can export')
    const body = await readJson<ExportRequest>(request)
    const run = (): ExportResult => {
      const list = body.ids?.length
        ? db.influencers.filter((i) => body.ids!.includes(i.id))
        : filterInfluencers(toSearchParams({ ...body.filters }))
      const csv = toCsv(list)
      return { download_url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`, row_count: list.length }
    }
    return HttpResponse.json({ job_id: createJob(run, 2500) }, { status: 202 })
  }),
]
