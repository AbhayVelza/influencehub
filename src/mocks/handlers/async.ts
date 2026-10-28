import { http, HttpResponse } from 'msw'
import { can } from '@/lib/permissions'
import { toSearchParams } from '@/services/http'
import type {
  CsvImportRequest,
  CsvImportResult,
  ExportRequest,
  ExportResult,
  InfluencerCreate,
} from '@/types'
import { currentUser, db } from '../db'
import { createInfluencer, filterInfluencers, lookupInstagram, normalizeHandle, parseCsv, toCsv } from '../domain'
import { createJob, readJob } from '../jobs'
import { api, apiError, forbidden, latency, notFound, readJson } from '../utils'

const NUMERIC_FIELDS = new Set(['followers', 'following', 'posts_count', 'engagement_rate'])

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
    if (db.influencers.some((i) => i.instagram_handle === username)) {
      return apiError(409, 'already_exists', `@${username} is already in the CRM`)
    }
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
      const [header = [], ...rows] = parseCsv(text)
      const columnIndex = new Map(header.map((h, i) => [h.trim(), i]))
      const categories = new Map(db.categories.map((c) => [c.name.toLowerCase(), c.name]))
      const result: CsvImportResult = { total_rows: rows.length, created: 0, skipped: 0, errors: [] }

      rows.forEach((row, idx) => {
        const record: Record<string, unknown> = {}
        for (const [field, column] of Object.entries(mapping)) {
          const i = column ? columnIndex.get(column) : undefined
          const raw = i === undefined ? '' : (row[i] ?? '').trim()
          if (!raw) continue
          record[field] = NUMERIC_FIELDS.has(field) ? Number(raw.replace(/[,%]/g, '')) : raw
        }
        if (typeof record.tags === 'string') record.tags = record.tags.split(/[;|]/).map((t) => t.trim()).filter(Boolean)
        const category = categories.get(String(record.category ?? '').toLowerCase())
        record.category = category ?? 'Other'
        record.account_type = 'unknown'

        const res = createInfluencer(record as unknown as InfluencerCreate, 'csv')
        if (res.ok) result.created++
        else {
          result.skipped++
          result.errors.push({ row: idx + 2, message: res.message }) // +2: header row and 1-based
        }
      })
      db.uploads.delete(body.key)
      return result
    }
    return HttpResponse.json({ job_id: createJob(run, 3000) }, { status: 202 })
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
