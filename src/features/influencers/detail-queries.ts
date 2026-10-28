import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { influencersApi } from '@/services'
import type { Activity, Influencer, InfluencerUpdate, Stage, StageChangeRequest } from '@/types'

const ACTIVITY_PAGE_SIZE = 50

/** Everything that can change when an influencer changes. */
export function invalidateInfluencer(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.influencer(id) }),
    queryClient.invalidateQueries({ queryKey: ['influencers', 'list'] }),
    queryClient.invalidateQueries({ queryKey: ['influencers', 'filter-options'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.pipeline }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
  ])
}

export function useInfluencer(id: string) {
  return useQuery({
    queryKey: queryKeys.influencer(id),
    queryFn: ({ signal }) => influencersApi.get(id, signal),
  })
}

export function useInfluencerActivity(id: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.influencerActivity(id),
    queryFn: ({ pageParam, signal }) => influencersApi.activity(id, { page: pageParam, page_size: ACTIVITY_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  })
}

export function useSnapshots(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.influencerSnapshots(id),
    queryFn: ({ signal }) => influencersApi.snapshots(id, signal),
    enabled,
  })
}

export function useMedia(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.influencerMedia(id),
    queryFn: ({ signal }) => influencersApi.media(id, signal),
    enabled,
  })
}

export function useUpdateInfluencer(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: InfluencerUpdate) => influencersApi.update(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.influencer(id), updated)
      void invalidateInfluencer(queryClient, id)
    },
  })
}

export function useChangeStage(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StageChangeRequest) => influencersApi.changeStage(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.influencer(id), updated)
      void invalidateInfluencer(queryClient, id)
    },
  })
}

export function useDeleteInfluencer(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => influencersApi.remove(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.influencer(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.influencers })
      void queryClient.invalidateQueries({ queryKey: queryKeys.followUpsAll })
    },
  })
}

// ---------------------------------------------------------------------------
// Stage history (derived from the activity log)

const PIPELINE: Stage[] = ['data_gathered', 'contacted', 'onboarded', 'package_sent', 'delivered']

function stageEvents(pages: Activity[][]): { from: Stage; to: Stage }[] {
  // Activity is newest first.
  return pages
    .flat()
    .filter((a) => a.type === 'stage_changed')
    .map((a) => ({ from: a.payload.from as Stage, to: a.payload.to as Stage }))
}

/** The stage an on-hold influencer returns to: where it was before it was put on hold. */
export function previousStageOf(influencer: Influencer, pages: Activity[][]): Stage | null {
  if (influencer.stage !== 'on_hold') return null
  const entry = stageEvents(pages).find((e) => e.to === 'on_hold')
  return entry && entry.from !== 'on_hold' ? entry.from : null
}

/** Furthest main-pipeline stage reached, for the stepper (side stages show where the influencer left off). */
export function pipelinePosition(influencer: Influencer, pages: Activity[][]): Stage | null {
  if (PIPELINE.includes(influencer.stage)) return influencer.stage
  // Walk back through side stages, e.g. contacted → on_hold → rejected gives "contacted".
  let target: Stage = influencer.stage
  for (const event of stageEvents(pages)) {
    if (event.to !== target) continue
    if (PIPELINE.includes(event.from)) return event.from
    target = event.from
  }
  return null
}
