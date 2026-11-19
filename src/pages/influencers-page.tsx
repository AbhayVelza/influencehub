import { Download, Plus, SearchX, Upload, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { useAddInfluencer } from '@/features/add-influencer/context'
import { ActiveFilters } from '@/features/influencers/active-filters'
import { BulkActionsBar } from '@/features/influencers/bulk-actions-bar'
import { buildColumns } from '@/features/influencers/columns'
import { InfluencerFilterBar } from '@/features/influencers/filter-bar'
import { InfluencersTable } from '@/features/influencers/influencers-table'
import {
  hasActiveFilters,
  PAGE_SIZE_OPTIONS,
  rememberListSearch,
  useInfluencerListParams,
  viewKey,
} from '@/features/influencers/list-params'
import { ListSearch } from '@/features/influencers/list-search'
import { useInfluencerList } from '@/features/influencers/queries'
import { SavedViewsMenu } from '@/features/influencers/saved-views-menu'
import { useExportInfluencers } from '@/features/influencers/use-export'
import { useCan } from '@/hooks/use-me'
import { useTeamMap } from '@/hooks/use-team'
import { formatNumber } from '@/lib/format'
import type { Influencer } from '@/types'

export default function InfluencersPage() {
  const list = useInfluencerListParams()
  const { params, filters, sort, page, pageSize } = list
  const query = useInfluencerList(params)
  const { exportInfluencers, isExporting } = useExportInfluencers()
  const canImport = useCan('data:import')
  const canExport = useCan('data:export')
  const canCreate = useCan('influencer:create')
  // Executives' list holds only their own influencers, so filtering by owner means nothing to them.
  const canReassign = useCan('influencer:reassign')
  const addInfluencer = useAddInfluencer()
  const navigate = useNavigate()
  const team = useTeamMap()
  const columns = useMemo(() => buildColumns(team), [team])

  const rows = useMemo(() => query.data?.items ?? [], [query.data])
  const total = query.data?.total ?? 0
  const filtered = hasActiveFilters(filters)

  // Selection survives paging but resets when the filters or sort change.
  const [selected, setSelected] = useState<Map<string, Influencer>>(() => new Map())
  const selectionScope = viewKey(filters, sort)
  const [scope, setScope] = useState(selectionScope)
  if (scope !== selectionScope) {
    setScope(selectionScope)
    setSelected(new Map())
  }
  // Prefer fresh row data (e.g. a new stage) over the snapshot taken when the row was selected.
  const selectedRows = useMemo(() => {
    const fresh = new Map(rows.map((r) => [r.id, r]))
    return [...selected.values()].map((r) => fresh.get(r.id) ?? r)
  }, [selected, rows])

  const { search } = useLocation()
  useEffect(() => rememberListSearch(search), [search])

  // After deletions the current page can fall past the end; step back to the last page.
  const { setPage } = list
  useEffect(() => {
    if (query.data && query.data.items.length === 0 && query.data.total > 0 && page > 1) {
      setPage(Math.ceil(query.data.total / pageSize))
    }
  }, [query.data, page, pageSize, setPage])

  const emptyContent = query.isError ? (
    <ErrorState title="Couldn’t load influencers" error={query.error} onRetry={() => query.refetch()} />
  ) : filtered ? (
    <EmptyState
      icon={SearchX}
      title="No influencers match these filters"
      description="Try removing a filter or searching for something else."
      action={
        <Button variant="outline" size="sm" onClick={list.clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : canReassign ? (
    <EmptyState
      icon={Users}
      title="No influencers yet"
      description="Add influencers from Instagram, enter them manually, or import a CSV."
      action={canCreate && <Button onClick={() => addInfluencer.open()}>Add influencer</Button>}
    />
  ) : (
    <EmptyState
      icon={Users}
      title="You don’t own any influencers yet"
      description="Claim some from the Unassigned Pool, or add a new one."
      action={
        <Button asChild>
          <Link to="/pool">Open the pool</Link>
        </Button>
      }
    />
  )

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
        <PageHeader
          title="Influencers"
          count={query.data ? formatNumber(total) : undefined}
          actions={
            <>
              {canImport && (
                <Button variant="outline" className="gap-1" onClick={() => addInfluencer.open({ tab: 'csv' })}>
                  <Upload className="size-[17px] text-muted-foreground transition-colors group-hover/button:text-primary" />
                  Import CSV
                </Button>
              )}
              {canExport && (
                <Button
                  variant="outline"
                  className="gap-1 disabled:bg-surface-container-lowest/40 disabled:shadow-none"
                  disabled={isExporting || total === 0}
                  onClick={() => exportInfluencers({ filters })}
                >
                  <Download className="size-[17px] text-muted-foreground transition-colors group-hover/button:text-primary" />
                  Export
                </Button>
              )}
              {canCreate && (
                <Button className="gap-1" onClick={() => addInfluencer.open()}>
                  <Plus className="size-[18px]" />
                  Add Influencer
                </Button>
              )}
            </>
          }
        />

        <div className="space-y-space-md">
          <div className="flex flex-wrap items-center gap-space-sm">
            <ListSearch
              value={filters.q}
              onChange={(q) => list.setFilters({ q }, { replace: true })}
              className="w-full sm:w-auto sm:max-w-md sm:min-w-64 sm:flex-1"
            />
            <InfluencerFilterBar
              filters={filters}
              onChange={list.setFilters}
              hideAssigned={!canReassign}
              className="contents"
              actions={
                <div className="ml-auto">
                  <SavedViewsMenu
                    filters={filters}
                    sort={sort}
                    onApply={(view) =>
                      list.replaceAll({ ...view.filters, sort: view.sort ?? undefined, page_size: pageSize })
                    }
                  />
                </div>
              }
            />
          </div>
          <ActiveFilters filters={filters} onChange={list.setFilters} onClear={list.clearFilters} />

          <InfluencersTable
            rows={rows}
            columns={columns}
            visibilityKey="influencehub-influencer-columns-v2"
            onOpenRow={(row) => navigate(`/influencers/${row.id}`)}
            isLoading={query.isPending}
            isStale={query.isPlaceholderData}
            sort={sort}
            onSortChange={list.setSort}
            selectedIds={new Set(selected.keys())}
            onSelectionChange={({ selected: added, deselected }) =>
              setSelected((prev) => {
                const next = new Map(prev)
                for (const r of added) next.set(r.id, r)
                for (const r of deselected) next.delete(r.id)
                return next
              })
            }
            emptyContent={emptyContent}
          />
        </div>
      </div>

      {(selectedRows.length > 0 || total > 0) && (
        <div className="sticky bottom-0 z-10 flex min-h-14 flex-wrap items-center justify-between gap-3 bg-surface-container-lowest/80 px-4 py-2.5 shadow-[0_-1px_8px_rgba(0,0,0,0.03)] backdrop-blur-2xl sm:px-6 lg:px-space-xl">
          <div>
            {selectedRows.length > 0 && (
              <BulkActionsBar
                rows={selectedRows}
                onClear={() => setSelected(new Map())}
                onSettled={(keepIds) =>
                  setSelected((prev) => new Map([...prev].filter(([id]) => keepIds.includes(id))))
                }
              />
            )}
          </div>
          {total > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
            />
          )}
        </div>
      )}
    </div>
  )
}
