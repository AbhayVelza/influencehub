import { LOCAL_UPLOAD_PREFIX } from '@/lib/upload-targets'
import { http } from '@/services/http'
import type { CsvImportRequest, CsvPresignResponse, ExportRequest, Job, JobRef } from '@/types'

export const jobsApi = {
  get: <TResult = unknown>(id: string, signal?: AbortSignal) => http.get<Job<TResult>>(`/jobs/${id}`, undefined, signal),
}

export const importsApi = {
  presignCsv: (filename: string) => http.post<CsvPresignResponse>('/imports/csv/presign', { filename }),

  /** Step 2: hand the CSV to the data layer in this tab (it's read for the import, never stored). */
  uploadToPresignedUrl: async (uploadUrl: string, file: File) => {
    if (!uploadUrl.startsWith(LOCAL_UPLOAD_PREFIX)) throw new Error('Upload failed: unknown upload target.')
    const { storeLocalUpload } = await import('@/backend')
    storeLocalUpload(uploadUrl.slice(LOCAL_UPLOAD_PREFIX.length), await file.text())
  },

  startCsvImport: (body: CsvImportRequest) => http.post<JobRef>('/imports/csv', body),
}

export const exportsApi = {
  influencers: (body: ExportRequest) => http.post<JobRef>('/exports/influencers', body),
}
