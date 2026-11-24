import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Copy, MoreHorizontal, Package as PackageIcon, Pencil, Plus, SearchX, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DateRangeFilter } from '@/components/common/date-range-filter'
import { CollapsibleFilters } from '@/components/common/collapsible-filters'
import { MultiSelectFilter } from '@/components/common/multi-select-filter'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel } from '@/components/common/platform-badge'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ListSearch } from '@/features/influencers/list-search'
import { InfluencerPicker } from '@/features/packages/influencer-picker'
import { PackageDrawer, type PackageTarget } from '@/features/packages/package-drawer'
import { PackageStatusConfirm } from '@/features/packages/package-status-confirm'
import { movedStage, needsStatusConfirm, useUpdatePackage, type StageChangingStatus } from '@/features/packages/queries'
import { copyToClipboard } from '@/lib/clipboard'
import { COURIERS, PACKAGE_STATUS_META, PACKAGE_STATUSES, STAGE_META } from '@/lib/constants'
import { formatDate, formatNumber } from '@/lib/format'
import { queryKeys } from '@/lib/query'
import { cn } from '@/lib/utils'
import { getErrorMessage, influencersApi, packagesApi } from '@/services'
import type { PackageListParams, PackageStatus, PackageWithInfluencer } from '@/types'

const PAGE_SIZE = 25
const SHIPPED: PackageStatus[] = ['sent', 'in_transit', 'delivered', 'returned']

function readParams(sp: URLSearchParams): PackageListParams & { page: number } {
  return {
    q: sp.get('q') || undefined,
    status: sp.getAll('status').filter((s): s is PackageStatus => PACKAGE_STATUSES.includes(s as PackageStatus)),
    courier: sp.getAll('courier'),
    sent_from: sp.get('sent_from') || undefined,
    sent_to: sp.get('sent_to') || undefined,
    page: Math.max(1, Number(sp.get('page')) || 1),
  }
}

