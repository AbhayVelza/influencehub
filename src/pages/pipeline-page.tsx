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
import { useCan } from '@/hooks/use-me'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { InfluencerFilters } from '@/types'

function BoardSkeleton() {
  return (
    <div className="flex gap-space-md overflow-hidden pt-1" aria-busy="true" aria-label="Loading pipeline">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="min-w-48 flex-1 basis-0 space-y-space-sm rounded-2xl bg-surface-container-lowest/65 p-space-sm shadow-glass backdrop-blur-2xl"
        >
          <div className="flex h-10 items-center px-space-xs">
            <Skeleton className="h-5 w-32" />
          </div>
          {Array.from({ length: 3 }, (_, j) => (
            <Skeleton key={j} className="h-32 w-full rounded-2xl" />
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
  const canReassign = useCan('influencer:reassign')

  return (
    <div className="min-w-0 space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader
        title="Pipeline"
        count={pipeline.data ? formatNumber(total) : undefined}
        description="Drag a card to another stage, or focus it and press Space, then use the arrow keys."
      />
      {/* Glass dock: search + Filters; the filter bar's own wrapper is flattened so its panel wraps onto a full row. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-container-lowest/70 p-2 shadow-glass backdrop-blur-2xl">
        <ListSearch
          value={filters.q}
          onChange={(q) => list.setFilters({ q }, { replace: true })}
          className="max-w-md min-w-0 flex-1 basis-56"
        />
        <div className="contents *:contents">
          <InfluencerFilterBar filters={filters} onChange={list.setFilters} hideStage hideAssigned={!canReassign} />
        </div>
      </div>
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
