import type { ColumnDef } from '@tanstack/react-table'
import { AccountLabel } from '@/components/common/platform-badge'
import { RelativeTime } from '@/components/common/relative-time'
import { SyncStatusBadge } from '@/components/common/sync-status-badge'
import { buildColumns } from '@/features/influencers/columns'
import { formatCompact, formatNumber } from '@/lib/format'
import { audienceOf, PLATFORM_META, toRef } from '@/lib/platforms'
import type { Influencer, Platform, User } from '@/types'
import { accountOn } from './onboarded'

const muted = <span className="text-muted-foreground">—</span>

/** Everyone here is onboarded, so stage and the primary account give way to this platform's account. */
const DROPPED = new Set(['select', 'handle', 'platforms', 'instagram_followers', 'stage', 'sync', 'last_synced_at'])

export function buildOnboardedColumns(team: Map<string, User>, platform: Platform): ColumnDef<Influencer>[] {
  const meta = PLATFORM_META[platform]
  const base = buildColumns(team).filter((c) => !DROPPED.has(c.id ?? ''))
  const platformColumns: ColumnDef<Influencer>[] = [
    {
      id: 'account',
      enableHiding: false,
      header: `${meta.label} account`,
      meta: { label: `${meta.label} account` },
      cell: ({ row }) => {
        const account = accountOn(row.original, platform)
        return <AccountLabel account={account && toRef(account)} link className="max-w-48 text-muted-foreground" />
      },
    },
    {
      id: 'audience',
      header: meta.audienceLabel,
      meta: { label: meta.audienceLabel, sortKey: 'followers', sortDescFirst: true, align: 'right' },
      cell: ({ row }) => {
        const account = accountOn(row.original, platform)
        const n = account && audienceOf(account)
        if (n == null) return muted
        return <span title={`${formatNumber(n)} ${meta.audienceLabel.toLowerCase()}`}>{formatCompact(n)}</span>
      },
    },
  ]
  const syncColumns: ColumnDef<Influencer>[] = [
    {
      id: 'sync',
      header: 'Sync',
      meta: { label: `Sync status (${meta.label})` },
      cell: ({ row }) => {
        const account = accountOn(row.original, platform)
        return account ? <SyncStatusBadge status={account.sync_status} /> : muted
      },
    },
    {
      id: 'last_synced_at',
      header: 'Last synced',
      meta: { label: 'Last synced', hiddenByDefault: true },
      cell: ({ row }) => {
        const at = accountOn(row.original, platform)?.last_synced_at
        return at ? <RelativeTime iso={at} className="whitespace-nowrap" /> : muted
      },
    },
  ]
  // Influencer, then this platform's account and audience, then the shared columns, then sync.
  return [base[0], ...platformColumns, ...base.slice(1), ...syncColumns]
}
