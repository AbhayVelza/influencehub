/** Path prefix of the API: answered by the API server (server/), or in the browser by src/backend in prototype mode. */
export const API_BASE = '/api/v1'

/** The team member a request acts as (there is no sign-in yet; src/lib/auth). */
export const ACTING_AS_HEADER = 'X-Acting-As'

/** Where the API server is, when it isn't the origin that serves the app (VITE_API_URL, e.g. https://api.example.com). */
export const API_ORIGIN = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') ?? ''
