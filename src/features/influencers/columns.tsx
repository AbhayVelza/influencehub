import type { ColumnDef, RowData } from '@tanstack/react-table'
import { BadgeCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmailValue } from '@/components/common/email-value'
import { PersonAvatar } from '@/components/common/person-avatar'
import { DocFlags } from '@/features/documents/doc-flags'
import { AccountLabel, PlatformMarks } from '@/components/common/platform-badge'
import { StageBadge } from '@/components/common/stage-badge'
import { SyncStatusBadge } from '@/components/common/sync-status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { RelativeTime } from '@/components/common/relative-time'
import { formatCompact, formatNumber } from '@/lib/format'
import { instagramFollowers, primaryAccount, toRef } from '@/lib/platforms'
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

/** Filled cyan badge after a verified creator's name; shared with the pool table. */
export function verifiedMark() {
  return (
    <span title="Verified" className="shrink-0">
      <BadgeCheck
        className="size-[15px] fill-on-tertiary-container text-surface-container-lowest"
        aria-label="Verified account"
      />
    </span>
  )
}

/** Stitch category pill; shared with the pool table. */
export function categoryPill(category: string) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-medium text-on-surface">
      {category}
    </span>
  )
}

/** Sum across all accounts; shown on the Onboarded tabs only (not the main Influencers list). */
export const totalReachColumn: ColumnDef<Influencer> = {
  id: 'total_reach',
  header: 'Total followers',
  meta: { label: 'Total followers', sortKey: 'total_reach', sortDescFirst: true, align: 'right' },
  cell: ({ row }) => {
    const n = row.original.total_reach
    return n == null ? (
      muted
    ) : (
      <span
        title={`${formatNumber(n)} across ${row.original.accounts.length} account(s)`}
        className="font-semibold tracking-tight text-on-surface"
      >
        {formatCompact(n)}
      </span>
    )
  },
}

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
    meta: { className: 'w-10 pl-5 pr-2' },
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
        const handle = primaryAccount(inf)?.handle
        return (
          <div className="flex items-center gap-3">
            <PersonAvatar name={inf.name} src={inf.profile_pic_url} className="size-10 shadow-sm" />
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link
                  to={`/influencers/${inf.id}`}
                  className="truncate text-body-md leading-tight font-semibold text-primary hover:underline"
                >
                  {inf.name}
                </Link>
                {inf.is_verified && verifiedMark()}
              </div>
              {handle && <span className="truncate font-code text-[11px] text-muted-foreground">@{handle}</span>}
            </div>
          </div>
        )
      },
    },
    {
      id: 'category',
      header: 'Category',
      meta: { label: 'Category' },
      cell: ({ row }) => categoryPill(row.original.category),
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
      id: 'instagram_followers',
      header: 'Instagram followers',
      meta: { label: 'Instagram followers', sortKey: 'instagram_followers', sortDescFirst: true, align: 'right' },
      cell: ({ row }) => {
        const n = instagramFollowers(row.original)
        if (n == null) return muted
        return (
          <span title={`${formatNumber(n)} Instagram followers`} className="font-semibold tracking-tight text-on-surface">
            {formatCompact(n)}
          </span>
        )
      },
    },
    {
      id: 'phone',
      header: 'Phone',
      meta: { label: 'Phone' },
      cell: ({ row }) =>
        row.original.phone ? (
          <a
            href={`tel:${row.original.phone}`}
            className="font-code text-[11px] whitespace-nowrap text-muted-foreground hover:text-on-surface hover:underline"
          >
            {row.original.phone}
          </a>
        ) : (
          muted
        ),
    },
    {
      id: 'email',
      header: 'Email',
      meta: { label: 'Email' },
      cell: ({ row }) =>
        row.original.email ? (
          <EmailValue value={row.original.email} className="block max-w-44 truncate text-muted-foreground" />
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
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-label-md text-on-surface">
            <PersonAvatar name={user?.name ?? '?'} className="size-5 text-[9px]" />
            {user?.name ?? '…'}
          </span>
        )
      },
    },
    {
      id: 'docs',
      header: 'Docs',
      meta: { label: 'Docs' },
      cell: ({ row }) => {
        // Documents aren't kept for the Unassigned Pool.
        const docs = row.original.documents
        if (!docs) return muted
        return <DocFlags documents={docs} />
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
          <RelativeTime iso={at} className="whitespace-nowrap" />
        ) : (
          muted
        )
      },
    },
  ]
}
