import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Copy, MoreHorizontal, Package as PackageIcon, Pencil, Plus, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DateRangeFilter } from '@/components/common/date-range-filter'
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
import { needsStatusConfirm, useUpdatePackage, type StageChangingStatus } from '@/features/packages/queries'
import { copyToClipboard } from '@/lib/clipboard'
import { COURIERS, PACKAGE_STATUS_META, PACKAGE_STATUSES } from '@/lib/constants'
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
      toast.error('Couldn’t open the package', { description: getErrorMessage(err) })
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
      toast.success(`Package marked ${PACKAGE_STATUS_META[status].label.toLowerCase()}`)
    } catch (err) {
      toast.error('Couldn’t update the package', { description: getErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={
          <>
            Packages{' '}
            {query.data && <span className="font-normal text-muted-foreground tabular-nums">({formatNumber(query.data.total)})</span>}
          </>
        }
        actions={
          <Button onClick={() => setPickerOpen(true)}>
            <Plus />
            Create package
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ListSearch
          value={params.q}
          onChange={(q) => update({ q })}
          placeholder="Search name, handle, tracking…"
          label="Search packages"
          className="max-w-72"
        />
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
        {filtered && (
          <Button
            variant="link"
            size="sm"
            onClick={() => setSearchParams(new URLSearchParams())}
          >
            Clear all
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table className={cn(query.isPlaceholderData && 'opacity-60')}>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Influencer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Courier</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : query.isError ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <ErrorState title="Couldn’t load packages" error={query.error} onRetry={() => query.refetch()} />
                  </TableCell>
                </TableRow>
              ) : query.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    {filtered ? (
                      <EmptyState icon={SearchX} title="No packages match these filters" />
                    ) : (
                      <EmptyState
                        icon={PackageIcon}
                        title="No packages yet"
                        description="Create one once an influencer is onboarded."
                        action={<Button onClick={() => setPickerOpen(true)}>Create package</Button>}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                query.data.items.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar name={pkg.influencer.name} src={pkg.influencer.profile_pic_url} />
                        <div className="min-w-0">
                          <Link to={`/influencers/${pkg.influencer_id}?tab=packages`} className="block truncate font-medium hover:underline">
                            {pkg.influencer.name}
                          </Link>
                          <AccountLabel account={pkg.influencer.primary_account} block className="text-xs text-muted-foreground" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate" title={pkg.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}>
                        {pkg.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', PACKAGE_STATUS_META[pkg.status].badge)}>
                        {PACKAGE_STATUS_META[pkg.status].label}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{pkg.courier ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {pkg.tracking_number ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="font-mono text-xs">{pkg.tracking_number}</span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
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
                    <TableCell className="whitespace-nowrap">{formatDate(pkg.sent_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(pkg.delivered_at)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${pkg.influencer.name}’s package`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => openDrawer(pkg.influencer_id, pkg)}>
                            <Pencil />
                            Edit package
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-muted-foreground">Mark as</DropdownMenuLabel>
                          {PACKAGE_STATUSES.filter((s) => s !== pkg.status && s !== 'preparing').map((s) => (
                            <DropdownMenuItem key={s} onSelect={() => setStatus(pkg, s)}>
                              {PACKAGE_STATUS_META[s].label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {query.data && query.data.total > PAGE_SIZE && (
        <div className="flex justify-end">
          <Pagination page={params.page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(page) => update({ page })} />
        </div>
      )}

      <InfluencerPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
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
