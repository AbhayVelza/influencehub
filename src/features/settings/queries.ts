import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { categoriesApi, settingsApi, teamApi } from '@/services'
import type { CategoryUpdate, InstagramSettingsUpdate, PoolSettings, TeamMemberCreate, TeamMemberUpdate } from '@/types'

const instagramKey = ['settings', 'instagram'] as const
const poolKey = ['settings', 'pool'] as const

export function useInstagramSettings() {
  return useQuery({ queryKey: instagramKey, queryFn: ({ signal }) => settingsApi.instagram(signal) })
}

export function useUpdateInstagramSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: InstagramSettingsUpdate) => settingsApi.updateInstagram(body),
    onSuccess: (data) => queryClient.setQueryData(instagramKey, data),
  })
}

export function usePoolSettings() {
  return useQuery({ queryKey: poolKey, queryFn: ({ signal }) => settingsApi.pool(signal) })
}

export function useUpdatePoolSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<PoolSettings>) => settingsApi.updatePool(body),
    onSuccess: (data) => {
      queryClient.setQueryData(poolKey, data)
      // Auto-release can return claims to the pool straight away.
      void queryClient.invalidateQueries({ queryKey: queryKeys.influencers })
    },
  })
}

export function useInviteMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: TeamMemberCreate) => teamApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.team }),
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TeamMemberUpdate }) => teamApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.team }),
  })
}

function useCategoryMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories })
      // Renames change influencers' category and the filter options.
      void queryClient.invalidateQueries({ queryKey: queryKeys.influencers })
    },
  })
}

export const useCreateCategory = () => useCategoryMutation((name: string) => categoriesApi.create({ name }))
export const useUpdateCategory = () =>
  useCategoryMutation(({ id, body }: { id: string; body: CategoryUpdate }) => categoriesApi.update(id, body))
export const useDeleteCategory = () => useCategoryMutation((id: string) => categoriesApi.remove(id))
