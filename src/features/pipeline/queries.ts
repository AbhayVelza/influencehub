import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { previousStageOf } from '@/features/influencers/detail-queries'
import { queryKeys } from '@/lib/query'
import { influencersApi, pipelineApi } from '@/services'
import type { InfluencerFilters, Stage } from '@/types'

export const pipelineKey = (filters: InfluencerFilters) => [...queryKeys.pipeline, filters] as const

export function usePipeline(filters: InfluencerFilters) {
  return useQuery({
    queryKey: pipelineKey(filters),
    queryFn: ({ signal }) => pipelineApi.get(filters, signal),
    placeholderData: keepPreviousData,
  })
}

/** Where an on-hold influencer resumes to, from its activity log. */
export async function fetchPreviousStage(id: string): Promise<Stage | null> {
  const page = await influencersApi.activity(id, { page_size: 100 })
  return previousStageOf({ stage: 'on_hold' }, [page.items])
}
