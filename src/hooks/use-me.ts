import { useQuery } from '@tanstack/react-query'
import { can, type Permission } from '@/lib/permissions'
import { queryKeys } from '@/lib/query'
import { meApi } from '@/services'

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => meApi.get(signal),
    staleTime: Infinity,
  })
}

/** Permission check for the signed-in user. False while /me is loading. */
export function useCan(permission: Permission): boolean {
  const { data: me } = useMe()
  return can(me?.role, permission)
}
