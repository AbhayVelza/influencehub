import { http } from '@/services/http'
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

  /** Step 1: validate the file and get a URL to PUT it to (S3 in production, MSW in mock mode). */
  presign: (body: DocumentPresignRequest) => http.post<DocumentPresignResponse>('/documents/presign', body),

  /** Step 3: record the uploaded file with its metadata. */
  create: (influencerId: string, body: DocumentCreate) =>
    http.post<InfluencerDocument>(`/influencers/${influencerId}/documents`, body),

  download: (id: string) => http.get<DocumentDownload>(`/documents/${id}/download`),

  /** Soft delete (manager / admin). */
  remove: (id: string) => http.delete(`/documents/${id}`),

  /** Step 2: PUT the file to the presigned URL, reporting progress (0–100). */
  upload: (uploadUrl: string, file: File, contentType: string, onProgress?: (percent: number) => void) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100)
          resolve()
        } else reject(new Error(`Upload failed (${xhr.status})`))
      }
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))
      xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
      xhr.send(file)
    }),
}
