import { CalendarCheck, History, PhoneCall } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { PersonAvatar } from '@/components/common/person-avatar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogCallDialog, type LogCallTarget } from '@/features/calls/log-call-dialog'
import { useMarkFollowUpDone } from '@/features/calls/queries'
import { useDefaultMine, useFollowUps } from '@/hooks/use-follow-ups'
import { useTeamMap } from '@/hooks/use-team'
import { CALL_OUTCOME_META } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { CallLogWithInfluencer, FollowUpBucket } from '@/types'

const PAGE_SIZE = 25
const TABS: { value: FollowUpBucket; label: string }[] = [
  { value: 'today', label: 'Due today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'history', label: 'History' },
]

function Outcome({ call }: { call: CallLogWithInfluencer }) {
  const meta = CALL_OUTCOME_META[call.outcome]
  return (
    <div className="max-w-56 space-y-0.5">
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', meta.badge)}>{meta.label}</span>
      {call.notes && (
        <p className="truncate text-xs text-muted-foreground" title={call.notes}>
          {call.notes}
        </p>
      )}
    </div>
  )
}

function InfluencerCell({ call }: { call: CallLogWithInfluencer }) {
  return (
    <div className="flex items-center gap-2.5">
      <PersonAvatar name={call.influencer.name} src={call.influencer.profile_pic_url} />
      <div className="min-w-0">
        <Link to={`/influencers/${call.influencer_id}?tab=calls`} className="block truncate font-medium hover:underline">
          {call.influencer.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">@{call.influencer.instagram_handle}</p>
      </div>
    </div>
  )
}

function CountBadge({ bucket, mine }: { bucket: FollowUpBucket; mine: boolean }) {
  const { data } = useFollowUps(bucket, 1, 1, mine)
  if (!data) return null
  return (
    <span
      className={cn(
        'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
        bucket === 'overdue' && data.total > 0 ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground',
      )}
    >
      {data.total}
    </span>
  )
}

export default function CallsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const team = useTeamMap()
  const defaultMine = useDefaultMine()
  const markDone = useMarkFollowUpDone()
  const [logFor, setLogFor] = useState<{ target: LogCallTarget; open: boolean } | null>(null)

  const tabParam = searchParams.get('tab') as FollowUpBucket | null
  const bucket: FollowUpBucket = TABS.some((t) => t.value === tabParam) ? tabParam! : 'today'
  const scope = searchParams.get('scope')
  const mine = scope ? scope === 'mine' : defaultMine
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const query = useFollowUps(bucket, page, PAGE_SIZE, mine)
  const history = bucket === 'history'

  const update = (patch: Record<string, string | null>) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k)
        else next.set(k, v)
      }
      return next
    })

  const done = (call: CallLogWithInfluencer) =>
    markDone.mutate(call.id, {
      onSuccess: () => toast.success(`Follow-up with ${call.influencer.name} marked done`),
      onError: (err) => toast.error('Couldn’t update the follow-up', { description: getErrorMessage(err) }),
    })

  const emptyCopy: Record<FollowUpBucket, { title: string; description: string }> = {
    today: { title: 'Nothing due today', description: 'Follow-ups you schedule for today will show up here.' },
    overdue: { title: 'Nothing overdue', description: 'You’re all caught up.' },
    upcoming: { title: 'No upcoming follow-ups', description: 'Schedule one when you log a call.' },
    history: { title: 'No calls logged yet', description: 'Calls appear here as soon as they’re logged.' },
  }

  return (
    <div className="space-y-4 p-6">
      <PageHeader title="Calls & Follow-ups" description="Every time is shown in IST." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={bucket} onValueChange={(v) => update({ tab: v === 'today' ? null : v, page: null })}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                {t.label}
                <CountBadge bucket={t.value} mine={mine} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Switch
            id="only-mine"
            checked={mine}
            onCheckedChange={(v) => update({ scope: v === defaultMine ? null : v ? 'mine' : 'all', page: null })}
          />
          <Label htmlFor="only-mine" className="text-sm">
            Only my follow-ups
          </Label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table className={cn(query.isPlaceholderData && 'opacity-60')}>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {history && <TableHead>Called</TableHead>}
                <TableHead>Influencer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>{history ? 'Outcome' : 'Last outcome'}</TableHead>
                <TableHead>Follow-up (IST)</TableHead>
                <TableHead>{history ? 'Called by' : 'Owner'}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: history ? 7 : 6 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : query.isError ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <ErrorState title="Couldn’t load follow-ups" error={query.error} onRetry={() => query.refetch()} />
                  </TableCell>
                </TableRow>
              ) : query.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState icon={history ? History : CalendarCheck} {...emptyCopy[bucket]} />
                  </TableCell>
                </TableRow>
              ) : (
                query.data.items.map((call) => {
                  const overdue = bucket === 'overdue'
                  const ownerId = history ? call.called_by : call.influencer.assigned_to
                  return (
                    <TableRow key={call.id}>
                      {history && (
                        <TableCell className="whitespace-nowrap" title={formatDateTime(call.created_at)}>
                          {formatRelative(call.created_at)}
                        </TableCell>
                      )}
                      <TableCell>
                        <InfluencerCell call={call} />
                      </TableCell>
                      <TableCell>
                        {call.influencer.phone ? (
                          <a href={`tel:${call.influencer.phone}`} className="whitespace-nowrap hover:underline">
                            {call.influencer.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Outcome call={call} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {call.follow_up_date ? (
                          <>
                            <span className={cn(overdue && 'font-medium text-destructive')}>{formatDateTime(call.follow_up_date)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {call.follow_up_done ? 'Done' : formatRelative(call.follow_up_date)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {ownerId ? (team.get(ownerId)?.name ?? '…') : <span className="text-muted-foreground">Unassigned</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogFor({ target: { id: call.influencer_id, name: call.influencer.name, stage: call.influencer.stage }, open: true })}
                          >
                            <PhoneCall />
                            Log call
                          </Button>
                          {!history && (
                            <Button variant="ghost" size="sm" disabled={markDone.isPending} onClick={() => done(call)}>
                              Mark done
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {query.data && query.data.total > PAGE_SIZE && (
        <div className="flex justify-end">
          <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(p) => update({ page: p > 1 ? String(p) : null })} />
        </div>
      )}

      {logFor && (
        <LogCallDialog
          influencer={logFor.target}
          open={logFor.open}
          onOpenChange={(open) => setLogFor((s) => (s ? { ...s, open } : s))}
        />
      )}
    </div>
  )
}
