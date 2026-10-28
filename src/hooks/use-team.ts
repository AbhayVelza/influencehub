import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { queryKeys } from '@/lib/query'
import { teamApi } from '@/services'
import type { User } from '@/types'

export function useTeam() {
  return useQuery({
    queryKey: queryKeys.team,
    queryFn: ({ signal }) => teamApi.list(signal),
    staleTime: 5 * 60_000,
  })
}

/** Team members by id, for resolving `assigned_to` / `called_by` / `actor`. */
export function useTeamMap(): Map<string, User> {
  const { data } = useTeam()
  return useMemo(() => new Map((data?.items ?? []).map((u) => [u.id, u])), [data])
}
