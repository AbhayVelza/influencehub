import { CalendarClock, Check, PhoneCall } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useInfluencerCalls, useMarkFollowUpDone } from '@/features/calls/queries'
import { useTeamMap } from '@/hooks/use-team'
import { CALL_OUTCOME_META } from '@/lib/constants'
import { RelativeTime } from '@/components/common/relative-time'
import { dayKey, formatDateTime, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { CallLog } from '@/types'

function FollowUp({ call, influencerId }: { call: CallLog; influencerId: string }) {
  const markDone = useMarkFollowUpDone(influencerId)
  if (!call.follow_up_date) return null
  const day = dayKey(call.follow_up_date)
  const today = todayKey()
  const overdue = !call.follow_up_done && day < today
  const dueToday = !call.follow_up_done && day === today

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-body-sm">
      <CalendarClock className="size-3.5 text-on-tertiary-container" strokeWidth={1.75} />
      <span className={cn('text-on-surface', overdue && 'font-medium text-error', dueToday && 'font-semibold text-primary')}>
        Follow-up {formatDateTime(call.follow_up_date)}
        {overdue && ' · overdue'}
        {dueToday && ' · today'}
      </span>
      {call.follow_up_done ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Check className="size-3" />
          Done
        </span>
      ) : (
        <Button
          variant="outline"
          size="xs"
          disabled={markDone.isPending}
          onClick={() =>
            markDone.mutate(call.id, {
              onSuccess: () => toast.success('Follow-up marked done'),
              onError: (err) => toast.error('Couldn’t update the follow-up', { description: getErrorMessage(err) }),
            })
          }
        >
          Mark done
        </Button>
      )}
    </div>
  )
}

export function CallsTab({ influencerId, onLogCall }: { influencerId: string; onLogCall: () => void }) {
  const calls = useInfluencerCalls(influencerId)
  const team = useTeamMap()

  if (calls.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    )
  }
  if (calls.isError) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
        <ErrorState title="Couldn’t load calls" error={calls.error} onRetry={() => calls.refetch()} />
      </div>
    )
  }
  if (calls.data.items.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
        <EmptyState
          icon={PhoneCall}
          title="No calls yet"
          description="Log the first call to record the outcome and plan a follow-up."
          action={<Button onClick={onLogCall}>Log call</Button>}
        />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
      <div className="flex items-center justify-between gap-2 px-space-md py-3 sm:px-5">
        <h2 className="text-label-sm tracking-wider text-muted-foreground uppercase">Call history</h2>
        <Button variant="outline" size="sm" onClick={onLogCall}>
          <PhoneCall />
          Log call
        </Button>
      </div>
      <ol className="divide-y divide-surface-container border-t border-surface-container">
        {calls.data.items.map((call) => (
          <li key={call.id} className="px-space-md py-3.5 transition-colors duration-150 hover:bg-tertiary-fixed/20 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 text-body-sm">
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', CALL_OUTCOME_META[call.outcome].badge)}>
                {CALL_OUTCOME_META[call.outcome].label}
              </span>
              <span className="text-muted-foreground">
                {team.get(call.called_by)?.name ?? 'Someone'} ·{' '}
                <RelativeTime iso={call.created_at} />
              </span>
            </div>
            {call.notes && <p className="mt-2 text-body-md whitespace-pre-wrap text-on-surface">{call.notes}</p>}
            <FollowUp call={call} influencerId={influencerId} />
          </li>
        ))}
      </ol>
    </div>
  )
}