export default function PackagesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = readParams(searchParams)
  const updatePackage = useUpdatePackage()
  const [drawer, setDrawer] = useState<{ influencer: PackageTarget; pkg?: PackageWithInfluencer | null; open: boolean } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ pkg: PackageWithInfluencer; status: StageChangingStatus } | null>(null)

  const query = useQuery({
    queryKey: queryKeys.packageList({ ...params, page_size: PAGE_SIZE }),
    queryFn: ({ signal }) => packagesApi.list({ ...params, page_size: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  })

  const update = (patch: Partial<Record<'q' | 'sent_from' | 'sent_to', string | undefined>> & { status?: string[]; courier?: string[]; page?: number }) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key)
        if (Array.isArray(value)) value.forEach((v) => next.append(key, v))
        else if (value !== undefined && value !== '' && !(key === 'page' && value === 1)) next.set(key, String(value))
      }
      if (!('page' in patch)) next.delete('page')
      return next
    })

  const filtered = !!(params.q || params.status?.length || params.courier?.length || params.sent_from || params.sent_to)

  // The drawer prefills the influencer's address, so open it with the full record.
  const openDrawer = async (influencerId: string, pkg?: PackageWithInfluencer) => {
    try {
      const influencer = await influencersApi.get(influencerId)
      setDrawer({ influencer, pkg, open: true })
    } catch (err) {
      toast.error('Couldn’t open the Welcome Kit', { description: getErrorMessage(err) })
    }
  }

  const setStatus = (pkg: PackageWithInfluencer, status: PackageStatus) => {
    if (SHIPPED.includes(status) && (!pkg.courier || !pkg.tracking_number)) {
      toast.info('Add a courier and tracking number first')
      return openDrawer(pkg.influencer_id, pkg)
    }
    if (needsStatusConfirm(pkg.status, status)) return setConfirm({ pkg, status })
    return saveStatus(pkg, status)
  }

  const saveStatus = async (pkg: PackageWithInfluencer, status: PackageStatus) => {
    try {
      await updatePackage.mutateAsync({ id: pkg.id, body: { status } })
      const stage = await movedStage(pkg.influencer_id, pkg.influencer.stage, pkg.status, status)
      toast.success(`Welcome Kit marked ${PACKAGE_STATUS_META[status].label.toLowerCase()}`, {
        description: stage ? `${pkg.influencer.name} is now in ${STAGE_META[stage].label}` : undefined,
      })
    } catch (err) {
      toast.error('Couldn’t update the Welcome Kit', { description: getErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader
        title="Welcome Kits"
        className="md:items-center"
        count={
          query.data && (
            <>
              <span className="sr-only">(</span>
              {formatNumber(query.data.total)}
              <span className="sr-only">)</span>
            </>
          )
        }
        actions={
          <Button onClick={() => setPickerOpen(true)}>
            <Plus />
            Create Welcome Kit
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-space-sm">
        <ListSearch
          value={params.q}
          onChange={(q) => update({ q })}
          placeholder="Search name, handle, tracking…"
          label="Search Welcome Kits"
          className="max-w-md min-w-48 flex-1 [&_input]:bg-surface-container-lowest/70 [&_input]:shadow-sm [&_input]:backdrop-blur-xl"
        />
        <CollapsibleFilters
          activeCount={(params.status?.length ? 1 : 0) + (params.courier?.length ? 1 : 0) + (params.sent_from || params.sent_to ? 1 : 0)}
          actions={
            filtered && (
              <Button variant="link" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
                Clear all
              </Button>
            )
          }
        >
          <MultiSelectFilter
            label="Status"
            options={PACKAGE_STATUSES.map((s) => ({ value: s, label: PACKAGE_STATUS_META[s].label }))}
            selected={params.status ?? []}
            onChange={(status) => update({ status })}
          />
          <MultiSelectFilter
            label="Courier"
            options={COURIERS.map((c) => ({ value: c, label: c }))}
            selected={params.courier ?? []}
            onChange={(courier) => update({ courier })}
          />
          <DateRangeFilter
            label="Sent"
            value={{ from: params.sent_from, to: params.sent_to }}
            onChange={({ from, to }) => update({ sent_from: from, sent_to: to })}
          />
        </CollapsibleFilters>
      </div>

      <div className="overflow-hidden rounded-[20px] bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl">
        <div className="@container overflow-x-auto">
          <Table className={cn(query.isPlaceholderData && 'opacity-60')}>
            <TableHeader>
              <TableRow>
                <TableHead className="py-3.5 pl-space-md">Influencer</TableHead>
                <TableHead className="px-4 py-3.5">Items</TableHead>
                <TableHead className="px-4 py-3.5">Status</TableHead>
                <TableHead className="px-4 py-3.5">Courier</TableHead>
                <TableHead className="px-4 py-3.5">Tracking</TableHead>
                <TableHead className="px-4 py-3.5">Sent</TableHead>
                <TableHead className="px-4 py-3.5">Delivered</TableHead>
                <TableHead className="w-10 py-3.5 pr-space-md">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }, (_, j) => (
                      <TableCell key={j} className="px-4">
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : query.isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    {/* Pinned to the visible width so the message stays on screen when the table scrolls sideways. */}
                    <div className="sticky left-0 w-[100cqw]">
                    <ErrorState title="Couldn’t load Welcome Kits" error={query.error} onRetry={() => query.refetch()} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : query.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    {/* Pinned to the visible width so the message stays on screen when the table scrolls sideways. */}
                    <div className="sticky left-0 w-[100cqw]">
                    {filtered ? (
                      <EmptyState icon={SearchX} title="No Welcome Kits match these filters" />
                    ) : (
                      <EmptyState
                        icon={PackageIcon}
                        title="No Welcome Kits yet"
                        description="Create one once an influencer is onboarded."
                        action={<Button onClick={() => setPickerOpen(true)}>Create Welcome Kit</Button>}
                      />
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                query.data.items.map((pkg) => {
                  const itemLabels = pkg.items.map((i) => `${i.name} × ${i.qty}`)
                  return (
                    <TableRow key={pkg.id} className="group">
                      <TableCell className="py-3 pl-space-md">
                        <div className="flex items-center gap-3">
                          <PersonAvatar name={pkg.influencer.name} src={pkg.influencer.profile_pic_url} className="size-9 shadow-sm" />
                          <div className="min-w-0">
                            <Link
                              to={`/influencers/${pkg.influencer_id}?tab=packages`}
                              className="block truncate text-body font-semibold text-on-surface group-hover:text-primary hover:underline"
                            >
                              {pkg.influencer.name}
                            </Link>
                            <AccountLabel account={pkg.influencer.primary_account} block className="text-small text-muted-foreground" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-56 px-4 py-3">
                        <div className="min-w-0" title={itemLabels.join(', ')}>
                          <span className="block truncate font-medium text-on-surface">{itemLabels[0]}</span>
                          {itemLabels.length > 1 && (
                            <span className="block truncate text-small text-muted-foreground">{itemLabels.slice(1).join(' + ')}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-medium whitespace-nowrap',
                            PACKAGE_STATUS_META[pkg.status].badge,
                          )}
                        >
                          <span aria-hidden className="size-1.5 rounded-full bg-current" />
                          {PACKAGE_STATUS_META[pkg.status].label}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap">
                        {pkg.courier ? (
                          <span className="flex items-center gap-1.5 font-medium text-on-surface">
                            <Truck aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                            {pkg.courier}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {pkg.tracking_number ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="rounded-md bg-surface-container-low px-1.5 py-0.5 tabular-nums text-small whitespace-nowrap text-muted-foreground select-all">
                              {pkg.tracking_number}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="text-muted-foreground hover:text-primary"
                              aria-label={`Copy tracking number ${pkg.tracking_number}`}
                              onClick={() => copyToClipboard(pkg.tracking_number!, 'Tracking number copied')}
                            >
                              <Copy />
                            </Button>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(pkg.sent_at)}</TableCell>
                      <TableCell className="px-4 py-3 whitespace-nowrap text-on-surface tabular-nums">{formatDate(pkg.delivered_at)}</TableCell>
                      <TableCell className="py-3 pr-space-md text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-lg text-muted-foreground hover:bg-surface-container hover:text-primary"
                              aria-label={`Actions for ${pkg.influencer.name}’s Welcome Kit`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 p-1.5">
                            <DropdownMenuItem onSelect={() => openDrawer(pkg.influencer_id, pkg)} className="rounded-xl px-3 py-2">
                              <Pencil />
                              Edit Welcome Kit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="px-3 text-small tracking-wider text-muted-foreground uppercase">Mark as</DropdownMenuLabel>
                            {PACKAGE_STATUSES.filter((s) => s !== pkg.status && s !== 'preparing').map((s) => (
                              <DropdownMenuItem key={s} onSelect={() => setStatus(pkg, s)} className="rounded-xl px-3 py-2">
                                {PACKAGE_STATUS_META[s].label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        {query.data && query.data.total > PAGE_SIZE && (
          <div className="flex justify-end px-4 py-3 sm:px-space-lg">
            <Pagination page={params.page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(page) => update({ page })} />
          </div>
        )}
      </div>

      <InfluencerPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        eligible={(inf) => inf.stage !== 'rejected'}
        onPick={(influencer) => {
          setPickerOpen(false)
          setDrawer({ influencer, pkg: null, open: true })
        }}
      />
      {drawer && (
        <PackageDrawer
          influencer={drawer.influencer}
          pkg={drawer.pkg}
          open={drawer.open}
          onOpenChange={(open) => setDrawer((d) => (d ? { ...d, open } : d))}
        />
      )}
      <PackageStatusConfirm
        status={confirm?.status ?? null}
        influencerName={confirm?.pkg.influencer.name ?? ''}
        influencerStage={confirm?.pkg.influencer.stage}
        pending={updatePackage.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          await saveStatus(confirm.pkg, confirm.status)
          setConfirm(null)
        }}
      />
    </div>
  )
}
