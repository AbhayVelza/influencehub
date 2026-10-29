import { BadgeCheck, ChevronDown, ExternalLink, Lock, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { StageBadge } from '@/components/common/stage-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCan, useMe } from '@/hooks/use-me'
import { useTeam } from '@/hooks/use-team'
import { formatCompact, formatDateTime, formatLocation, formatNumber, formatRelative } from '@/lib/format'
import type { PoolItem } from '@/types'
import { isFullInfluencer } from './queries'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const none = <span className="text-muted-foreground">—</span>

/** What the pool shows about an influencer: everyone gets the basics; managers and admins also get contact details. */
export function PoolPreview({ item }: { item: PoolItem }) {
  const full = isFullInfluencer(item) ? item : null
  const address = full?.address
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <PersonAvatar name={item.name} src={item.profile_pic_url} className="size-14 text-base" />
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 font-heading text-lg font-semibold">
            <span className="truncate">{item.name}</span>
            {item.is_verified && <BadgeCheck className="size-4 shrink-0 text-sky-500" aria-label="Verified account" />}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border px-2 py-0.5 text-xs">{item.category}</span>
            <StageBadge stage={item.stage} />
          </div>
        </div>
      </div>

      <dl className="divide-y">
        <Row label="Primary account">
          <a
            href={item.profile_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            @{item.instagram_handle}
            <ExternalLink className="size-3" />
          </a>
        </Row>
        <Row label="Platforms">Instagram</Row>
        <Row label="Followers">
          {item.followers == null ? none : <span title={formatNumber(item.followers)}>{formatCompact(item.followers)}</span>}
        </Row>
        <Row label="Location">{formatLocation([item.city, item.state, item.country])}</Row>
        <Row label="Added">
          <span title={formatDateTime(item.created_at)}>{formatRelative(item.created_at)}</span>
        </Row>
        {full && (
          <>
            <Row label="Phone">{full.phone ? <a href={`tel:${full.phone}`} className="hover:underline">{full.phone}</a> : none}</Row>
            <Row label="Email">
              {full.email ? <a href={`mailto:${full.email}`} className="hover:underline">{full.email}</a> : none}
            </Row>
            <Row label="Address">
              {address
                ? [address.line1, address.line2, `${address.city}, ${address.state} ${address.postal_code}`, address.country]
                    .filter(Boolean)
                    .join(', ')
                : none}
            </Row>
            <Row label="Tags">{full.tags.length ? full.tags.join(', ') : none}</Row>
            <Row label="Notes">{full.notes ? <span className="whitespace-pre-line">{full.notes}</span> : none}</Row>
          </>
        )}
      </dl>

      {!full && (
        <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          Phone, email, address, notes and call history unlock once you claim this influencer.
        </p>
      )}
    </div>
  )
}

/** Managers and admins: pick an owner for an unassigned influencer. */
export function AssignMenu({
  onAssign,
  disabled,
  size = 'default',
  label = 'Assign to…',
  influencerName,
}: {
  onAssign: (userId: string, name: string) => void
  disabled?: boolean
  size?: 'default' | 'sm'
  label?: string
  /** Completes the button's accessible name when several are on screen ("Assign Riya Shah"). */
  influencerName?: string
}) {
  const team = useTeam()
  const { data: me } = useMe()
  // Me first, then everyone else who's active.
  const members = (team.data?.items ?? [])
    .filter((u) => u.is_active)
    .sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={disabled}>
          <UserRound />
          {label}
          {influencerName && <span className="sr-only"> {influencerName}</span>}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Assign to</DropdownMenuLabel>
        {team.isLoading && <DropdownMenuItem disabled>Loading team…</DropdownMenuItem>}
        {team.isError && <DropdownMenuItem disabled>Couldn’t load team</DropdownMenuItem>}
        {members.map((user) => (
          <DropdownMenuItem key={user.id} onSelect={() => onAssign(user.id, user.name)}>
            <PersonAvatar name={user.name} className="size-5 text-[9px]" />
            {user.id === me?.id ? `${user.name} (me)` : user.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Executives claim; managers and admins assign (or open the full profile). */
export function PoolActions({
  item,
  busy,
  onClaim,
  onAssign,
}: {
  item: PoolItem
  busy: boolean
  onClaim: () => void
  onAssign: (userId: string, name: string) => void
}) {
  const canReassign = useCan('influencer:reassign')
  if (!canReassign) {
    return (
      <Button onClick={onClaim} disabled={busy}>
        <UserRound />
        {busy ? 'Claiming…' : 'Claim'}
      </Button>
    )
  }
  return (
    <>
      <Button asChild variant="ghost">
        <Link to={`/influencers/${item.id}`}>Open full profile</Link>
      </Button>
      <AssignMenu onAssign={onAssign} disabled={busy} />
    </>
  )
}

export function PoolPreviewDrawer({
  item,
  open,
  onOpenChange,
  busy,
  onClaim,
  onAssign,
}: {
  item: PoolItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  onClaim: (item: PoolItem) => void
  onAssign: (item: PoolItem, userId: string, name: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Unassigned influencer</SheetTitle>
          <SheetDescription>In the pool: anyone on the team can claim them.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">{item && <PoolPreview item={item} />}</div>
        {item && (
          <SheetFooter className="flex-row justify-end border-t">
            <PoolActions
              item={item}
              busy={busy}
              onClaim={() => onClaim(item)}
              onAssign={(userId, name) => onAssign(item, userId, name)}
            />
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
