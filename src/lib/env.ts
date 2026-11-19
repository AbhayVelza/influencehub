/** Path prefix of the API: answered by the API server (server/), or in the browser by src/backend in prototype mode. */
export const API_BASE = '/api/v1'

/** Where the API server is, when it isn't the origin that serves the app (VITE_API_URL, e.g. https://api.example.com). */
export const API_ORIGIN = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') ?? ''
