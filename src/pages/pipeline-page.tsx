import { SearchX } from 'lucide-react'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ActiveFilters } from '@/features/influencers/active-filters'
import { InfluencerFilterBar } from '@/features/influencers/filter-bar'
import { hasActiveFilters, useInfluencerListParams } from '@/features/influencers/list-params'
import { ListSearch } from '@/features/influencers/list-search'
import { PipelineBoard } from '@/features/pipeline/pipeline-board'
import { usePipeline } from '@/features/pipeline/queries'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { InfluencerFilters } from '@/types'

function BoardSkeleton() {
  return (
    <div className="flex gap-3" aria-busy="true" aria-label="Loading pipeline">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="min-w-48 flex-1 basis-0 space-y-2 rounded-xl border bg-muted/40 p-2">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 3 }, (_, j) => (
            <Skeleton key={j} className="h-24 w-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function PipelinePage() {
  const list = useInfluencerListParams()
  // Same URL filters as the list; every stage is a column, so a stage filter doesn't apply here.
  const { stage: _ignored, ...filters } = list.filters
  const pipeline = usePipeline(filters as InfluencerFilters)
  const total = pipeline.data?.columns.reduce((sum, c) => sum + c.count, 0) ?? 0

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={
          <>
            Pipeline{' '}
            {pipeline.data && <span className="font-normal text-muted-foreground tabular-nums">({formatNumber(total)})</span>}
          </>
        }
        description="Drag a card to another stage, or focus it and press Space, then use the arrow keys."
      />
      <ListSearch value={filters.q} onChange={(q) => list.setFilters({ q }, { replace: true })} />
      <InfluencerFilterBar filters={filters} onChange={list.setFilters} hideStage />
      <ActiveFilters filters={filters} onChange={list.setFilters} onClear={list.clearFilters} />

      {pipeline.isPending ? (
        <BoardSkeleton />
      ) : pipeline.isError ? (
        <ErrorState title="Couldn’t load the pipeline" error={pipeline.error} onRetry={() => pipeline.refetch()} />
      ) : total === 0 && hasActiveFilters(filters) ? (
        <EmptyState
          icon={SearchX}
          title="No influencers match these filters"
          action={
            <Button variant="outline" size="sm" onClick={list.clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className={cn(pipeline.isPlaceholderData && 'opacity-60 transition-opacity')}>
          <PipelineBoard data={pipeline.data} filters={filters} />
        </div>
      )}
    </div>
  )
}
