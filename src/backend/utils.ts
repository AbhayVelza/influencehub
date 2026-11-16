import { HttpResponse } from 'msw'
import { API_BASE } from '@/lib/env'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'
import type { Paginated } from '@/types'

/**
 * URL pattern for an API path, matching the services' base. On the API server there is no page origin to resolve a
 * path against, so the pattern accepts any origin.
 */
export const api = (path: string) => `${import.meta.env.SSR ? '*' : ''}${API_BASE}${path}`

export function apiError(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status })
}

export const notFound = (what = 'Resource') => apiError(404, 'not_found', `${what} not found`)
export const forbidden = (message = 'You do not have permission to do this') => apiError(403, 'forbidden', message)

export function paginate<T>(items: T[], params: URLSearchParams, defaultSize = DEFAULT_PAGE_SIZE): Paginated<T> {
  const page = Math.max(1, Number(params.get('page')) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(params.get('page_size')) || defaultSize))
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total: items.length, page, page_size: pageSize }
}

/** Wraps a whole collection in the list envelope. */
export const all = <T>(items: T[]): Paginated<T> => ({ items, total: items.length, page: 1, page_size: items.length })

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    return {} as T
  }
}
