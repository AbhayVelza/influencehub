import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCan } from '@/hooks/use-me'
import { queryKeys } from '@/lib/query'
import { duplicatesApi, influencersApi } from '@/services'
import type { MergeRequest } from '@/types'

/** Open pairs (manager/admin only; disabled for executives). */
export function useDuplicatePairs() {
  const canMerge = useCan('influencer:merge')
  return useQuery({
    queryKey: queryKeys.duplicates,
    queryFn: ({ signal }) => duplicatesApi.list({ page_size: 200 }, signal),
    enabled: canMerge,
    refetchInterval: 60_000,
  })
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.duplicates })
    void queryClient.invalidateQueries({ queryKey: queryKeys.influencers })
    void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline })
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    void queryClient.invalidateQueries({ queryKey: queryKeys.followUpsAll })
    void queryClient.invalidateQueries({ queryKey: queryKeys.packages })
  }
}

export function useDismissDuplicate() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (id: string) => duplicatesApi.dismiss(id), onSettled: refresh })
}

export function useMergeInfluencers() {
  const queryClient = useQueryClient()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (body: MergeRequest) => influencersApi.merge(body),
    onSuccess: (_kept, body) => queryClient.removeQueries({ queryKey: queryKeys.influencer(body.merge_id) }),
    onSettled: refresh,
  })
}
