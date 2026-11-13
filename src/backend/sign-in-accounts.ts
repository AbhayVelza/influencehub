export type SignInAccountResult = { ok: true; uid: string } | { ok: false; status: number; code: string; message: string }

type Creator = (email: string, password: string) => Promise<SignInAccountResult>

// Sign-in accounts are Firebase Auth users, and only the API server may create them (Firebase Admin SDK,
// server/firebase-admin.ts registers how at start-up). Prototype mode has no sign-in and never calls this.
let creator: Creator | null = null

export function setSignInAccountCreator(next: Creator) {
  creator = next
}

/** Creates a team member's sign-in account with the password the admin chose. */
export function createSignInAccount(email: string, password: string): Promise<SignInAccountResult> {
  if (creator) return creator(email, password)
  return Promise.resolve({ ok: false, status: 500, code: 'sign_in_account_failed', message: 'Couldn’t create their sign-in account. Try again.' })
}
