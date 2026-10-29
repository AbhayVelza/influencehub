import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { influencersApi } from '@/services'
import type { Influencer, InfluencerCreate } from '@/types'

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

/** After adding: the new profile, or the pool when an executive left it unassigned (they can only see it there). */
export function afterCreate(created: Influencer, canReassign: boolean): { path: string; message: string } {
  return created.assigned_to === null && !canReassign
    ? { path: '/pool', message: `${created.name} added to the Unassigned Pool` }
    : { path: `/influencers/${created.id}`, message: `${created.name} added` }
}

/** Defaults shared by both add forms: owner = me, location India-first. */
export function detailDefaults(meId: string | undefined) {
  return { name: '', category: '', phone: '', email: '', city: '', state: '', country: 'India', assigned_to: meId ?? '' }
}
