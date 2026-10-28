import { JOB_POLL_INTERVAL_MS } from '@/lib/constants'
import { jobsApi } from '@/services'
import type { Job } from '@/types'

/**
 * Polls GET /jobs/{id} every 2 s until the job finishes. For imperative flows (bulk actions, exports)
 * that report through toasts; components that render job state should use `useJob` instead.
 */
export async function waitForJob<TResult>(id: string, onProgress?: (job: Job<TResult>) => void): Promise<Job<TResult>> {
  for (;;) {
    const job = await jobsApi.get<TResult>(id)
    onProgress?.(job)
    if (job.status === 'succeeded' || job.status === 'failed') return job
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS))
  }
}

/** Triggers a browser download for a URL returned by the API (presigned URL or data URL). */
export function downloadFile(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
