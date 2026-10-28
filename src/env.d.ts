/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin without the /api/v1 suffix. Empty = same origin. */
  readonly VITE_API_URL?: string
  /** "true" starts the MSW mock API in the browser. */
  readonly VITE_USE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
