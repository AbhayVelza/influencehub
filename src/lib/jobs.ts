import { JOB_POLL_INTERVAL_MS } from '@/lib/constants'
import { getSessionEpoch } from '@/lib/session'
import { ApiError, jobsApi } from '@/services'
import type { Job } from '@/types'

/** Thrown by `waitForJob` when the user signs out (or another user signs in) while it polls. Callers stay silent. */
export const SESSION_CHANGED = 'session_changed'

/** True for the error `waitForJob` throws after a sign-out: nothing to report, the screen is going away. */
export const isSessionChanged = (err: unknown) => err instanceof ApiError && err.code === SESSION_CHANGED

/**
 * Polls GET /jobs/{id} every 2 s until the job finishes. For imperative flows (bulk actions, exports)
 * that report through toasts; components that render job state should use `useJob` instead.
 * Stops (throwing a `session_changed` ApiError, see `isSessionChanged`) once the session changes, so a signed-out
 * or different user never polls, or gets toasts about, the previous user's job.
 */
export async function waitForJob<TResult>(id: string, onProgress?: (job: Job<TResult>) => void): Promise<Job<TResult>> {
  const epoch = getSessionEpoch()
  const checkSession = () => {
    if (getSessionEpoch() !== epoch) throw new ApiError(0, SESSION_CHANGED, 'Stopped because you signed out.')
  }
  for (;;) {
    checkSession()
    let job: Job<TResult>
    try {
      job = await jobsApi.get<TResult>(id)
    } catch (err) {
      // A 401 here means the API refused the token even after a refresh, so the session is ending (the sign-out and
      // reset follow asynchronously): report it as the session change rather than as a job failure.
      checkSession()
      if (err instanceof ApiError && err.status === 401) throw new ApiError(0, SESSION_CHANGED, 'Stopped because you signed out.')
      throw err
    }
    checkSession()
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
