import { RelativeTime } from '@/components/common/relative-time'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  Combine,
  FilePlus2,
  FileX2,
  History,
  Link2,
  Package,
  Pencil,
  PhoneCall,
  PlusCircle,
  RefreshCw,
  Sparkles,
  UserMinus,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamMap } from '@/hooks/use-team'
import { describeActivity } from '@/lib/activity-text'
import type { Activity, ActivityType, Paginated, User } from '@/types'

const ICONS: Record<ActivityType, LucideIcon> = {
  created: Sparkles,
  updated: Pencil,
  stage_changed: ArrowRightLeft,
  assigned: UserRound,
  call_logged: PhoneCall,
  package_created: Package,
  package_updated: Package,
  account_synced: RefreshCw,
  account_added: PlusCircle,
  connect_link_sent: Link2,
  merged: Combine,
  claimed: UserPlus,
  released: UserMinus,
  document_uploaded: FilePlus2,
  document_deleted: FileX2,
}

interface ActivityTabProps {
  activity: UseInfiniteQueryResult<InfiniteData<Paginated<Activity>>>
}

export function ActivityTab({ activity }: ActivityTabProps) {
  const team = useTeamMap()

  if (activity.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  if (activity.isError) {
    return <ErrorState title="Couldn’t load activity" error={activity.error} onRetry={() => activity.refetch()} />
  }
  const items = activity.data.pages.flatMap((p) => p.items)
  if (items.length === 0) return <EmptyState icon={History} title="No activity yet" />

  return (
    <div className="space-y-4">
      <ol className="relative space-y-4 border-l pl-6">
        {items.map((entry) => {
          const Icon = ICONS[entry.type]
          const { text, detail } = describeActivity(entry, team)
          return (
            <li key={entry.id} className="relative">
              <span className="absolute top-0.5 -left-[2.0625rem] flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground">
                <Icon className="size-3.5" />
              </span>
              <p className="text-sm">{text}</p>
              {detail && <p className="mt-0.5 text-sm text-muted-foreground">“{detail}”</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.actor ? name(entry.actor, team) : 'System'} ·{' '}
                <RelativeTime iso={entry.created_at} />
              </p>
            </li>
          )
        })}
      </ol>
      {activity.hasNextPage && (
        <Button variant="outline" size="sm" onClick={() => activity.fetchNextPage()} disabled={activity.isFetchingNextPage}>
          {activity.isFetchingNextPage ? 'Loading…' : 'Load older activity'}
        </Button>
      )}
    </div>
  )
}

function name(id: string, team: Map<string, User>) {
  return team.get(id)?.name ?? 'Someone'
}
