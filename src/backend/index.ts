import { getResponse } from 'msw'
import { currentAuthUid } from '@/lib/auth'
import { db, isRead, readChangedData, resolveActingUid, setActingUid } from './db'
import { handlers } from './handlers'
import { commitJobs, executeJob, revertJobs } from './jobs'
import { connect, flush, localPlatformData, reload, resetPrototypeData as resetStore, revert, SavedInOtherTab, saveFile } from './local-store'
import { setPlatformData } from './platform-data'
import { dropQueuedSyncedData, saveQueuedSyncedData } from './social'
import { apiError } from './utils'

// The data layer as it runs in the browser, in prototype mode only (src/lib/mode.ts): every call the services make
// (src/services, via http.ts) is answered here by the handlers in ./handlers (the business rules: stages, claims,
// scoping, permissions), over data kept in this browser (./local-store). With VITE_API_SERVER=true the same handlers
// run on the API server instead (server/main.ts), over PostgreSQL, and this module isn't loaded.

// Follower history and recent posts live beside the workspace in this browser's IndexedDB.
setPlatformData(localPlatformData)

/** Requests are answered one at a time: the handlers share one working copy and one "current user". */
let queue: Promise<unknown> = Promise.resolve()
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

// Live updates between the tabs of this browser (src/lib/live.ts): a tab that saved tells the others, which load the
// saved workspace again (between requests) and then refresh their screens. Messages carry no data.
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('influencehub-prototype-live')
const changeListeners = new Set<() => void>()
let version = 0

/** Loads what other tabs saved since this tab last read or wrote (inside a turn), then tells the listeners. */
async function catchUp() {
  if (await reload()) changeListeners.forEach((listener) => listener())
}

// The message is a hint: every request also catches up first, and a save that would write over another tab's newer
// one is refused (local-store's flush), since a request may run before the message that came ahead of it.
if (channel) {
  channel.onmessage = () => {
    void inTurn(catchUp).catch((err: unknown) => console.error('Database error', err))
  }
}

const tellOtherTabs = () => channel?.postMessage({ v: ++version })

/** Calls `listener` after another tab's change was loaded here; returns the unsubscribe function. */
export function onOtherTabChange(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

/** Answers one API request for the acting member (src/lib/auth, prototype mode), then saves whatever it changed. */
export function handleApiRequest(request: Request): Promise<Response> {
  return inTurn(async () => {
    try {
      await connect()
      await catchUp()
    } catch (err) {
      console.error('Database error', err)
      return apiError(500, 'database_error', 'Something went wrong loading your data. Try again.')
    }
    // Prototype mode has no sign-in: requests act as the member picked in the account menu.
    setActingUid(resolveActingUid(currentAuthUid()))

    try {
      const response = (await getResponse(handlers, request)) ?? apiError(404, 'not_found', 'Unknown endpoint')
      if (response.status === 202) {
        const data = await response.clone().json().catch(() => null)
        if (data && typeof data === 'object' && 'job_id' in data && typeof data.job_id === 'string') {
          await executeJob(data.job_id)
        }
      }
      if ((!isRead(request) || readChangedData()) && (await flush())) tellOtherTabs()
      commitJobs()
      await saveQueuedSyncedData()
      return response
    } catch (err) {
      revertJobs()
      dropQueuedSyncedData()
      revert()
      if (err instanceof SavedInOtherTab) {
        // Another tab saved while this request ran: its change stays, this one is dropped and can be made again.
        await catchUp().catch(() => undefined)
        return apiError(409, 'changed_elsewhere', 'Another tab changed the data at the same moment. Try again.')
      }
      return apiError(500, 'database_error', 'Something went wrong saving your data. Try again.')
    } finally {
      setActingUid(null)
    }
  })
}

/** Prototype mode: keeps an uploaded document file in this browser; its metadata can then be saved (FR-DOC-02). */
export function saveDocumentFile(key: string, file: Blob): Promise<void> {
  return inTurn(async () => {
    await saveFile(key, file)
    const upload = db.documentUploads.get(key)
    if (upload) upload.uploaded = true
  })
}

/** Prototype mode: deletes this browser's workspace (data and files; the caller reloads the app). Other tabs start over too. */
export async function resetPrototypeData(): Promise<void> {
  await resetStore()
  tellOtherTabs()
}
