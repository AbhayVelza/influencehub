import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { influencersApi, poolApi, savedViewsApi } from '@/services'
import type { BulkRequest, InfluencerFilters, InfluencerListParams, SavedViewCreate } from '@/types'

export function useInfluencerList(params: InfluencerListParams) {
  return useQuery({
    queryKey: queryKeys.influencerList(params),
    queryFn: ({ signal }) => influencersApi.list(params, signal),
    placeholderData: keepPreviousData,
  })
}

export type FilterSource = 'influencers' | 'pool'

/**
 * Options with faceted counts for the active filters: each count reflects every other filter, so they follow
 * every change. Cascading too: states narrow by country, cities by country + state.
 */
export function useFilterOptions(filters: InfluencerFilters, source: FilterSource = 'influencers') {
  return useQuery({
    queryKey: source === 'pool' ? queryKeys.poolFilterOptions(filters) : queryKeys.filterOptions(filters),
    queryFn: ({ signal }) => (source === 'pool' ? poolApi.filterOptions(filters, signal) : influencersApi.filterOptions(filters, signal)),
    // Keep showing the previous counts (marked as updating) instead of a skeleton while the new ones load.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

export function useSavedViews() {
  return useQuery({
    queryKey: queryKeys.savedViews,
    queryFn: ({ signal }) => savedViewsApi.list(signal),
  })
}

export function useCreateSavedView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SavedViewCreate) => savedViewsApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedViews }),
  })
}

export function useDeleteSavedView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => savedViewsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedViews }),
  })
}

export function useBulkAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkRequest) => influencersApi.bulk(body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.influencers }),
  })
}
