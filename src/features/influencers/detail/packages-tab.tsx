import { Copy, Package as PackageIcon, Pencil, Plus } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePackages } from '@/features/packages/queries'
import { copyToClipboard } from '@/lib/clipboard'
import { PACKAGE_STATUS_META } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Package } from '@/types'

interface PackagesTabProps {
  influencerId: string
  onCreate: () => void
  /** False for a rejected influencer: no new packages. */
  canCreate: boolean
  onEdit: (pkg: Package) => void
}

export function PackagesTab({ influencerId, onCreate, canCreate, onEdit }: PackagesTabProps) {
  const packages = usePackages({ influencer_id: influencerId, page_size: 100 })

  if (packages.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    )
  }
  if (packages.isError) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
        <ErrorState title="Couldn’t load packages" error={packages.error} onRetry={() => packages.refetch()} />
      </div>
    )
  }
  if (packages.data.items.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
        <EmptyState
          icon={PackageIcon}
          title="No packages yet"
          description={
            canCreate
              ? 'Create a package once the influencer is onboarded and the address is confirmed.'
              : 'This influencer was rejected, so no packages can be created.'
          }
          action={canCreate ? <Button onClick={onCreate}>Create package</Button> : undefined}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus />
            Create package
          </Button>
        </div>
      )}
      <ul className="space-y-3">
        {packages.data.items.map((pkg) => (
          <li key={pkg.id} className="rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5 p-space-md text-body-md sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2">
                <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium', PACKAGE_STATUS_META[pkg.status].badge)}>
                  {PACKAGE_STATUS_META[pkg.status].label}
                </span>
                <p className="font-medium text-primary">{pkg.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onEdit(pkg)}>
                <Pencil />
                Edit
              </Button>
            </div>
            <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-surface-container-low/60 p-3 text-body-sm">
              <dt className="text-label-sm tracking-wider text-muted-foreground uppercase">Courier</dt>
              <dd>{pkg.courier ?? '—'}</dd>
              <dt className="text-label-sm tracking-wider text-muted-foreground uppercase">Tracking</dt>
              <dd className="flex items-center gap-1">
                {pkg.tracking_number ? (
                  <>
                    <span className="font-code text-on-surface">{pkg.tracking_number}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Copy tracking number"
                      onClick={() => copyToClipboard(pkg.tracking_number!, 'Tracking number copied')}
                    >
                      <Copy />
                    </Button>
                  </>
                ) : (
                  '—'
                )}
              </dd>
              <dt className="text-label-sm tracking-wider text-muted-foreground uppercase">Sent</dt>
              <dd>{formatDate(pkg.sent_at)}</dd>
              <dt className="text-label-sm tracking-wider text-muted-foreground uppercase">Delivered</dt>
              <dd>{formatDate(pkg.delivered_at)}</dd>
              <dt className="text-label-sm tracking-wider text-muted-foreground uppercase">Ship to</dt>
              <dd>
                {pkg.address.line1}, {pkg.address.city}, {pkg.address.state} {pkg.address.postal_code}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
