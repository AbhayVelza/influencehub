import { getResponse } from 'msw'
import { currentAuthUid } from '@/lib/auth'
import { ACTING_AS_HEADER } from '@/lib/env'
import { resolveActingUid, setActingUid } from './db'
import { handlers } from './handlers'
import { commitJobs, executeJob, revertJobs } from './jobs'
import { connect, flush, resetPrototypeData, revert, saveFile } from './local-store'
import { apiError } from './utils'

// The data layer as it runs in the browser, in prototype mode only (src/lib/mode.ts): every call the services make
// (src/services, via http.ts) is answered here by the handlers in ./handlers (the business rules: stages, claims,
// scoping, permissions), over data kept in this browser (./local-store). With VITE_API_SERVER=true the same handlers
// run on the API server instead (server/main.ts), over PostgreSQL, and this module isn't loaded.

/** Requests are answered one at a time: the handlers share one working copy and one "current user". */
let queue: Promise<unknown> = Promise.resolve()
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

/** Answers one API request for the acting member (src/lib/auth, prototype mode), then saves whatever it changed. */
export function handleApiRequest(request: Request): Promise<Response> {
  return inTurn(async () => {
    try {
      await connect()
    } catch (err) {
      console.error('Database error', err)
      return apiError(500, 'database_error', 'Something went wrong loading your data. Try again.')
    }
    setActingUid(resolveActingUid(request.headers.get(ACTING_AS_HEADER) ?? currentAuthUid()))

    try {
      const response = (await getResponse(handlers, request)) ?? apiError(404, 'not_found', 'Unknown endpoint')
      if (response.status === 202) {
        const data = await response.clone().json().catch(() => null)
        if (data && typeof data === 'object' && 'job_id' in data && typeof data.job_id === 'string') {
          executeJob(data.job_id)
        }
      }
      await flush()
      commitJobs()
      return response
    } catch {
      revertJobs()
      revert()
      return apiError(500, 'database_error', 'Something went wrong saving your data. Try again.')
    } finally {
      setActingUid(null)
    }
  })
}

/** Prototype mode: deletes this browser's workspace (data and files; the caller reloads the app), and keeps an
 * uploaded document file in this browser. */
export { resetPrototypeData, saveFile as saveDocumentFile }
