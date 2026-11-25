import { Clock } from 'lucide-react'
import { STALE_AFTER_DAYS } from '@/lib/constants'
import { formatDateTime, formatRelative, isStale } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * How old an account's numbers are: "Synced 3 days ago" from `last_synced_at` (exact IST time in the tooltip), with a
 * "Stale" marker once older than STALE_AFTER_DAYS. `prefix=""` drops "Synced" (table cells under a "Last synced" header).
 */
export function DataAge({ iso, prefix = 'Synced', className }: { iso: string | null | undefined; prefix?: string; className?: string }) {
  if (!iso) return <span className={cn('text-muted-foreground', className)}>—</span>
  const stale = isStale(iso)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap',
        stale ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground',
        className,
      )}
    >
      <time dateTime={iso} title={formatDateTime(iso)}>
        {prefix ? `${prefix} ` : ''}
        {formatRelative(iso)}
      </time>
      {stale && (
        <span
          title={`Not synced for more than ${STALE_AFTER_DAYS} days`}
          className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
        >
          <Clock className="size-3" aria-hidden />
          Stale
        </span>
      )}
    </span>
  )
}
