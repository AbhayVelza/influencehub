import { useSyncExternalStore } from 'react'
import { PROTOTYPE } from '@/lib/mode'
import { resetSession } from '@/lib/session'
import { AuthError, type AuthClient, type AuthUser } from './types'

export { AuthError, MIN_PASSWORD_LENGTH, type AuthClient, type AuthUser } from './types'

// The signed-in identity lives here, outside React and outside the keyed router, so it survives resetSession's
// remount and is subscribed to exactly once. Every change of identity (sign-in, sign-out, session ended) drops the
// previous user's cached data through resetSession before the app renders again.

let client: AuthClient | null = null
let user: AuthUser | null = null
let initError: AuthError | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Loads Firebase Authentication (or prototype mode's no-sign-in client) and restores the session before rendering. */
export async function initAuth(): Promise<void> {
  try {
    client = PROTOTYPE ? (await import('./local')).createLocalAuth() : (await import('./firebase')).createFirebaseAuth()
    await client.ready
  } catch (err) {
    initError = err instanceof AuthError ? err : new AuthError('not_configured', 'Sign-in isn’t set up for this app.')
    client = null
    emit()
    return
  }
  user = client.currentUser()
  client.onChange((next) => {
    const changed = next?.uid !== user?.uid
    user = next
    if (!changed) return emit()
    void resetSession().finally(emit)
  })
  emit()
}

function requireClient(): AuthClient {
  if (!client) throw initError ?? new AuthError('not_configured', 'Sign-in isn’t set up for this app.')
  return client
}

export const signIn = (email: string, password: string) => requireClient().signIn(email, password)

export const changePassword = (currentPassword: string, newPassword: string) =>
  requireClient().changePassword(currentPassword, newPassword)

/** Prototype mode: act as another team member; cached data is dropped like on a sign-in. */
export const switchUser = (uid: string) => requireClient().switchUser?.(uid)

/** The signed-in user's Firebase ID token for real API calls. */
export async function getIdToken(): Promise<string | null> {
  if (PROTOTYPE) return null
  const { firebaseAuth } = await import('@/lib/firebase')
  return (await firebaseAuth().currentUser?.getIdToken()) ?? null
}

/** The signed-in (or, in prototype mode, acting) user's id, for the data layer. */
export const currentAuthUid = () => user?.uid ?? null

/** Signs out; the change listener then drops cached data and the route guard sends the user to /login. */
export const signOut = () => requireClient().signOut()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The signed-in user, or null. Updates on sign-in and sign-out. */
export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(subscribe, () => user)
}

/** Set when the identity provider couldn't start (e.g. Firebase config missing); the app shows it instead of sign-in. */
export function useAuthInitError(): AuthError | null {
  return useSyncExternalStore(subscribe, () => initError)
}
