import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { influencersApi, savedViewsApi } from '@/services'
import type { BulkRequest, InfluencerListParams, SavedViewCreate } from '@/types'

export function useInfluencerList(params: InfluencerListParams) {
  return useQuery({
    queryKey: queryKeys.influencerList(params),
    queryFn: ({ signal }) => influencersApi.list(params, signal),
    placeholderData: keepPreviousData,
  })
}

/** Cascading options: states narrow by country, cities by country + state. */
export function useFilterOptions(country: string[] = [], state: string[] = []) {
  return useQuery({
    queryKey: queryKeys.filterOptions(country, state),
    queryFn: ({ signal }) => influencersApi.filterOptions({ country, state }, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
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
