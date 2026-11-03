import { deleteApp, FirebaseError, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth'
import { firebaseConfig } from '@/lib/firebase'

type Result = { ok: true; uid: string } | { ok: false; status: number; code: string; message: string }

/**
 * Creates a team member's Firebase sign-in account with the password the admin chose. Without a server (Admin SDK)
 * this runs in a separate, throwaway Firebase app, so the admin stays signed in as themselves.
 * Needs Email/Password sign-up enabled in Firebase (Authentication > Settings > User actions); people who sign up
 * on their own get no access anyway, because firestore.rules only admit members with an active team record.
 */
export async function createSignInAccount(email: string, password: string): Promise<Result> {
  const app = initializeApp(firebaseConfig(), `add-member-${crypto.randomUUID()}`)
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence })
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    await signOut(auth)
    return { ok: true, uid: user.uid }
  } catch (err) {
    const code = err instanceof FirebaseError ? err.code : ''
    if (code === 'auth/email-already-in-use') {
      return {
        ok: false,
        status: 409,
        code: 'email_taken',
        message: 'This email already has a sign-in account. Use another email, or remove the old account in the Firebase console.',
      }
    }
    if (code === 'auth/weak-password') return { ok: false, status: 422, code: 'weak_password', message: 'Choose a longer password' }
    if (code === 'auth/invalid-email') return { ok: false, status: 422, code: 'validation_error', message: 'Enter a valid email' }
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      return {
        ok: false,
        status: 422,
        code: 'sign_up_disabled',
        message: 'Firebase doesn’t allow creating accounts. Turn on Email/Password and “Enable create (sign-up)” in Authentication settings.',
      }
    }
    if (code === 'auth/network-request-failed') {
      return { ok: false, status: 503, code: 'unavailable', message: 'Could not reach Firebase. Check your connection.' }
    }
    return { ok: false, status: 500, code: 'sign_in_account_failed', message: 'Couldn’t create their sign-in account. Try again.' }
  } finally {
    await deleteApp(app).catch(() => undefined)
  }
}
