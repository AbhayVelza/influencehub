import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ALL_STAGES, DEFAULT_PAGE_SIZE } from '@/lib/constants'
import { toSearchParams } from '@/services/http'
import type { InfluencerFilters, InfluencerListParams, InfluencerSort, InfluencerSortKey, Stage } from '@/types'

// The list's URL uses the same keys as GET /influencers, so a URL maps 1:1 to an API request.

export const PAGE_SIZE_OPTIONS = [25, 50, 100]

const SORT_KEYS: InfluencerSortKey[] = [
  'name',
  'followers',
  'engagement_rate',
  'city',
  'stage',
  'created_at',
  'updated_at',
  'last_synced_at',
]

const ARRAY_KEYS = ['category', 'country', 'state', 'city', 'assigned_to'] as const

function toNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function parseSort(value: string | null): InfluencerSort | undefined {
  if (!value) return undefined
  return SORT_KEYS.includes(value.replace(/^-/, '') as InfluencerSortKey) ? (value as InfluencerSort) : undefined
}

export function parseFilters(sp: URLSearchParams): InfluencerFilters {
  const filters: InfluencerFilters = {}
  const q = sp.get('q')?.trim()
  if (q) filters.q = q
  for (const key of ARRAY_KEYS) {
    const values = sp.getAll(key).filter(Boolean)
    if (values.length) filters[key] = values
  }
  const stages = sp.getAll('stage').filter((s): s is Stage => ALL_STAGES.includes(s as Stage))
  if (stages.length) filters.stage = stages
  const min = toNumber(sp.get('followers_min'))
  const max = toNumber(sp.get('followers_max'))
  if (min !== undefined) filters.followers_min = min
  if (max !== undefined) filters.followers_max = max
  return filters
}

export function parseListParams(sp: URLSearchParams): InfluencerListParams & { page: number; page_size: number } {
  const pageSize = toNumber(sp.get('page_size'))
  return {
    ...parseFilters(sp),
    sort: parseSort(sp.get('sort')),
    page: Math.max(1, Math.floor(toNumber(sp.get('page')) ?? 1)),
    page_size: pageSize && PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  }
}

/** Serializes list params, omitting defaults so URLs stay short. */
export function toListSearchParams(params: InfluencerListParams): URLSearchParams {
  return toSearchParams({
    ...params,
    page: params.page && params.page > 1 ? params.page : undefined,
    page_size: params.page_size && params.page_size !== DEFAULT_PAGE_SIZE ? params.page_size : undefined,
  })
}

/** Stable string for comparing filter + sort combinations (e.g. to detect the active saved view). */
export function viewKey(filters: InfluencerFilters, sort: InfluencerSort | null | undefined): string {
  const sp = toSearchParams({ ...filters, sort: sort ?? undefined })
  sp.sort()
  for (const key of new Set(sp.keys())) {
    const values = sp.getAll(key).sort()
    sp.delete(key)
    for (const v of values) sp.append(key, v)
  }
  return sp.toString()
}

// The detail page's back link returns to the list exactly as the user left it.
const RETURN_KEY = 'influencehub-list-return'

export function rememberListSearch(search: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, search)
  } catch {
    // Not available; the back link falls back to the unfiltered list.
  }
}

export function listReturnPath(): string {
  try {
    return `/influencers${sessionStorage.getItem(RETURN_KEY) ?? ''}`
  } catch {
    return '/influencers'
  }
}

export function hasActiveFilters(filters: InfluencerFilters): boolean {
  return Object.keys(filters).length > 0
}

/**
 * The live URL params. Router navigations commit asynchronously, so the `searchParams` captured at render can
 * be one update behind when changes come in quick succession (e.g. ticking two filter options fast).
 */
const currentParams = () => parseListParams(new URLSearchParams(window.location.search))

export function useInfluencerListParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => parseListParams(searchParams), [searchParams])
  const { sort, page, page_size, ...filters } = params

  const replaceAll = useCallback(
    (next: InfluencerListParams, options?: { replace?: boolean }) =>
      setSearchParams(toListSearchParams(next), { replace: options?.replace }),
    [setSearchParams],
  )

  /** Merges filter changes and returns to page 1. `undefined` / empty arrays remove a filter. */
  const setFilters = useCallback(
    (patch: Partial<InfluencerFilters>, options?: { replace?: boolean }) =>
      replaceAll({ ...currentParams(), ...patch, page: 1 }, options),
    [replaceAll],
  )

  const setSort = useCallback(
    (next: InfluencerSort | undefined) => replaceAll({ ...currentParams(), sort: next, page: 1 }),
    [replaceAll],
  )

  const setPage = useCallback((next: number) => replaceAll({ ...currentParams(), page: next }), [replaceAll])

  const setPageSize = useCallback(
    (next: number) => replaceAll({ ...currentParams(), page_size: next, page: 1 }),
    [replaceAll],
  )

  const clearFilters = useCallback(() => {
    const { sort: currentSort, page_size: currentSize } = currentParams()
    replaceAll({ sort: currentSort, page_size: currentSize })
  }, [replaceAll])

  return { params, filters, sort, page, pageSize: page_size, setFilters, setSort, setPage, setPageSize, clearFilters, replaceAll }
}
