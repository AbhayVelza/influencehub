import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/services/http'
import type { FollowUpBucket, InfluencerListParams } from '@/types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Client errors won't fix themselves on retry.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
})

/** Central query keys so invalidation stays consistent across screens. */
export const queryKeys = {
  me: ['me'] as const,
  team: ['team'] as const,
  categories: ['categories'] as const,
  savedViews: ['saved-views'] as const,
  /** Prefix for everything derived from influencers (lists, filter options). */
  influencers: ['influencers'] as const,
  influencerList: (params: InfluencerListParams) => ['influencers', 'list', params] as const,
  filterOptions: (country: string[], state: string[]) => ['influencers', 'filter-options', { country, state }] as const,
  /** Prefix for one influencer and everything hanging off it. */
  influencer: (id: string) => ['influencers', 'detail', id] as const,
  influencerActivity: (id: string) => ['influencers', 'detail', id, 'activity'] as const,
  influencerCalls: (id: string) => ['influencers', 'detail', id, 'calls'] as const,
  influencerSnapshots: (id: string) => ['influencers', 'detail', id, 'snapshots'] as const,
  influencerMedia: (id: string) => ['influencers', 'detail', id, 'media'] as const,
  /** Prefix for all package lists. */
  packages: ['packages'] as const,
  packageList: (params: object) => ['packages', 'list', params] as const,
  /** Prefix for follow-up buckets. */
  followUpsAll: ['follow-ups'] as const,
  pipeline: ['pipeline'] as const,
  dashboard: ['dashboard'] as const,
  followUps: (bucket: FollowUpBucket, page = 1, pageSize = 25, mine = false) =>
    ['follow-ups', bucket, page, pageSize, mine] as const,
  job: (id: string) => ['jobs', id] as const,
}
