import { PROTOTYPE_OWNER_ID } from '@/lib/mode'
import { AuthError, type AuthClient, type AuthUser } from './types'

// Prototype mode: no sign-in. "Who you are" is the team member picked in the account menu ("Acting as"), remembered
// in this browser. Starts as the workspace owner (an admin). The data layer falls back to an active admin if the
// chosen member no longer exists or was deactivated.

const STORAGE_KEY = 'influencehub-acting-as'

function stored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || PROTOTYPE_OWNER_ID
  } catch {
    return PROTOTYPE_OWNER_ID
  }
}

export function createLocalAuth(): AuthClient {
  let user: AuthUser = { uid: stored(), email: '' }
  const listeners = new Set<(user: AuthUser | null) => void>()
  const notSupported = () => Promise.reject(new AuthError('unknown', 'There’s no sign-in in prototype mode.'))

  return {
    ready: Promise.resolve(),
    currentUser: () => user,
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    signIn: notSupported,
    signOut: () => Promise.resolve(),
    getIdToken: () => Promise.resolve(null),
    changePassword: notSupported,
    switchUser(uid) {
      try {
        localStorage.setItem(STORAGE_KEY, uid)
      } catch {
        // Not remembered after a reload; the switch still applies now.
      }
      user = { uid, email: '' }
      for (const listener of listeners) listener(user)
    },
  }
}
