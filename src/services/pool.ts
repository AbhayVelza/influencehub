import { http } from '@/services/http'
import type { ExpiringClaim, FilterOptions, InfluencerListParams, Paginated, PoolItem } from '@/types'

/** The Unassigned Pool. Executives get previews (no contact details); managers and admins get full influencers. */
export const poolApi = {
  list: (params: InfluencerListParams = {}, signal?: AbortSignal) => http.get<Paginated<PoolItem>>('/pool', { ...params }, signal),

  filterOptions: (params: { country?: string[]; state?: string[] } = {}, signal?: AbortSignal) =>
    http.get<FilterOptions>('/pool/filter-options', params, signal),

  /** 404 unless the influencer is unassigned. */
  get: (id: string, signal?: AbortSignal) => http.get<PoolItem>(`/pool/${id}`, undefined, signal),

  /** My claims that auto-release returns to the pool by tomorrow (IST). */
  expiring: (signal?: AbortSignal) => http.get<Paginated<ExpiringClaim>>('/pool/expiring', undefined, signal),
}
