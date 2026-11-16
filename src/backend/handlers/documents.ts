import { http, HttpResponse } from 'msw'
import { PROTOTYPE } from '@/lib/mode'
import { LOCAL_FILE_PREFIX } from '@/lib/upload-targets'
import { ALLOWED_CONTENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/documents'
import { can } from '@/lib/permissions'
import type { DocumentCreate, DocumentPresignRequest } from '@/types'
import { currentUser, db, nextId } from '../db'
import { findVisible } from '../domain'
import {
  addDocument,
  documentOwner,
  fileApiPath,
  fileUrl,
  filterDocuments,
  findDocument,
  liveDocuments,
  publicDocument,
  removeDocument,
  validateDocumentBody,
} from '../documents'
import { api, apiError, forbidden, notFound, paginate, readJson } from '../utils'

/** Documents of unassigned influencers are never served: managers get 409, executives can't see them at all (404). */
function ownerOr(influencerId: string) {
  const user = currentUser()
  const inf = documentOwner(influencerId, user)
  if (inf) return { inf }
  const visible = findVisible(influencerId, user)
  return {
    error: visible
      ? apiError(409, 'in_pool', 'Documents aren’t kept for influencers in the Unassigned Pool. Assign an owner first.')
      : notFound('Influencer'),
  }
}

export const documentHandlers = [
  // Step 1 of an upload: validate the file, hand out the URL to PUT it to.
  http.post(api('/documents/presign'), async ({ request }) => {
    const user = currentUser()
    if (!can(user.role, 'document:upload')) return forbidden('You can’t upload documents')
    const body = await readJson<Partial<DocumentPresignRequest>>(request)
    const owner = ownerOr(String(body.influencer_id ?? ''))
    if (owner.error) return owner.error
    if (body.type !== 'insights_summary' && body.type !== 'agreement') return apiError(422, 'validation_error', 'Unknown document type')
    if (!body.file_name?.trim()) return apiError(422, 'validation_error', 'File name is required')
    if (!body.content_type || !ALLOWED_CONTENT_TYPES.includes(body.content_type)) {
      return apiError(422, 'unsupported_file_type', 'Upload a PDF, JPG, PNG, DOCX or XLSX file')
    }
    if (!(body.size && body.size > 0)) return apiError(422, 'validation_error', 'The file is empty')
    if (body.size > MAX_DOCUMENT_BYTES) return apiError(422, 'file_too_large', 'Files can be at most 20 MB')

    const key = `documents/${owner.inf.id}/${nextId('up')}-${body.file_name.replace(/[^\w.-]/g, '_')}`
    db.documentUploads.set(key, {
      influencer_id: owner.inf.id,
      type: body.type,
      file_name: body.file_name.trim(),
      content_type: body.content_type,
      size: body.size,
    })
    // The client uploads the file there (documentsApi.upload), then saves the metadata.
    return HttpResponse.json({ upload_url: PROTOTYPE ? `${LOCAL_FILE_PREFIX}${key}` : fileApiPath(key), key })
  }),

  http.get(api('/influencers/:id/documents'), async ({ params, request }) => {
    const owner = ownerOr(String(params.id))
    if (owner.error) return owner.error
    const list = liveDocuments()
      .filter((d) => d.influencer_id === owner.inf.id)
      .map(publicDocument)
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    return HttpResponse.json(paginate(list, new URL(request.url).searchParams, 200))
  }),

  // Step 3: save the metadata for the uploaded file.
  http.post(api('/influencers/:id/documents'), async ({ params, request }) => {
    const user = currentUser()
    if (!can(user.role, 'document:upload')) return forbidden('You can’t upload documents')
    const owner = ownerOr(String(params.id))
    if (owner.error) return owner.error
    const body = await readJson<Partial<DocumentCreate>>(request)
    const upload = body.key ? db.documentUploads.get(body.key) : undefined
    if (!upload || upload.influencer_id !== owner.inf.id || upload.type !== body.type) {
      return apiError(422, 'upload_missing', 'The file wasn’t uploaded. Choose it again.')
    }
    const invalid = validateDocumentBody(body)
    if (invalid) return apiError(422, invalid.code, invalid.message)
    const doc = addDocument(owner.inf, upload, body as DocumentCreate, user)
    db.documentUploads.delete(body.key!)
    return HttpResponse.json(doc, { status: 201 })
  }),

  http.get(api('/documents'), async ({ request }) => {
    const params = new URL(request.url).searchParams
    return HttpResponse.json(paginate(filterDocuments(params, currentUser()), params))
  }),

  http.get(api('/documents/:id/download'), async ({ params }) => {
    const found = findDocument(String(params.id), currentUser())
    if (!found) return notFound('Document')
    return HttpResponse.json({ url: await fileUrl(found.doc) })
  }),

  http.delete(api('/documents/:id'), async ({ params }) => {
    const user = currentUser()
    const found = findDocument(String(params.id), user)
    if (!found) return notFound('Document')
    if (!can(user.role, 'document:delete')) return forbidden('Only managers and admins can delete documents')
    removeDocument(found.doc, user)
    return new HttpResponse(null, { status: 204 })
  }),
]
