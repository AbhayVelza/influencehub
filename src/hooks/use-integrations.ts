import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { integrationsApi } from '@/services'
import type { Platform } from '@/types'

/** Platforms the API server can look up and sync right now (none in prototype mode, or while loading). */
export function useProfileLookup(): Platform[] {
  const query = useQuery({
    queryKey: queryKeys.integrations,
    queryFn: ({ signal }) => integrationsApi.get(signal),
    staleTime: 10 * 60_000,
  })
  return query.data?.profile_lookup ?? []
}
