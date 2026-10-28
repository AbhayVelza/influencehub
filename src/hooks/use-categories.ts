import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { categoriesApi } from '@/services'

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => categoriesApi.list(signal),
    staleTime: 5 * 60_000,
  })
}
