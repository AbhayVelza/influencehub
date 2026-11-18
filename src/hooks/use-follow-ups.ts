import { useQuery } from '@tanstack/react-query'
import { useCan, useMe } from '@/hooks/use-me'
import { queryKeys } from '@/lib/query'
import { callsApi } from '@/services'
import type { FollowUpBucket } from '@/types'

export function useFollowUps(bucket: FollowUpBucket, page = 1, pageSize = 25, mine = false) {
  const enabled = useCan('crm:access')
  return useQuery({
    enabled,
    queryKey: queryKeys.followUps(bucket, page, pageSize, mine),
    queryFn: ({ signal }) => callsApi.followUps({ bucket, page, page_size: pageSize, mine: mine || undefined }, signal),
    refetchInterval: 60_000,
  })
}

/** Executives work their own follow-ups by default; managers and admins see the whole team's. */
export function useDefaultMine(): boolean {
  const { data: me } = useMe()
  return me?.role === 'executive'
}
