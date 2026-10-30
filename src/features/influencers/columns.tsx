import type { ColumnDef, RowData } from '@tanstack/react-table'
import { BadgeCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel, PlatformMarks } from '@/components/common/platform-badge'
import { StageBadge } from '@/components/common/stage-badge'
import { SyncStatusBadge } from '@/components/common/sync-status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCompact, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { audienceOf, PLATFORM_META, primaryAccount, toRef } from '@/lib/platforms'
import type { Influencer, InfluencerSortKey, User } from '@/types'

declare module '@tanstack/react-table' {
  // Generic parameters must match the library's declaration.
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    sortKey?: InfluencerSortKey
    /** First click sorts descending (numbers, dates). */
    sortDescFirst?: boolean
    align?: 'right'
    /** Hidden until the user turns it on. */
    hiddenByDefault?: boolean
    className?: string
  }
}

const muted = <span className="text-muted-foreground">—</span>

/** Row checkboxes; shared with the pool table. */
export function selectColumn<T extends { name: string }>(): ColumnDef<T> {
  return {
    id: 'select',
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all on this page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={`Select ${row.original.name}`}
      />
    ),
    meta: { className: 'w-10' },
  }
}

export function buildColumns(team: Map<string, User>): ColumnDef<Influencer>[] {
  return [
    selectColumn<Influencer>(),
    {
      id: 'name',
      enableHiding: false,
      header: 'Influencer',
      meta: { label: 'Influencer', sortKey: 'name', className: 'min-w-52' },
      cell: ({ row }) => {
        const inf = row.original
        return (
          <div className="flex items-center gap-2.5">
            <PersonAvatar name={inf.name} src={inf.profile_pic_url} />
            <Link to={`/influencers/${inf.id}`} className="truncate font-medium hover:underline">
              {inf.name}
            </Link>
            {inf.is_verified && (
              <span title="Verified" className="shrink-0">
                <BadgeCheck className="size-4 text-sky-500" aria-label="Verified account" />
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'category',
      header: 'Category',
      meta: { label: 'Category' },
      cell: ({ row }) => row.original.category,
    },
    {
      id: 'handle',
      header: 'Primary account',
      meta: { label: 'Primary account' },
      cell: ({ row }) => {
        const primary = primaryAccount(row.original)
        return <AccountLabel account={primary && toRef(primary)} link className="max-w-48 text-muted-foreground" />
      },
    },
    {
      id: 'platforms',
      header: 'Platforms',
      meta: { label: 'Platforms' },
      cell: ({ row }) => <PlatformMarks platforms={row.original.accounts.map((a) => a.platform)} />,
    },
    {
      id: 'total_reach',
      header: 'Total reach',
      meta: { label: 'Total reach', sortKey: 'total_reach', sortDescFirst: true, align: 'right' },
      cell: ({ row }) => {
        const n = row.original.total_reach
        return n == null ? muted : <span title={`${formatNumber(n)} across ${row.original.accounts.length} account(s)`}>{formatCompact(n)}</span>
      },
    },
    {
      id: 'primary_followers',
      header: 'Primary followers',
      meta: { label: 'Primary followers', sortKey: 'primary_followers', sortDescFirst: true, align: 'right' },
      cell: ({ row }) => {
        const primary = primaryAccount(row.original)
        const n = primary && audienceOf(primary)
        if (!primary || n == null) return muted
        return <span title={`${formatNumber(n)} ${PLATFORM_META[primary.platform].audienceLabel.toLowerCase()}`}>{formatCompact(n)}</span>
      },
    },
    {
      id: 'phone',
      header: 'Phone',
      meta: { label: 'Phone' },
      cell: ({ row }) =>
        row.original.phone ? (
          <a href={`tel:${row.original.phone}`} className="whitespace-nowrap hover:underline">
            {row.original.phone}
          </a>
        ) : (
          muted
        ),
    },
    {
      id: 'email',
      header: 'Email',
      meta: { label: 'Email', hiddenByDefault: true },
      cell: ({ row }) =>
        row.original.email ? (
          <a href={`mailto:${row.original.email}`} className="block max-w-52 truncate hover:underline">
            {row.original.email}
          </a>
        ) : (
          muted
        ),
    },
    {
      id: 'city',
      header: 'City',
      meta: { label: 'City', sortKey: 'city' },
      cell: ({ row }) => row.original.city ?? muted,
    },
    {
      id: 'state',
      header: 'State',
      meta: { label: 'State' },
      cell: ({ row }) => row.original.state ?? muted,
    },
    {
      id: 'country',
      header: 'Country',
      meta: { label: 'Country', hiddenByDefault: true },
      cell: ({ row }) => row.original.country ?? muted,
    },
    {
      id: 'stage',
      header: 'Stage',
      meta: { label: 'Stage', sortKey: 'stage' },
      cell: ({ row }) => <StageBadge stage={row.original.stage} />,
    },
    {
      id: 'assigned_to',
      header: 'Assigned to',
      meta: { label: 'Assigned to' },
      cell: ({ row }) => {
        const user = row.original.assigned_to ? team.get(row.original.assigned_to) : undefined
        if (!row.original.assigned_to) return <span className="text-muted-foreground">Unassigned</span>
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <PersonAvatar name={user?.name ?? '?'} className="size-5 text-[9px]" />
            {user?.name ?? '…'}
          </span>
        )
      },
    },
    {
      id: 'sync',
      header: 'Sync',
      meta: { label: 'Sync status (primary)' },
      cell: ({ row }) => {
        const primary = primaryAccount(row.original)
        return primary ? <SyncStatusBadge status={primary.sync_status} /> : muted
      },
    },
    {
      id: 'last_synced_at',
      header: 'Last synced',
      meta: { label: 'Last synced', hiddenByDefault: true },
      cell: ({ row }) => {
        const at = primaryAccount(row.original)?.last_synced_at
        return at ? (
          <span className="whitespace-nowrap" title={formatDateTime(at)}>
            {formatRelative(at)}
          </span>
        ) : (
          muted
        )
      },
    },
  ]
}
