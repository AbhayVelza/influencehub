import { LOCAL_FILE_PREFIX } from '@/lib/upload-targets'
import { http, uploadBinary } from '@/services/http'
import type {
  DocumentCreate,
  DocumentDownload,
  DocumentListParams,
  DocumentPresignRequest,
  DocumentPresignResponse,
  DocumentWithInfluencer,
  InfluencerDocument,
  Paginated,
} from '@/types'

export const documentsApi = {
  /** Every document of one influencer (agreement versions included), newest first. */
  forInfluencer: (influencerId: string, signal?: AbortSignal) =>
    http.get<Paginated<InfluencerDocument>>(`/influencers/${influencerId}/documents`, { page_size: 200 }, signal),

  list: (params: DocumentListParams = {}, signal?: AbortSignal) =>
    http.get<Paginated<DocumentWithInfluencer>>('/documents', { ...params }, signal),

  /** Step 1: validate the file and get its upload target. */
  presign: (body: DocumentPresignRequest) => http.post<DocumentPresignResponse>('/documents/presign', body),

  /** Step 3: record the uploaded file with its metadata. */
  create: (influencerId: string, body: DocumentCreate) =>
    http.post<InfluencerDocument>(`/influencers/${influencerId}/documents`, body),

  download: (id: string) => http.get<DocumentDownload>(`/documents/${id}/download`),

  /** Soft delete (manager / admin). */
  remove: (id: string) => http.delete(`/documents/${id}`),

  /** Step 2: upload the file to the target from step 1, reporting progress (0–100). */
  upload: async (uploadUrl: string, file: File, contentType: string, onProgress?: (percent: number) => void) => {
    if (uploadUrl.startsWith(LOCAL_FILE_PREFIX)) {
      // Prototype mode: the file stays in this browser.
      const { saveDocumentFile } = await import('@/backend')
      await saveDocumentFile(uploadUrl.slice(LOCAL_FILE_PREFIX.length), file)
    } else {
      await uploadBinary(uploadUrl, file, contentType, onProgress)
    }
    onProgress?.(100)
  },
}
