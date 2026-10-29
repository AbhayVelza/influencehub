import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { invalidateInfluencer } from '@/features/influencers/detail-queries'
import { queryKeys } from '@/lib/query'
import { ApiError, getErrorMessage, influencersApi, poolApi } from '@/services'
import type { Influencer, InfluencerListParams, PoolItem } from '@/types'

/** Managers and admins get full influencers from the pool API; executives get previews. */
export const isFullInfluencer = (item: PoolItem): item is Influencer => 'assigned_to' in item

export function usePoolList(params: InfluencerListParams) {
  return useQuery({
    queryKey: queryKeys.poolList(params),
    queryFn: ({ signal }) => poolApi.list(params, signal),
    placeholderData: keepPreviousData,
  })
}

/** Sidebar badge and dashboard: how many influencers have no owner. */
export function usePoolCount() {
  const query = useQuery({
    queryKey: queryKeys.poolList({ page: 1, page_size: 1 }),
    queryFn: ({ signal }) => poolApi.list({ page: 1, page_size: 1 }, signal),
    refetchInterval: 60_000,
  })
  return query.data?.total
}

export function usePoolItem(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.poolItem(id),
    queryFn: ({ signal }) => poolApi.get(id, signal),
    enabled,
  })
}

/** My claims that auto-release returns to the pool by tomorrow. */
export function useExpiringClaims() {
  return useQuery({
    queryKey: queryKeys.poolExpiring,
    queryFn: ({ signal }) => poolApi.expiring(signal),
    refetchInterval: 60_000,
  })
}

function useRefreshAfterOwnerChange() {
  const queryClient = useQueryClient()
  return (id: string) => {
    void invalidateInfluencer(queryClient, id)
    // Calls and packages are only visible to an executive while they own the influencer.
    void queryClient.invalidateQueries({ queryKey: queryKeys.followUpsAll })
    void queryClient.invalidateQueries({ queryKey: queryKeys.packages })
  }
}

/** Toast for a failed claim. A teammate's earlier claim refreshes the pool (the mutation invalidates it). */
export function claimErrorToast(err: unknown) {
  if (err instanceof ApiError && err.code === 'already_claimed') {
    toast.error('Already claimed by a teammate', { description: 'The pool has been refreshed.' })
  } else if (err instanceof ApiError && err.code === 'claim_limit_reached') {
    toast.error('Claim limit reached', { description: err.message })
  } else {
    toast.error('Couldn’t claim', { description: getErrorMessage(err) })
  }
}

export function useClaimInfluencer() {
  const queryClient = useQueryClient()
  const refresh = useRefreshAfterOwnerChange()
  return useMutation({
    mutationFn: (id: string) => influencersApi.claim(id),
    onSuccess: (influencer) => queryClient.setQueryData(queryKeys.influencer(influencer.id), influencer),
    onSettled: (_data, _error, id) => refresh(id),
  })
}

export function useReleaseInfluencer(id: string) {
  const refresh = useRefreshAfterOwnerChange()
  return useMutation({
    mutationFn: (reason: string) => influencersApi.release(id, { reason }),
    onSuccess: () => refresh(id),
  })
}
