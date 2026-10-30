import { formatDateTime, formatRelative } from '@/lib/format'

/** "2 hours ago" with the exact dd/MM/yyyy, hh:mm a (IST) time in its tooltip. */
export function RelativeTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return <span className={className}>—</span>
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className={className}>
      {formatRelative(iso)}
    </time>
  )
}
