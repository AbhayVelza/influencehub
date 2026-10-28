import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateInfluencer } from '@/features/influencers/detail-queries'
import { queryKeys } from '@/lib/query'
import { callsApi, influencersApi } from '@/services'
import type { CallLogCreate } from '@/types'

export function useInfluencerCalls(influencerId: string) {
  return useQuery({
    queryKey: queryKeys.influencerCalls(influencerId),
    queryFn: ({ signal }) => influencersApi.calls(influencerId, { page_size: 100 }, signal),
  })
}

export function useLogCall(influencerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CallLogCreate) => influencersApi.logCall(influencerId, body),
    onSuccess: () => {
      void invalidateInfluencer(queryClient, influencerId)
      void queryClient.invalidateQueries({ queryKey: queryKeys.followUpsAll })
    },
  })
}

export function useMarkFollowUpDone(influencerId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (callId: string) => callsApi.markDone(callId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followUpsAll })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      if (influencerId) void queryClient.invalidateQueries({ queryKey: queryKeys.influencerCalls(influencerId) })
    },
  })
}
