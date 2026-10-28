import { useQuery } from '@tanstack/react-query'
import { JOB_POLL_INTERVAL_MS } from '@/lib/constants'
import { queryKeys } from '@/lib/query'
import { jobsApi } from '@/services'
import type { Job } from '@/types'

const isFinished = (job: Job | undefined) => job?.status === 'succeeded' || job?.status === 'failed'

/** Polls GET /jobs/{id} every 2 s until the job succeeds or fails. Pass null to stay idle. */
export function useJob<TResult = unknown>(jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.job(jobId ?? ''),
    queryFn: ({ signal }) => jobsApi.get<TResult>(jobId!, signal),
    enabled: jobId != null,
    refetchInterval: (query) => (isFinished(query.state.data) ? false : JOB_POLL_INTERVAL_MS),
    staleTime: Infinity,
  })
}
