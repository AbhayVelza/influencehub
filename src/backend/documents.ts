import { API_BASE, API_ORIGIN } from '@/lib/env'
import { PROTOTYPE } from '@/lib/mode'
import { dayKey } from '@/lib/format'
import { PLATFORMS } from '@/lib/platforms'
import type { DocumentCreate, DocumentWithInfluencer, Influencer, InfluencerDocument, User } from '@/types'
import { db, logActivity, nextId, nowIso, toSummary, type PendingUpload, type StoredDocument } from './db'
import { canSee, findVisible } from './domain'
import { fileObjectUrl } from './local-store'

// Documents. Soft-deleted ones stay in `db.documents` (with `deleted_at`) but are never served.

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !YMD.test(value)) return false
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
}

export const liveDocuments = () => db.documents.filter((d) => !d.deleted_at)

export function publicDocument({ deleted_at: _deletedAt, storage_key: _storageKey, ...doc }: StoredDocument): InfluencerDocument {
  return doc as InfluencerDocument
}

/** Documents are never shown for influencers in the Unassigned Pool, whoever asks. */
export function documentOwner(influencerId: string, user: User): Influencer | undefined {
  const inf = findVisible(influencerId, user)
  return inf && inf.assigned_to !== null ? inf : undefined
}

/** A live document whose influencer this user may see (and who isn't in the pool). */
export function findDocument(id: string, user: User): { doc: StoredDocument; influencer: Influencer } | undefined {
  const doc = liveDocuments().find((d) => d.id === id)
  if (!doc) return undefined
  const influencer = documentOwner(doc.influencer_id, user)
  return influencer ? { doc, influencer } : undefined
}

export function withInfluencer(doc: StoredDocument): DocumentWithInfluencer | null {
  const inf = db.influencers.find((i) => i.id === doc.influencer_id)
  return inf ? { ...publicDocument(doc), influencer: toSummary(inf) } : null
}

export function hasCurrentAgreement(influencerId: string): boolean {
  return liveDocuments().some((d) => d.influencer_id === influencerId && d.type === 'agreement' && d.is_current)
}

export function hasInsightsSummary(influencerId: string): boolean {
  return liveDocuments().some((d) => d.influencer_id === influencerId && d.type === 'insights_summary')
}

export function isVisibleTo(user: User, doc: StoredDocument): boolean {
  const inf = db.influencers.find((i) => i.id === doc.influencer_id)
  return !!inf && inf.assigned_to !== null && canSee(user, inf)
}

type Failure = { ok: false; code: string; message: string }

/** Checks the metadata (the file itself was validated at presign). */
export function validateDocumentBody(body: Partial<DocumentCreate>): Failure | null {
  const fail = (message: string): Failure => ({ ok: false, code: 'validation_error', message })
  const title = body.title?.trim()
  if (!title) return fail('Title is required')
  if (title.length > 120) return fail('Title must be at most 120 characters')
  if ((body.notes?.length ?? 0) > 1000) return fail('Notes must be at most 1000 characters')
  if (body.type === 'insights_summary') {
    if (!isYmd(body.period_start) || !isYmd(body.period_end)) return fail('Give the period the insights cover')
    if (body.period_start > body.period_end) return fail('The period must start before it ends')
    if (body.platform && !PLATFORMS.includes(body.platform)) return fail('Unknown platform')
    return null
  }
  if (body.type === 'agreement') {
    if (!isYmd(body.signed_on)) return fail('Give the date the agreement was signed')
    if (body.valid_until && !isYmd(body.valid_until)) return fail('Enter a valid “valid until” date')
    if (body.valid_until && body.valid_until < body.signed_on) return fail('“Valid until” must be on or after the signing date')
    return null
  }
  return fail('Unknown document type')
}

