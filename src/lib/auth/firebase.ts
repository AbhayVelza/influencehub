import { FirebaseError } from 'firebase/app'
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import { firebaseAuth } from '@/lib/firebase'
import { AuthError, MIN_PASSWORD_LENGTH, type AuthClient, type AuthUser } from './types'

// Firebase Authentication (email + password). The app instance comes from src/lib/firebase.ts.

const INVALID_CREDENTIALS = 'Email or password is incorrect.'
const WEAK_PASSWORD = `Use at least ${MIN_PASSWORD_LENGTH} characters.`

const toAuthUser = (user: User | null): AuthUser | null => (user ? { uid: user.uid, email: user.email ?? '' } : null)

const firebaseCode = (err: unknown) => (err instanceof FirebaseError ? err.code : '')

/** Errors shared by sign-in and re-authentication; anything else falls back to `fallback`. */
function mapCommonError(code: string, fallback: AuthError): AuthError {
  switch (code) {
    case 'auth/user-disabled':
      return new AuthError('user_disabled', 'This account has been deactivated. Ask an admin.')
    case 'auth/too-many-requests':
      return new AuthError('too_many_requests', 'Too many attempts. Wait a few minutes and try again.')
    case 'auth/network-request-failed':
      return new AuthError('network', 'Could not reach the sign-in service. Check your connection.')
    default:
      return fallback
  }
}

const CREDENTIAL_ERRORS = new Set([
  'auth/invalid-credential',
  'auth/invalid-email',
  'auth/user-not-found',
  'auth/wrong-password',
])

function mapSignInError(err: unknown): AuthError {
  const code = firebaseCode(err)
  if (CREDENTIAL_ERRORS.has(code)) return new AuthError('invalid_credentials', INVALID_CREDENTIALS)
  return mapCommonError(code, new AuthError('unknown', 'Sign-in failed. Try again.'))
}

export function createFirebaseAuth(): AuthClient {
  const auth = firebaseAuth()

  return {
    ready: auth.authStateReady(),
    currentUser: () => toAuthUser(auth.currentUser),
    onChange: (listener) => onAuthStateChanged(auth, (user) => listener(toAuthUser(user))),

    async signIn(email, password) {
      try {
        const { user } = await signInWithEmailAndPassword(auth, email.trim(), password)
        return { uid: user.uid, email: user.email ?? email.trim() }
      } catch (err) {
        throw mapSignInError(err)
      }
    },

    signOut: () => signOut(auth),

    async getIdToken(forceRefresh) {
      return (await auth.currentUser?.getIdToken(forceRefresh)) ?? null
    },

    async changePassword(currentPassword, newPassword) {
      const user = auth.currentUser
      if (!user?.email) throw new AuthError('not_signed_in', 'Sign in again to change your password.')
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
      } catch (err) {
        const code = firebaseCode(err)
        if (CREDENTIAL_ERRORS.has(code)) throw new AuthError('wrong_password', 'Current password is incorrect.')
        throw mapCommonError(code, new AuthError('unknown', 'Could not change the password. Try again.'))
      }
      if (newPassword.length < MIN_PASSWORD_LENGTH) throw new AuthError('weak_password', WEAK_PASSWORD)
      try {
        await updatePassword(user, newPassword)
      } catch (err) {
        const code = firebaseCode(err)
        if (code === 'auth/weak-password') throw new AuthError('weak_password', WEAK_PASSWORD)
        throw mapCommonError(code, new AuthError('unknown', 'Could not change the password. Try again.'))
      }
    },
  }
}
