import { http, HttpResponse } from 'msw'
import { mapImportRow, validateImportRow } from '@/lib/csv-import'
import { can } from '@/lib/permissions'
import { toSearchParams } from '@/services/http'
import type {
  CsvImportRequest,
  CsvImportResult,
  ExportRequest,
  ExportResult,
  Influencer,
  InfluencerCreate,
} from '@/types'
import { currentUser, db, logActivity, nowIso } from '../db'
import {
  assignedToOtherMessage,
  completeSync,
  createInfluencer,
  filterInfluencers,
  handleStatus,
  inPoolMessage,
  lookupInstagram,
  normalizeHandle,
  parseCsv,
  toCsv,
} from '../domain'
import { createJob, readJob } from '../jobs'
import { api, apiError, forbidden, latency, notFound, readJson } from '../utils'

export const asyncHandlers = [
  http.get(api('/jobs/:id'), async ({ params }) => {
    await latency()
    const job = readJob(String(params.id))
    return job ? HttpResponse.json(job) : notFound('Job')
  }),

  http.post(api('/instagram/lookup'), async ({ request }) => {
    await latency()
    const username = normalizeHandle((await readJson<{ username?: string }>(request)).username ?? '')
    if (!username || !/^[a-z0-9._]{1,30}$/.test(username)) {
      return apiError(422, 'validation_error', 'Enter a valid Instagram username')
    }
    const { conflict } = handleStatus(username)
    if (conflict === 'exists') return apiError(409, 'already_exists', `@${username} is already in the CRM`)
    if (conflict === 'in_pool') return apiError(409, 'in_pool', inPoolMessage(username))
    if (conflict === 'assigned_to_other') return apiError(409, 'assigned_to_other', assignedToOtherMessage(username))
    return HttpResponse.json({ job_id: createJob(() => lookupInstagram(username), 2500) }, { status: 202 })
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
    if (!mapping.name || !mapping.instagram_handle) {
      return apiError(422, 'validation_error', 'Map at least the name and Instagram handle columns')
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
        instagram: body.fetch_instagram ? { synced: 0, failed: 0 } : null,
      }
      const seen = new Set<string>()
      const touched: Influencer[] = []

      rows.forEach((row, idx) => {
        const line = idx + 2 // header is line 1
        const raw = mapImportRow(row, headers, mapping)
        const { values, errors } = validateImportRow(raw, categoryNames)
        const problems = Object.values(errors)
        if (problems.length) {
          result.failed++
          result.errors.push({ row: line, instagram_handle: raw.instagram_handle ?? null, message: problems.join('; ') })
          return
        }
        const handle = values.instagram_handle!
        if (seen.has(handle)) {
          result.duplicates++
          return
        }
        seen.add(handle)

        const existing = db.influencers.find((i) => i.instagram_handle === handle)
        if (existing) {
          if (body.on_duplicate !== 'update') {
            result.duplicates++
            return
          }
          // Only fields present in the row overwrite; tags are merged.
          const { instagram_handle: _ignored, tags, ...rest } = values
          const fields = Object.keys(raw).filter((k) => k !== 'instagram_handle' && k !== 'tags')
          Object.assign(existing, Object.fromEntries(Object.entries(rest).filter(([k]) => fields.includes(k))))
          if (tags) existing.tags = [...new Set([...existing.tags, ...tags])]
          existing.updated_at = nowIso()
          logActivity(existing.id, 'updated', { fields: Object.keys(raw).filter((k) => k !== 'instagram_handle'), source: 'csv' })
          result.updated++
          touched.push(existing)
          return
        }

        const res = createInfluencer({ ...values, account_type: 'unknown' } as InfluencerCreate, 'csv')
        if (res.ok) {
          result.created++
          touched.push(res.influencer)
        } else {
          result.failed++
          result.errors.push({ row: line, instagram_handle: handle, message: res.message })
        }
      })

      if (result.instagram) {
        for (const inf of touched) {
          try {
            completeSync(inf.id)
            result.instagram.synced++
          } catch {
            result.instagram.failed++
          }
        }
      }
      db.uploads.delete(body.key)
      return result
    }
    // Instagram lookups make the job noticeably longer, like the real thing.
    return HttpResponse.json({ job_id: createJob(run, body.fetch_instagram ? 5000 : 3000) }, { status: 202 })
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
