/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true": the app uses the API server over PostgreSQL; otherwise prototype mode (src/lib/mode.ts). */
  readonly VITE_API_SERVER?: string
  /** Optional: the API server's origin, when it isn't the one that serves the app. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
