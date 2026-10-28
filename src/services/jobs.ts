import { http } from '@/services/http'
import type { CsvImportRequest, CsvPresignResponse, ExportRequest, Job, JobRef } from '@/types'

export const jobsApi = {
  get: <TResult = unknown>(id: string, signal?: AbortSignal) => http.get<Job<TResult>>(`/jobs/${id}`, undefined, signal),
}

export const instagramApi = {
  /** Fails fast with 409 `already_exists` when the handle is already in the CRM. */
  lookup: (username: string) => http.post<JobRef>('/instagram/lookup', { username }),
}

export const importsApi = {
  presignCsv: (filename: string) => http.post<CsvPresignResponse>('/imports/csv/presign', { filename }),

  /** Uploads the file to the presigned URL (S3 in production, MSW in mock mode). */
  uploadToPresignedUrl: async (uploadUrl: string, file: File) => {
    const response = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'text/csv' } })
    if (!response.ok) throw new Error(`Upload failed (${response.status})`)
  },

  startCsvImport: (body: CsvImportRequest) => http.post<JobRef>('/imports/csv', body),
}

export const exportsApi = {
  influencers: (body: ExportRequest) => http.post<JobRef>('/exports/influencers', body),
}