/** Saves a document for an uploaded file. A new agreement becomes current; the others stay as history. */
export function addDocument(inf: Influencer, upload: PendingUpload, body: DocumentCreate, user: User): InfluencerDocument {
  const base = {
    id: nextId('doc'),
    influencer_id: inf.id,
    title: body.title.trim(),
    file_name: upload.file_name,
    content_type: upload.content_type,
    size: upload.size,
    uploaded_by: user.id,
    uploaded_at: nowIso(),
    notes: body.notes?.trim() || null,
    deleted_at: null,
    storage_key: body.key,
  }
  let doc: StoredDocument
  if (body.type === 'agreement') {
    for (const d of liveDocuments()) if (d.influencer_id === inf.id && d.type === 'agreement') d.is_current = false
    doc = { ...base, type: 'agreement', signed_on: body.signed_on, valid_until: body.valid_until || null, is_current: true }
    inf.onboarding_checklist.agreement_signed = true
  } else {
    doc = {
      ...base,
      type: 'insights_summary',
      period_start: body.period_start,
      period_end: body.period_end,
      platform: body.platform ?? null,
    }
    inf.onboarding_checklist.insights_received = true
  }
  db.documents.push(doc)
  inf.updated_at = doc.uploaded_at
  logActivity(inf.id, 'document_uploaded', { document_id: doc.id, type: doc.type, title: doc.title }, user.id)
  return publicDocument(doc)
}

/** Soft delete. If it was the current agreement, the newest remaining version becomes current. */
export function removeDocument(doc: StoredDocument, user: User) {
  doc.deleted_at = nowIso()
  if (doc.type === 'agreement' && doc.is_current) {
    doc.is_current = false
    promoteLatestAgreement(doc.influencer_id)
  }
  logActivity(doc.influencer_id, 'document_deleted', { document_id: doc.id, type: doc.type, title: doc.title }, user.id)
}

function promoteLatestAgreement(influencerId: string) {
  const agreements = liveDocuments().filter((d) => d.influencer_id === influencerId && d.type === 'agreement')
  if (agreements.some((d) => d.type === 'agreement' && d.is_current)) return
  const latest = agreements.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0]
  if (latest?.type === 'agreement') latest.is_current = true
}

/** Merge: the duplicate's documents move to the survivor; the newest agreement stays current. */
export function moveDocuments(fromId: string, toId: string) {
  for (const d of db.documents) if (d.influencer_id === fromId) d.influencer_id = toId
  for (const d of liveDocuments()) {
    if (d.influencer_id === toId && d.type === 'agreement') d.is_current = false
  }
  promoteLatestAgreement(toId)
}

export function purgeDocuments(influencerId: string) {
  db.documents = db.documents.filter((d) => d.influencer_id !== influencerId)
}

export function filterDocuments(params: URLSearchParams, user: User): DocumentWithInfluencer[] {
  const types = params.getAll('type')
  const uploaders = params.getAll('uploaded_by')
  const q = params.get('q')?.trim().toLowerCase().replace(/^@/, '')
  const from = params.get('uploaded_from')
  const to = params.get('uploaded_to')
  return liveDocuments()
    .filter((d) => isVisibleTo(user, d))
    .filter((d) => {
      if (types.length && !types.includes(d.type)) return false
      if (uploaders.length && !uploaders.includes(d.uploaded_by)) return false
      // Date range on the IST calendar day of the upload.
      if (from && dayKey(d.uploaded_at) < from) return false
      if (to && dayKey(d.uploaded_at) > to) return false
      return true
    })
    .flatMap((d) => {
      const row = withInfluencer(d)
      return row ? [row] : []
    })
    .filter((row) => {
      if (!q) return true
      const inf = db.influencers.find((i) => i.id === row.influencer_id)
      return [row.influencer.name, ...(inf?.accounts.map((a) => a.handle) ?? [])].join(' ').toLowerCase().includes(q)
    })
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
}

// ---------------------------------------------------------------------------
// Files are kept under each document's `storage_key`: in PostgreSQL's `files` table, served by the API server at
// fileApiPath(key) (server/main.ts), or in this browser in prototype mode.

/** Where the API server takes and serves a document file. */
export const fileApiPath = (key: string) => `${API_ORIGIN}${API_BASE}/files/${encodeURIComponent(key)}`

/** A URL for this document's file: the API server's, or a blob URL in prototype mode. */
export async function fileUrl(doc: StoredDocument): Promise<string> {
  if (PROTOTYPE) {
    const url = await fileObjectUrl(doc.storage_key)
    if (!url) throw new Error('This file isn’t in this browser any more.')
    return url
  }
  return fileApiPath(doc.storage_key)
}
