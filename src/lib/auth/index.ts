import { OWNER_ID } from '@/lib/mode'
import { resetSession } from '@/lib/session'

// No sign-in (for now): "who you are" is the team member picked in the account menu ("Acting as"), remembered in
// this browser. It starts as the workspace owner (an admin); the data layer falls back to an active admin when the
// chosen member is gone or deactivated (resolveActingUid in src/backend/db.ts).

const STORAGE_KEY = 'influencehub-acting-as'

let uid = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) || OWNER_ID
  } catch {
    return OWNER_ID
  }
})()

/** The acting member's id, sent with every API call. */
export const currentAuthUid = () => uid

/** Act as another team member; the previous member's cached data is dropped (resetSession). */
export function switchUser(next: string) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not remembered after a reload; the switch still applies now.
  }
  if (next === uid) return
  uid = next
  void resetSession()
}
