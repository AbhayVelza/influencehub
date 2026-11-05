import { LOCAL_FILE_PREFIX, STORAGE_UPLOAD_PREFIX } from '@/lib/upload-targets'
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

  /** Step 1: validate the file and get its Firebase Storage target. */
  presign: (body: DocumentPresignRequest) => http.post<DocumentPresignResponse>('/documents/presign', body),

  /** Step 3: record the uploaded file with its metadata. */
  create: (influencerId: string, body: DocumentCreate) =>
    http.post<InfluencerDocument>(`/influencers/${influencerId}/documents`, body),

  download: (id: string) => http.get<DocumentDownload>(`/documents/${id}/download`),

  /** Soft delete (manager / admin). */
  remove: (id: string) => http.delete(`/documents/${id}`),

  /** Step 2: upload the file to Firebase Storage at the key from step 1, reporting progress (0–100). */
  upload: async (uploadUrl: string, file: File, contentType: string, onProgress?: (percent: number) => void) => {
    if (uploadUrl.startsWith(LOCAL_FILE_PREFIX)) {
      // Prototype mode: the file stays in this browser.
      const { saveDocumentFile } = await import('@/backend')
      await saveDocumentFile(uploadUrl.slice(LOCAL_FILE_PREFIX.length), file)
      onProgress?.(100)
      return
    }
    if (!uploadUrl.startsWith(STORAGE_UPLOAD_PREFIX)) throw new Error('Upload failed: unknown upload target.')
    const [{ ref, uploadBytesResumable }, { firebaseStorage }] = await Promise.all([
      import('firebase/storage'),
      import('@/lib/firebase-data'),
    ])
    const task = uploadBytesResumable(ref(firebaseStorage(), uploadUrl.slice(STORAGE_UPLOAD_PREFIX.length)), file, { contentType })
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => snap.totalBytes && onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => {
          if (err.code === 'storage/canceled') reject(new DOMException('Upload cancelled', 'AbortError'))
          else if (err.code === 'storage/unauthorized') reject(new Error('You don’t have permission to upload this file.'))
          else reject(new Error('Upload failed. Check your connection and try again.'))
        },
        () => {
          onProgress?.(100)
          resolve()
        },
      )
    })
  },
}
