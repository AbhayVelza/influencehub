/** Base for every API request, e.g. "https://api.example.com/api/v1" or "/api/v1". */
export const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api/v1`

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'
