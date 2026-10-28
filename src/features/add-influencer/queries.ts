import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { influencersApi } from '@/services'
import type { InfluencerCreate } from '@/types'

export function useCreateInfluencer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: InfluencerCreate) => influencersApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.influencers })
      void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

/** Defaults shared by both add forms: owner = me, location India-first. */
export function detailDefaults(meId: string | undefined) {
  return { name: '', category: '', phone: '', email: '', city: '', state: '', country: 'India', assigned_to: meId ?? '' }
}
