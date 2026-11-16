import { getResponse } from 'msw'
import { currentAuthUid } from '@/lib/auth'
import { resolveActingUid, setActingUid } from './db'
import { handlers } from './handlers'
import { connect, flush, resetPrototypeData, saveFile } from './local-store'
import { apiError } from './utils'

// The data layer as it runs in the browser, in prototype mode only (src/lib/mode.ts): every call the services make
// (src/services, via http.ts) is answered here by the handlers in ./handlers (the business rules: stages, claims,
// scoping, permissions), over data kept in this browser (./local-store). With VITE_API_SERVER=true the same handlers
// run on the API server instead (server/main.ts), over PostgreSQL, and this module isn't loaded.

/** Answers one API request for the acting member (src/lib/auth, prototype mode), then saves whatever it changed. */
export async function handleApiRequest(request: Request): Promise<Response> {
  try {
    await connect()
  } catch (err) {
    console.error('Database error', err)
    return apiError(500, 'database_error', 'Something went wrong loading your data. Try again.')
  }
  setActingUid(resolveActingUid(currentAuthUid()))

  const response = (await getResponse(handlers, request)) ?? apiError(404, 'not_found', 'Unknown endpoint')
  await flush()
  return response
}

/** Prototype mode: deletes this browser's workspace (data and files; the caller reloads the app), and keeps an
 * uploaded document file in this browser. */
export { resetPrototypeData, saveFile as saveDocumentFile }
