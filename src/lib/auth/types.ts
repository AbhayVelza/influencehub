/** Who is signed in, as far as the identity provider knows. The role and team record come from GET /me. */
export interface AuthUser {
  uid: string
  email: string
}

/** The identity provider: Firebase Authentication (./firebase.ts), or no sign-in in prototype mode (./local.ts). */
export interface AuthClient {
  /** Settles once a persisted session (if any) has been restored; nothing reads the user before that. */
  ready: Promise<void>
  currentUser(): AuthUser | null
  /** Called on every sign-in and sign-out (not on token refreshes). Returns an unsubscribe function. */
  onChange(listener: (user: AuthUser | null) => void): () => void
  /** Throws `AuthError` (`invalid_credentials`, `too_many_requests`, `network`, …). */
  signIn(email: string, password: string): Promise<AuthUser>
  signOut(): Promise<void>
  /** The bearer token for API calls; null when signed out. `forceRefresh` gets a fresh one (after a 401). */
  getIdToken(forceRefresh?: boolean): Promise<string | null>
  /** Re-checks the current password, then sets the new one. Throws `AuthError` (`wrong_password`, `weak_password`, …). */
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  /** Prototype mode only: act as another team member (there is no sign-in). */
  switchUser?(uid: string): void
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'wrong_password'
  | 'weak_password'
  | 'too_many_requests'
  | 'user_disabled'
  | 'network'
  | 'not_signed_in'
  | 'not_configured'
  | 'unknown'

/** Sign-in and password errors, with a message that can be shown as is. */
export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

/** Minimum length for passwords set here (admin-created users, changed passwords, the seeded admin). */
export const MIN_PASSWORD_LENGTH = 8
