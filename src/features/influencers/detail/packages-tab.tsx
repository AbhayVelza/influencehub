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
  onEdit: (pkg: Package) => void
}

export function PackagesTab({ influencerId, onCreate, onEdit }: PackagesTabProps) {
  const packages = usePackages({ influencer_id: influencerId, page_size: 100 })

  if (packages.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    )
  }
  if (packages.isError) {
    return <ErrorState title="Couldn’t load packages" error={packages.error} onRetry={() => packages.refetch()} />
  }
  if (packages.data.items.length === 0) {
    return (
      <EmptyState
        icon={PackageIcon}
        title="No packages yet"
        description="Create a package once the influencer is onboarded and the address is confirmed."
        action={<Button onClick={onCreate}>Create package</Button>}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus />
          Create package
        </Button>
      </div>
      <ul className="space-y-2">
        {packages.data.items.map((pkg) => (
          <li key={pkg.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PACKAGE_STATUS_META[pkg.status].badge)}>
                  {PACKAGE_STATUS_META[pkg.status].label}
                </span>
                <p>{pkg.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
              </div>
              <Button variant="ghost" size="xs" onClick={() => onEdit(pkg)}>
                <Pencil />
                Edit
              </Button>
            </div>
            <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Courier</dt>
              <dd>{pkg.courier ?? '—'}</dd>
              <dt className="text-muted-foreground">Tracking</dt>
              <dd className="flex items-center gap-1">
                {pkg.tracking_number ? (
                  <>
                    <span className="font-mono">{pkg.tracking_number}</span>
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
              <dt className="text-muted-foreground">Sent</dt>
              <dd>{formatDate(pkg.sent_at)}</dd>
              <dt className="text-muted-foreground">Delivered</dt>
              <dd>{formatDate(pkg.delivered_at)}</dd>
              <dt className="text-muted-foreground">Ship to</dt>
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
