import { Inbox, SearchX, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { ActiveFilters } from '@/features/influencers/active-filters'
import { InfluencerFilterBar } from '@/features/influencers/filter-bar'
import { InfluencersTable } from '@/features/influencers/influencers-table'
import { hasActiveFilters, PAGE_SIZE_OPTIONS, useInfluencerListParams, viewKey } from '@/features/influencers/list-params'
import { ListSearch } from '@/features/influencers/list-search'
import { BulkAssignDialog } from '@/features/pool/bulk-assign-dialog'
import { buildPoolColumns } from '@/features/pool/columns'
import { PoolPreviewDrawer } from '@/features/pool/pool-preview'
import { usePoolList } from '@/features/pool/queries'
import { usePoolActions } from '@/features/pool/use-pool-actions'
import { useCan, useMe } from '@/hooks/use-me'
import { useTeam } from '@/hooks/use-team'
import { formatNumber } from '@/lib/format'
import type { PoolItem } from '@/types'

export default function PoolPage() {
  const list = useInfluencerListParams()
  const { params, filters, sort, page, pageSize } = list
  const query = usePoolList(params)
  const canReassign = useCan('influencer:reassign')
  const actions = usePoolActions()
  const { data: me } = useMe()
  const team = useTeam()

  const rows = useMemo(() => query.data?.items ?? [], [query.data])
  const total = query.data?.total ?? 0

  // Selection resets when the filters or sort change, and drops rows that left the pool.
  const [selected, setSelected] = useState<Map<string, PoolItem>>(() => new Map())
  const selectionScope = viewKey(filters, sort)
  const [scope, setScope] = useState(selectionScope)
  if (scope !== selectionScope) {
    setScope(selectionScope)
    setSelected(new Map())
  }
  const selectedRows = [...selected.values()]
  const keepOnly = (ids: string[]) => setSelected((prev) => new Map([...prev].filter(([id]) => ids.includes(id))))

  // The preview drawer keeps its row while closing, so the content doesn't vanish mid-animation.
  const [preview, setPreview] = useState<{ item: PoolItem; open: boolean } | null>(null)
  // The rows are fixed when the dialog opens, so its count doesn't change while it closes.
  const [bulkAssign, setBulkAssign] = useState<{ rows: PoolItem[]; open: boolean; pending: boolean }>({
    rows: [],
    open: false,
    pending: false,
  })

  const { setPage } = list
  useEffect(() => {
    if (query.data && query.data.items.length === 0 && query.data.total > 0 && page > 1) {
      setPage(Math.ceil(query.data.total / pageSize))
    }
  }, [query.data, page, pageSize, setPage])

  const claim = async (item: PoolItem) => {
    // Claimed by a teammate first: the row is gone from the refreshed pool, so close its preview.
    if ((await actions.claim(item)) === 'already_claimed') setPreview((p) => (p ? { ...p, open: false } : p))
  }
  const assign = (item: PoolItem, userId: string, name: string) => {
    actions.assign(item, userId, name)
    setPreview((p) => (p ? { ...p, open: false } : p))
  }

  const columns = useMemo(
    () =>
      buildPoolColumns({
        canReassign,
        busy: actions.busy,
        onOpen: (item) => setPreview({ item, open: true }),
        onClaim: (item) => void claim(item),
        onAssign: assign,
      }),
    // claim/assign only use state setters and the pool actions, so these are the inputs that matter.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [canReassign, actions.busy],
  )

  const emptyContent = query.isError ? (
    <ErrorState title="Couldn’t load the pool" error={query.error} onRetry={() => query.refetch()} />
  ) : hasActiveFilters(filters) ? (
    <EmptyState
      icon={SearchX}
      title="No unassigned influencers match these filters"
      description="Try removing a filter or searching for something else."
      action={
        <Button variant="outline" size="sm" onClick={list.clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState icon={Inbox} title="The pool is empty" description="Every influencer has an owner. New unassigned ones will show up here." />
  )

  const members = (team.data?.items ?? [])
    .filter((u) => u.is_active)
    .sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id))

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-4 p-6 pb-4">
        <PageHeader
          title={
            <>
              Unassigned Pool{' '}
              {query.data && <span className="font-normal text-muted-foreground tabular-nums">({formatNumber(total)})</span>}
            </>
          }
          description={
            canReassign
              ? 'Influencers with no owner. Assign them, or let the team claim them.'
              : 'Influencers with no owner. Claim one to unlock their contact details and start working on it.'
          }
        />

        <ListSearch
          value={filters.q}
          onChange={(q) => list.setFilters({ q }, { replace: true })}
          placeholder={canReassign ? undefined : 'Search name, handle, city…'}
          label="Search the pool"
        />
        <InfluencerFilterBar filters={filters} onChange={list.setFilters} source="pool" hideAssigned hideDocuments />
        <ActiveFilters filters={filters} onChange={list.setFilters} onClear={list.clearFilters} />

        <InfluencersTable
          rows={rows}
          columns={columns}
          visibilityKey={canReassign ? 'influencehub-pool-columns' : 'influencehub-pool-columns-limited'}
          onOpenRow={(item) => setPreview({ item, open: true })}
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

      {(selectedRows.length > 0 || total > 0) && (
        <div className="sticky bottom-0 flex min-h-14 flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-6 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {selectedRows.length > 0 && (
              <>
                <span className="text-sm font-medium tabular-nums">{selectedRows.length} selected</span>
                <Button variant="ghost" size="icon-xs" onClick={() => setSelected(new Map())} aria-label="Clear selection">
                  <X />
                </Button>
                {canReassign ? (
                  <Button size="sm" disabled={actions.busy} onClick={() => setBulkAssign({ rows: selectedRows, open: true, pending: false })}>
                    <UserRound />
                    Assign {selectedRows.length}…
                  </Button>
                ) : (
                  <Button size="sm" disabled={actions.busy} onClick={async () => keepOnly(await actions.claimMany(selectedRows))}>
                    <UserRound />
                    Claim {selectedRows.length}
                  </Button>
                )}
              </>
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

      <PoolPreviewDrawer
        // The latest copy of the row (after a refetch), falling back to the one clicked once it leaves the pool.
        item={preview ? (rows.find((r) => r.id === preview.item.id) ?? preview.item) : null}
        open={!!preview?.open}
        onOpenChange={(open) => setPreview((p) => (p ? { ...p, open } : p))}
        busy={actions.busy}
        onClaim={(item) => void claim(item)}
        onAssign={assign}
      />

      {canReassign && (
        <BulkAssignDialog
          count={bulkAssign.rows.length}
          members={members}
          meId={me?.id}
          open={bulkAssign.open}
          pending={bulkAssign.pending}
          onOpenChange={(open) => setBulkAssign((s) => ({ ...s, open }))}
          onConfirm={async (assignees) => {
            setBulkAssign((s) => ({ ...s, pending: true }))
            keepOnly(await actions.assignMany(bulkAssign.rows, assignees))
            setBulkAssign((s) => ({ ...s, open: false, pending: false }))
          }}
        />
      )}
    </div>
  )
}
