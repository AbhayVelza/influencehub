import { formatDay, todayKey } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import type { DocumentType, InfluencerDocument } from '@/types'

export const DOCUMENT_TYPE_META: Record<DocumentType, { label: string; plural: string }> = {
  insights_summary: { label: 'Insights summary', plural: 'Insights summaries' },
  agreement: { label: 'Agreement', plural: 'Agreements' },
}

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_META) as DocumentType[]

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

/** The allowed files: PDF, JPG, PNG, DOCX, XLSX. */
export const DOCUMENT_FILE_TYPES: { extensions: string[]; contentType: string; label: string }[] = [
  { extensions: ['pdf'], contentType: 'application/pdf', label: 'PDF' },
  { extensions: ['jpg', 'jpeg'], contentType: 'image/jpeg', label: 'JPG' },
  { extensions: ['png'], contentType: 'image/png', label: 'PNG' },
  { extensions: ['docx'], contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'DOCX' },
  { extensions: ['xlsx'], contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'XLSX' },
]

export const ALLOWED_CONTENT_TYPES = DOCUMENT_FILE_TYPES.map((t) => t.contentType)

/** For the file picker's `accept`. */
export const DOCUMENT_ACCEPT = DOCUMENT_FILE_TYPES.flatMap((t) => t.extensions.map((e) => `.${e}`)).join(',')

export const DOCUMENT_FILE_HINT = `${DOCUMENT_FILE_TYPES.map((t) => t.label).join(', ')} · up to 20 MB`

const extensionOf = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? ''

/** The content type for a file name (browsers often leave `File.type` empty for DOCX / XLSX). */
export function contentTypeFor(fileName: string): string | null {
  const ext = extensionOf(fileName)
  return DOCUMENT_FILE_TYPES.find((t) => t.extensions.includes(ext))?.contentType ?? null
}

/** Checked before anything is uploaded: allowed type, not empty, at most 20 MB. */
export function validateDocumentFile(file: { name: string; size: number }): { ok: true; contentType: string } | { ok: false; error: string } {
  const contentType = contentTypeFor(file.name)
  if (!contentType) return { ok: false, error: `${file.name} isn’t supported. Upload a PDF, JPG, PNG, DOCX or XLSX file.` }
  if (file.size === 0) return { ok: false, error: `${file.name} is empty.` }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: `${file.name} is ${formatFileSize(file.size)}. The limit is ${formatFileSize(MAX_DOCUMENT_BYTES)}.` }
  }
  return { ok: true, contentType }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

/** Shown in a preview dialog: PDFs and images. Everything else downloads. */
export function canPreview(contentType: string): boolean {
  return contentType === 'application/pdf' || contentType.startsWith('image/')
}

/** Agreement versions of one influencer, newest first (the current one is first, since a new upload becomes current). */
export function agreementVersions(documents: InfluencerDocument[]) {
  return documents.filter((d): d is Extract<InfluencerDocument, { type: 'agreement' }> => d.type === 'agreement')
}

/** "01/09/2026 – 30/09/2026 · Instagram" / "Signed 28/10/2026 · valid until 28/10/2027". */
export function documentDetail(doc: InfluencerDocument): string {
  if (doc.type === 'insights_summary') {
    const period = `${formatDay(doc.period_start)} – ${formatDay(doc.period_end)}`
    return doc.platform ? `${period} · ${PLATFORM_META[doc.platform].label}` : period
  }
  return `Signed ${formatDay(doc.signed_on)}${doc.valid_until ? ` · valid until ${formatDay(doc.valid_until)}` : ''}`
}

export function isExpired(doc: InfluencerDocument): boolean {
  return doc.type === 'agreement' && !!doc.valid_until && doc.valid_until < todayKey()
}
