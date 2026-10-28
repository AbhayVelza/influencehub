import { Bell } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useDefaultMine, useFollowUps } from '@/hooks/use-follow-ups'
import { CALL_OUTCOME_META } from '@/lib/constants'
import { formatDate, formatRelative } from '@/lib/format'
import type { CallLogWithInfluencer } from '@/types'

const MAX_ITEMS = 8

function FollowUpRow({ call, overdue }: { call: CallLogWithInfluencer; overdue: boolean }) {
  return (
    <>
      <PersonAvatar name={call.influencer.name} src={call.influencer.profile_pic_url} className="size-7" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{call.influencer.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {CALL_OUTCOME_META[call.outcome].label} ·{' '}
          {overdue ? (
            <span className="text-destructive">Overdue {formatRelative(call.follow_up_date)}</span>
          ) : (
            `Today ${formatDate(call.follow_up_date, 'h:mm a')}`
          )}
        </p>
      </div>
    </>
  )
}

/** Follow-ups that need attention: overdue first, then due today. */
export function NotificationsMenu() {
  const navigate = useNavigate()
  const mine = useDefaultMine()
  const overdue = useFollowUps('overdue', 1, 25, mine)
  const today = useFollowUps('today', 1, 25, mine)

  const isLoading = overdue.isLoading || today.isLoading
  const isError = overdue.isError || today.isError
  const total = (overdue.data?.total ?? 0) + (today.data?.total ?? 0)
  const rows = [
    ...(overdue.data?.items ?? []).map((call) => ({ call, overdue: true })),
    ...(today.data?.items ?? []).map((call) => ({ call, overdue: false })),
  ].slice(0, MAX_ITEMS)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${total} follow-ups due`}>
          <Bell />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
              {total > 9 ? '9+' : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Follow-ups due
          {total > 0 && <span className="text-xs font-normal text-muted-foreground">{total} open</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="size-7 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Couldn’t load follow-ups.</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>
        ) : (
          rows.map(({ call, overdue: isOverdue }) => (
            <DropdownMenuItem
              key={call.id}
              className="gap-2.5 py-2"
              onSelect={() => navigate(`/influencers/${call.influencer_id}`)}
            >
              <FollowUpRow call={call} overdue={isOverdue} />
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center text-sm">
          <Link to="/calls">View all follow-ups</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
