import { currentAuthUid } from '@/lib/auth'
import { ACTING_AS_HEADER, API_BASE, API_ORIGIN } from '@/lib/env'
import { PROTOTYPE } from '@/lib/mode'
import { subscribeSession } from '@/lib/session'
import type { ApiErrorBody } from '@/types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | QueryValue[]>

/** Arrays become repeated keys: `stage=a&stage=b`. Empty values are dropped. */
export function toSearchParams(query: QueryParams = {}): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, raw] of Object.entries(query)) {
    const values = Array.isArray(raw) ? raw : [raw]
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue
      params.append(key, String(value))
    }
  }
  return params
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: QueryParams
  body?: unknown
  signal?: AbortSignal
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.message === 'string'
  )
}

/**
 * Every API call goes through here: to the API server (server/main.ts), saying which member it acts as, or in
 * prototype mode to the data layer in this browser (src/backend), loaded on first use.
 */
export async function request<T>(path: string, { method = 'GET', query, body, signal }: RequestOptions = {}): Promise<T> {
  const qs = toSearchParams(query).toString()
  const url = new URL(`${API_BASE}${path}${qs ? `?${qs}` : ''}`, API_ORIGIN || window.location.origin)

  const headers: Record<string, string> = body !== undefined ? { 'Content-Type': 'application/json' } : {}
  headers[ACTING_AS_HEADER] = currentAuthUid()
  const init = { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }

  let response: Response
  try {
    if (PROTOTYPE) {
      const { handleApiRequest } = await import('@/backend')
      signal?.throwIfAborted()
      response = await handleApiRequest(new Request(url, init))
    } else {
      signal?.throwIfAborted()
      response = await fetch(url, { ...init, signal })
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    console.error('Request failed', err)
    throw new ApiError(0, 'network_error', 'Something went wrong. Check your connection and try again.')
  }
  signal?.throwIfAborted()

  if (response.status === 204) return undefined as T

  const invalid = Symbol('invalid')
  const data: unknown = await response.json().catch(() => invalid)

  if (!response.ok) {
    if (isApiErrorBody(data)) throw new ApiError(response.status, data.error.code, data.error.message)
    throw new ApiError(response.status, 'http_error', `Request failed (${response.status})`)
  }

  // Every endpoint answers JSON or 204; anything else must fail the query instead of resolving with null.
  if (data === invalid) throw new ApiError(response.status, 'invalid_response', 'The server sent an unexpected response.')

  return data as T
}

export const http = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export function uploadBinary(
  url: string,
  file: Blob | File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const targetUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `${API_ORIGIN}${url}`
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false

    const unsubscribe = subscribeSession(() => {
      if (settled) return
      unsubscribe()
      settled = true
      xhr.abort()
      reject(new ApiError(0, 'session_changed', 'Stopped because you signed out.'))
    })

    xhr.open('PUT', targetUrl)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.setRequestHeader(ACTING_AS_HEADER, currentAuthUid())

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (settled) return
      settled = true
      unsubscribe()
      if (xhr.status < 300) {
        resolve()
      } else {
        reject(new ApiError(xhr.status, 'upload_failed', 'Upload failed. Choose the file again.'))
      }
    }

    xhr.onerror = () => {
      if (settled) return
      settled = true
      unsubscribe()
      reject(new ApiError(0, 'network_error', 'Upload failed. Check your connection and try again.'))
    }

    xhr.onabort = () => {
      if (settled) return
      settled = true
      unsubscribe()
      reject(new ApiError(0, 'upload_aborted', 'Upload was aborted.'))
    }

    xhr.send(file)
  })
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}
