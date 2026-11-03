import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth'
import { AuthError } from '@/lib/auth/types'

// One Firebase app for the whole client: Authentication (sign-in), Firestore (all data) and Storage (document
// files). The web config is public by design; access is controlled by firestore.rules and storage.rules.

const NOT_CONFIGURED =
  'Firebase isn’t configured: set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN and VITE_FIREBASE_PROJECT_ID (and VITE_FIREBASE_STORAGE_BUCKET for document files) for this build.'

/** The web app config from the build env. Each variable is read on its own so the build inlines only these. */
export function firebaseConfig(): FirebaseOptions {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim()
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim()
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim()
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim() || undefined
  if (!apiKey || !authDomain || !projectId) throw new AuthError('not_configured', NOT_CONFIGURED)
  return { apiKey, authDomain, projectId, storageBucket, appId }
}

let app: FirebaseApp | null = null
let auth: Auth | null = null

export function firebaseApp(): FirebaseApp {
  app ??= initializeApp(firebaseConfig())
  return app
}

/** The signed-in user's Auth instance. No popup/redirect resolver: email + password only keeps the bundle small. */
export function firebaseAuth(): Auth {
  auth ??= initializeAuth(firebaseApp(), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  return auth
}
