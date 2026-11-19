import { ArrowLeft, BadgeCheck, SearchX } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { PlatformIcon } from '@/components/common/platform-icon'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { ActiveFilters } from '@/features/influencers/active-filters'
import { InfluencerFilterBar } from '@/features/influencers/filter-bar'
import { InfluencersTable } from '@/features/influencers/influencers-table'
import { hasActiveFilters, PAGE_SIZE_OPTIONS, useInfluencerListParams } from '@/features/influencers/list-params'
import { ListSearch } from '@/features/influencers/list-search'
import { useInfluencerList } from '@/features/influencers/queries'
import { buildOnboardedColumns } from '@/features/onboarded/columns'
import { isPlatform, onboardedFilters, withoutLocked } from '@/features/onboarded/onboarded'
import { useCan } from '@/hooks/use-me'
import { useTeamMap } from '@/hooks/use-team'
import { formatNumber } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import type { Platform } from '@/types'
import NotFoundPage from './not-found-page'

// Nothing is selectable here; bulk actions stay on the Influencers list.
const NO_SELECTION = new Set<string>()
const ignoreSelection = () => {}

export default function OnboardedPlatformPage() {
  const { platform } = useParams()
  if (!isPlatform(platform)) return <NotFoundPage />
  // Keyed so paging and column state start fresh on another platform.
  return <OnboardedPlatformList key={platform} platform={platform} />
}

function OnboardedPlatformList({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform]
  const list = useInfluencerListParams()
  const { sort, page, pageSize } = list
  // The URL holds only the user's own filters; the onboarded rule always wins.
  const filters = useMemo(() => withoutLocked(list.filters), [list.filters])
  const locked = useMemo(() => onboardedFilters(platform), [platform])
  const params = useMemo(() => ({ ...filters, ...locked, sort, page, page_size: pageSize }), [filters, locked, sort, page, pageSize])
  const query = useInfluencerList(params)
  const canReassign = useCan('influencer:reassign')
  const navigate = useNavigate()
  const team = useTeamMap()
  const columns = useMemo(() => buildOnboardedColumns(team, platform), [team, platform])

  const rows = useMemo(() => query.data?.items ?? [], [query.data])
  const total = query.data?.total ?? 0

  // When the list shrinks, the current page can fall past the end; step back to the last page.
  const { setPage } = list
  useEffect(() => {
    if (query.data && query.data.items.length === 0 && query.data.total > 0 && page > 1) {
      setPage(Math.ceil(query.data.total / pageSize))
    }
  }, [query.data, page, pageSize, setPage])

  const emptyContent = query.isError ? (
    <ErrorState title="Couldn’t load onboarded creators" error={query.error} onRetry={() => query.refetch()} />
  ) : hasActiveFilters(filters) ? (
    <EmptyState
      icon={SearchX}
      title="No onboarded creators match these filters"
      description="Try removing a filter or searching for something else."
    />
  ) : (
    <EmptyState
      icon={BadgeCheck}
      title={`No onboarded creators on ${meta.label} yet`}
      description={`Creators show here once they’re onboarded (and stay through Package Sent and Delivered) and have a ${meta.label} account.`}
    />
  )

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-space-md px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
        <div className="space-y-space-xs pb-space-sm">
          <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
            <Link to="/onboarded">
              <ArrowLeft />
              All platforms
            </Link>
          </Button>
          <PageHeader
            // The title already names the platform, so the tile is decorative.
            icon={<PlatformIcon platform={platform} className="size-9 rounded-[10px] shadow-md" />}
            title={`Onboarded on ${meta.label}`}
            count={query.data ? formatNumber(total) : undefined}
            description={`Every onboarded creator with a ${meta.label} account, including those in Package Sent and Delivered. The Documents column shows what’s still missing.`}
            className="[&_p]:max-w-3xl"
          />
        </div>

        {/* Search beside the Filters pill; the filter panel (and chips) wrap onto their own lines. */}
        <div className="flex flex-wrap items-center gap-space-sm [&>div:last-child]:contents">
          <ListSearch value={filters.q} onChange={(q) => list.setFilters({ q }, { replace: true })} className="w-full sm:max-w-md sm:flex-1" />
          <InfluencerFilterBar
            filters={filters}
            onChange={list.setFilters}
            baseFilters={locked}
            showFollowers
            hideStage
            hidePlatform
            hideAssigned={!canReassign}
          />
        </div>
        <ActiveFilters filters={filters} onChange={list.setFilters} onClear={list.clearFilters} />

        <InfluencersTable
          rows={rows}
          columns={columns}
          visibilityKey="influencehub-onboarded-columns"
          onOpenRow={(row) => navigate(`/influencers/${row.id}`)}
          isLoading={query.isPending}
          isStale={query.isPlaceholderData}
          sort={sort}
          onSortChange={list.setSort}
          selectedIds={NO_SELECTION}
          onSelectionChange={ignoreSelection}
          emptyContent={emptyContent}
        />
      </div>

      {total > 0 && (
        <div className="sticky bottom-0 flex min-h-14 items-center justify-end bg-surface-container-lowest/80 px-4 py-2.5 shadow-[0_-1px_8px_rgba(0,0,0,0.03)] backdrop-blur-2xl sm:px-6 lg:px-space-xl">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        </div>
      )}
    </div>
  )
}
