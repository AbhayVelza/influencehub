import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDownloadURL, getStorage } from 'firebase-admin/storage'
import type { SignInAccountResult } from '@/backend/sign-in-accounts'

// Firebase still does two jobs: sign-in (Auth) and document files (Storage). The server uses the Admin SDK for both,
// with the service account named by GOOGLE_APPLICATION_CREDENTIALS.

/** The claim storage.rules checks before a browser may upload or read a document file. */
const MEMBER_CLAIM = 'ih_member'

function app(): App {
  return (
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID?.trim() || undefined,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    })
  )
}

const errorCode = (err: unknown) =>
  err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : ''

/** The Firebase uid behind an `Authorization: Bearer <ID token>` header, or null when it's missing or not valid. */
export async function verifyToken(header: string | null): Promise<string | null> {
  if (!header?.startsWith('Bearer ')) return null
  try {
    return (await getAuth(app()).verifyIdToken(header.slice(7).trim())).uid
  } catch (err) {
    const code = errorCode(err)
    // An expired or malformed token is the caller's problem; anything else (no credentials, no network) is ours.
    if (!code.startsWith('auth/id-token') && code !== 'auth/argument-error') console.error('Could not verify a sign-in token', err)
    return null
  }
}

/** Creates a team member's sign-in account with the password the admin chose. */
export async function createSignInAccount(email: string, password: string): Promise<SignInAccountResult> {
  try {
    const user = await getAuth(app()).createUser({ email, password })
    try {
      await getAuth(app()).setCustomUserClaims(user.uid, { [MEMBER_CLAIM]: true })
    } catch (err) {
      // Don't leave a half-made account behind: a retry would otherwise fail with "email already exists".
      await getAuth(app()).deleteUser(user.uid).catch(() => undefined)
      throw err
    }
    return { ok: true, uid: user.uid }
  } catch (err) {
    const code = errorCode(err)
    if (code === 'auth/email-already-exists') {
      return {
        ok: false,
        status: 409,
        code: 'email_taken',
        message: 'This email already has a sign-in account. Use another email, or remove the old account in the Firebase console.',
      }
    }
    if (code === 'auth/invalid-password') return { ok: false, status: 422, code: 'weak_password', message: 'Choose a longer password' }
    if (code === 'auth/invalid-email') return { ok: false, status: 422, code: 'validation_error', message: 'Enter a valid email' }
    console.error('Could not create a sign-in account', err)
    return { ok: false, status: 500, code: 'sign_in_account_failed', message: 'Couldn’t create their sign-in account. Try again.' }
  }
}

/**
 * Keeps a member's file access in step with their team record: active members carry the claim storage.rules checks;
 * a deactivated member loses it and is signed out everywhere.
 */
export async function syncMemberAccess(uid: string, isActive: boolean): Promise<void> {
  try {
    await getAuth(app()).setCustomUserClaims(uid, { [MEMBER_CLAIM]: isActive })
    if (!isActive) await getAuth(app()).revokeRefreshTokens(uid)
  } catch (err) {
    console.error(`Could not update file access for team member ${uid}`, err)
  }
}

/** A download URL for a document file in Firebase Storage. */
export function fileUrl(storageKey: string): Promise<string> {
  return getDownloadURL(getStorage(app()).bucket().file(storageKey))
}
