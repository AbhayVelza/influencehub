import { FirebaseError } from 'firebase/app'
import { getResponse } from 'msw'
import { currentAuthUid } from '@/lib/auth'
import { PROTOTYPE } from '@/lib/mode'
import { db, setActingUid } from './db'
import { handlers } from './handlers'
import { connect, disconnect, flush, revert } from './persistence'
import { apiError } from './utils'

// The app's data layer. There is no API server: every call the services make (src/services, via http.ts) is
// answered here, in the browser, by the handlers in ./handlers (the business rules: stages, claims, scoping,
// permissions), over data kept in Firestore, or in this browser in prototype mode (./persistence, src/lib/mode.ts).

/** Answers one API request for the signed-in user, then saves whatever it changed. */
export async function handleApiRequest(request: Request): Promise<Response> {
  let uid = currentAuthUid()
  if (!uid) {
    disconnect()
    return apiError(401, 'unauthenticated', 'Sign in to continue.')
  }

  try {
    const access = await connect(uid)
    // Prototype mode has no sign-in: if the member you were acting as is gone or deactivated, act as an active admin.
    if (PROTOTYPE && !db.team.some((u) => u.id === uid && u.is_active)) {
      uid = db.team.find((u) => u.role === 'admin' && u.is_active)?.id ?? uid
    }
    setActingUid(uid)
    if (access === 'not_a_member') {
      return apiError(403, 'not_a_member', 'You don’t have access to InfluenceHub. Ask an admin to add you.')
    }
    if (access === 'inactive') return apiError(403, 'inactive', 'Your account has been deactivated. Ask an admin if this is a mistake.')
  } catch (err) {
    return databaseError(err)
  }

  const response = (await getResponse(handlers, request)) ?? apiError(404, 'not_found', 'Unknown endpoint')
  try {
    await flush()
  } catch (err) {
    // The rules refused part of the change (or the write failed): undo it locally and report it.
    revert()
    return databaseError(err)
  }
  return response
}

/** A CSV chosen for import: it's read here, in this tab, and never stored. */
export function storeLocalUpload(key: string, text: string) {
  db.uploads.set(key, text)
}

function databaseError(err: unknown) {
  const code = err instanceof FirebaseError ? err.code : ''
  if (code === 'permission-denied') return apiError(403, 'forbidden', 'You don’t have permission to do this.')
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return apiError(503, 'unavailable', 'Can’t reach the database. Check your connection and try again.')
  }
  console.error('Database error', err)
  return apiError(500, 'database_error', 'Something went wrong saving your data. Try again.')
}

/** Prototype mode: deletes this browser's workspace (data and files). The caller reloads the app. */
export async function resetPrototypeData() {
  const { resetPrototypeData: reset } = await import('./local-store')
  await reset()
}

/** Prototype mode: keeps an uploaded document file in this browser. */
export async function saveDocumentFile(key: string, file: Blob) {
  const { saveFile } = await import('./local-store')
  await saveFile(key, file)
}
