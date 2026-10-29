import type { ColumnDef } from '@tanstack/react-table'
import { BadgeCheck, ExternalLink, UserRound } from 'lucide-react'
import { PersonAvatar } from '@/components/common/person-avatar'
import { StageBadge } from '@/components/common/stage-badge'
import { Button } from '@/components/ui/button'
import { selectColumn } from '@/features/influencers/columns'
import { formatCompact, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import type { PoolItem } from '@/types'
import { AssignMenu } from './pool-preview'
import { isFullInfluencer } from './queries'

const muted = <span className="text-muted-foreground">—</span>

interface PoolColumnOptions {
  /** Managers and admins see contact details and assign; executives claim. */
  canReassign: boolean
  busy: boolean
  onOpen: (item: PoolItem) => void
  onClaim: (item: PoolItem) => void
  onAssign: (item: PoolItem, userId: string, name: string) => void
}

export function buildPoolColumns({ canReassign, busy, onOpen, onClaim, onAssign }: PoolColumnOptions): ColumnDef<PoolItem>[] {
  const contact: ColumnDef<PoolItem>[] = canReassign
    ? [
        {
          id: 'phone',
          header: 'Phone',
          meta: { label: 'Phone' },
          cell: ({ row }) => {
            const phone = isFullInfluencer(row.original) ? row.original.phone : null
            return phone ? (
              <a href={`tel:${phone}`} className="whitespace-nowrap hover:underline">
                {phone}
              </a>
            ) : (
              muted
            )
          },
        },
        {
          id: 'email',
          header: 'Email',
          meta: { label: 'Email', hiddenByDefault: true },
          cell: ({ row }) => {
            const email = isFullInfluencer(row.original) ? row.original.email : null
            return email ? (
              <a href={`mailto:${email}`} className="block max-w-52 truncate hover:underline">
                {email}
              </a>
            ) : (
              muted
            )
          },
        },
      ]
    : []

  return [
    selectColumn<PoolItem>(),
    {
      id: 'name',
      enableHiding: false,
      header: 'Influencer',
      meta: { label: 'Influencer', sortKey: 'name', className: 'min-w-52' },
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex items-center gap-2.5">
            <PersonAvatar name={item.name} src={item.profile_pic_url} />
            {/* Opens the preview drawer, not the profile: pool rows aren't anyone's yet. */}
            <button type="button" onClick={() => onOpen(item)} className="truncate text-left font-medium hover:underline">
              {item.name}
            </button>
            {item.is_verified && (
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
      id: 'account',
      header: 'Primary account',
      meta: { label: 'Primary account' },
      cell: ({ row }) => (
        <a
          href={row.original.profile_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
        >
          @{row.original.instagram_handle}
          <ExternalLink className="size-3" />
        </a>
      ),
    },
    {
      id: 'platforms',
      header: 'Platforms',
      meta: { label: 'Platforms' },
      cell: () => 'Instagram',
    },
    {
      id: 'followers',
      header: 'Followers',
      meta: { label: 'Followers', sortKey: 'followers', sortDescFirst: true, align: 'right' },
      cell: ({ row }) => {
        const n = row.original.followers
        return n == null ? muted : <span title={formatNumber(n)}>{formatCompact(n)}</span>
      },
    },
    ...contact,
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
      meta: { label: 'Country' },
      cell: ({ row }) => row.original.country ?? muted,
    },
    {
      id: 'stage',
      header: 'Stage',
      meta: { label: 'Stage', sortKey: 'stage' },
      cell: ({ row }) => <StageBadge stage={row.original.stage} />,
    },
    {
      id: 'created_at',
      header: 'Added',
      meta: { label: 'Added', sortKey: 'created_at', sortDescFirst: true, hiddenByDefault: true },
      cell: ({ row }) => (
        <span className="whitespace-nowrap" title={formatDateTime(row.original.created_at)}>
          {formatRelative(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: 'right' },
      cell: ({ row }) =>
        canReassign ? (
          <AssignMenu
            size="sm"
            label="Assign"
            influencerName={row.original.name}
            disabled={busy}
            onAssign={(userId, name) => onAssign(row.original, userId, name)}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onClaim(row.original)}
            aria-label={`Claim ${row.original.name}`}
          >
            <UserRound />
            Claim
          </Button>
        ),
    },
  ]
}
