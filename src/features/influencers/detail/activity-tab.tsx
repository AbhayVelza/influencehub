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
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (activity.isError) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
        <ErrorState title="Couldn’t load activity" error={activity.error} onRetry={() => activity.refetch()} />
      </div>
    )
  }
  const items = activity.data.pages.flatMap((p) => p.items)
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
        <EmptyState icon={History} title="No activity yet" />
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5 p-space-md sm:p-5">
      <ol className="divide-y divide-surface-container overflow-hidden rounded-xl bg-surface-container-low/50">
        {items.map((entry) => {
          const Icon = ICONS[entry.type]
          const { text, detail } = describeActivity(entry, team)
          return (
            <li key={entry.id} className="flex items-start gap-3 px-3 py-3 transition-colors duration-150 hover:bg-tertiary-fixed/20">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest text-on-tertiary-container shadow-sm">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-md text-on-surface">{text}</p>
                {detail && <p className="mt-0.5 text-body-md text-muted-foreground">“{detail}”</p>}
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  {entry.actor ? name(entry.actor, team) : 'System'} ·{' '}
                  <RelativeTime iso={entry.created_at} />
                </p>
              </div>
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
