import { useQueries } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { PLATFORMS } from '@/lib/platforms'
import { influencersApi } from '@/services'
import { onboardedFilters } from './onboarded'

/** How many onboarded creators each platform's tab holds (one page_size=1 list request per platform). */
export function useOnboardedCounts() {
  return useQueries({
    queries: PLATFORMS.map((platform) => {
      const params = { ...onboardedFilters(platform), page_size: 1 }
      return {
        queryKey: queryKeys.influencerList(params),
        queryFn: ({ signal }: { signal: AbortSignal }) => influencersApi.list(params, signal),
        select: (page: { total: number }) => page.total,
      }
    }),
  })
}
