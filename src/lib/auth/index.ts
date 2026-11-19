import { useSyncExternalStore } from 'react'
import { API_BASE, API_ORIGIN } from '@/lib/env'
import { OWNER_ID, PROTOTYPE } from '@/lib/mode'
import { resetSession } from '@/lib/session'

// Who is using the app, outside React and the keyed router so it survives resetSession's remount.
// - Server mode: email + password sign-in; the server keeps the session in an HttpOnly cookie (server/auth.ts).
// - Prototype mode: no sign-in; the team member picked in the account menu ("Acting as"), remembered in this browser.
// Every change of identity drops the previous user's cached data (resetSession) before the app renders again.

const STORAGE_KEY = 'influencehub-acting-as'

/** A sign-in or password error, with a message that can be shown as is. */
export class AuthError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

let uid: string | null = PROTOTYPE
  ? (() => {
      try {
        return localStorage.getItem(STORAGE_KEY) || OWNER_ID
      } catch {
        return OWNER_ID
      }
    })()
  : null
const listeners = new Set<() => void>()

function setUid(next: string | null) {
  if (next === uid) return
  uid = next
  void resetSession().finally(() => listeners.forEach((listener) => listener()))
}

/** Calls the server's /auth endpoints (not through http.ts, which reports a 401 here). */
async function authCall<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_ORIGIN}${API_BASE}/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: API_ORIGIN ? 'include' : 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AuthError('network', 'Can’t reach the server. Check your connection and try again.')
  }
  const data = (await response.json().catch(() => null)) as { error?: { code: string; message: string } } | null
  if (!response.ok) throw new AuthError(data?.error?.code ?? 'unknown', data?.error?.message ?? 'Something went wrong. Try again.')
  return data as T
}

/** Server mode: restores the session (if the cookie is still valid) before the first render. */
export async function initAuth() {
  if (PROTOTYPE) return
  uid = await authCall<{ id: string }>('session').then((me) => me.id, () => null)
}

export async function signIn(email: string, password: string) {
  setUid((await authCall<{ id: string }>('sign-in', { email, password })).id)
}

/** Signs out; the route guard then sends the user to /login. */
export async function signOut() {
  await authCall('sign-out', {}).catch(() => undefined)
  setUid(null)
}

/** The server refused the session (expired, signed out elsewhere): back to the sign-in page. */
export const sessionEnded = () => setUid(null)

export const changePassword = (currentPassword: string, newPassword: string) =>
  authCall('password', { current_password: currentPassword, new_password: newPassword })

/** An admin sets a member's password (it signs them out everywhere). */
export const setMemberPassword = (userId: string, password: string) => authCall('set-password', { user_id: userId, password })

/** Prototype mode: act as another team member. */
export function switchUser(next: string) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not remembered after a reload; the switch still applies now.
  }
  setUid(next)
}

/** The signed-in (or acting) member's id. */
export const currentAuthUid = () => uid

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The signed-in (or acting) member's id, or null when signed out. */
export function useAuthUser(): string | null {
  return useSyncExternalStore(subscribe, () => uid)
}
