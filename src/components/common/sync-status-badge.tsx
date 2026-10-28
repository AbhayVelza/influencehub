import { SYNC_STATUS_META } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { SyncStatus } from '@/types'

export function SyncStatusBadge({ status, className }: { status: SyncStatus; className?: string }) {
  const meta = SYNC_STATUS_META[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground', className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', meta.dot, status === 'pending' && 'animate-pulse')} />
      {meta.label}
    </span>
  )
}
