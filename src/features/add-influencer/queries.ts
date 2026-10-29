import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PLATFORM_META } from '@/lib/platforms'
import { queryKeys } from '@/lib/query'
import type { accountInputSchema } from '@/lib/schemas'
import { duplicatesApi, influencersApi } from '@/services'
import type { AccountCreate, DuplicateCheckRequest, Influencer, InfluencerCreate } from '@/types'
import type { z } from 'zod'
import { isManualAccount } from './account-input'

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

/** A form's account row → the API body. Accounts typed in by hand are `manual`, with their audience if given. */
export function toAccountCreate(a: z.output<typeof accountInputSchema>): AccountCreate {
  if (!isManualAccount(a.platform, a.personal)) return { platform: a.platform, handle: a.handle }
  const key = PLATFORM_META[a.platform].audienceKey
  return { platform: a.platform, handle: a.handle, sync_method: 'manual', metrics: a.audience === null ? {} : { [key]: a.audience } }
}

/** POST /duplicates/check, returning the matches (empty when none or when the check itself fails). */
export async function findDuplicates(body: DuplicateCheckRequest) {
  try {
    return (await duplicatesApi.check(body)).matches
  } catch {
    // The check is advisory: never block adding because it failed.
    return []
  }
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
