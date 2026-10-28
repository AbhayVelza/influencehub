import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { callsApi } from '@/services'
import type { FollowUpBucket } from '@/types'

export function useFollowUps(bucket: FollowUpBucket, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: queryKeys.followUps(bucket, page, pageSize),
    queryFn: ({ signal }) => callsApi.followUps({ bucket, page, page_size: pageSize }, signal),
    refetchInterval: 60_000,
  })
}
