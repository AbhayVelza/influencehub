/// <reference types="vite/client" />

/**
 * Firebase web app config (Firebase console > Project settings > Your apps > Web app). Public values: access is
 * controlled by firestore.rules and storage.rules. Without the API key, auth domain and project ID the app shows a
 * setup screen instead of sign-in.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  /** e.g. "my-project.firebaseapp.com". */
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  /** e.g. "my-project.firebasestorage.app"; needed for document uploads. */
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  /** Optional. */
  readonly VITE_FIREBASE_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
