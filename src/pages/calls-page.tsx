import { CalendarCheck, CheckCheck, Clock, History, Phone, PhoneCall } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel } from '@/components/common/platform-badge'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogCallDialog, type LogCallTarget } from '@/features/calls/log-call-dialog'
import { useMarkFollowUpDone } from '@/features/calls/queries'
import { useDefaultMine, useFollowUps } from '@/hooks/use-follow-ups'
import { useCan } from '@/hooks/use-me'
import { useTeamMap } from '@/hooks/use-team'
import { CALL_OUTCOME_META } from '@/lib/constants'
import { RelativeTime } from '@/components/common/relative-time'
import { formatDateTime } from '@/lib/format'
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
    <div className="max-w-60 space-y-1">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-md font-medium whitespace-nowrap',
          meta.badge,
        )}
      >
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
        {meta.label}
      </span>
      {call.notes && (
        <p className="truncate pl-1 text-body-sm text-muted-foreground" title={call.notes}>
          {call.notes}
        </p>
      )}
    </div>
  )
}

function InfluencerCell({ call }: { call: CallLogWithInfluencer }) {
  return (
    <div className="flex items-center gap-3">
      <PersonAvatar name={call.influencer.name} src={call.influencer.profile_pic_url} className="size-10 shadow-sm" />
      <div className="min-w-0">
        <Link
          to={`/influencers/${call.influencer_id}?tab=calls`}
          className="block truncate text-headline-sm font-semibold text-primary hover:underline"
        >
          {call.influencer.name}
        </Link>
        <AccountLabel account={call.influencer.primary_account} block className="text-body-sm text-muted-foreground" />
      </div>
    </div>
  )
}

function OwnerCell({ name }: { name: string | undefined }) {
  if (!name) return <>…</>
  return (
    <span className="flex items-center gap-2 text-body-md font-medium text-primary">
      <PersonAvatar aria-hidden name={name} className="size-6 text-[10px]" />
      {name}
    </span>
  )
}

function CountBadge({ bucket, mine }: { bucket: FollowUpBucket; mine: boolean }) {
  const { data } = useFollowUps(bucket, 1, 1, mine)
  if (!data) return null
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px font-code text-code font-semibold tabular-nums',
        bucket === 'today'
          ? 'bg-tertiary-fixed text-on-tertiary-fixed'
          : bucket === 'overdue' && data.total > 0
            ? 'bg-error-container text-on-error-container'
            : 'bg-surface-container-highest text-muted-foreground',
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
  // Executives only see follow-ups on influencers they own, so "only mine" would change nothing for them.
  const canSeeTeam = useCan('influencer:reassign')
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
    <div className="min-w-0 space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader
        title="Calls & Follow-ups"
        eyebrow={
          <>
            Outreach cadence <span className="text-outline">/</span>{' '}
            <span className="rounded-full bg-tertiary-fixed/30 px-2 py-0.5 font-code text-code tracking-normal text-on-tertiary-container">
              UTC +05:30
            </span>
          </>
        }
        description="Every time is shown in IST."
      />
      <Tabs
        value={bucket}
        onValueChange={(v) => update({ tab: v === 'today' ? null : v, page: null })}
        className="min-w-0 gap-space-lg"
      >
        <div className="flex max-w-full min-w-0 flex-col justify-between gap-space-md rounded-2xl bg-surface-container-lowest/70 p-space-sm shadow-sm backdrop-blur-2xl lg:flex-row lg:items-center">
          <TabsList className="min-w-0">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                {t.label}
                <CountBadge bucket={t.value} mine={mine} />
              </TabsTrigger>
            ))}
          </TabsList>
          {canSeeTeam && (
            <div className="flex items-center gap-space-sm self-end px-1 lg:self-auto">
              <Label htmlFor="only-mine" className="text-label-md text-muted-foreground hover:text-primary">
                Only my follow-ups
              </Label>
              <Switch
                id="only-mine"
                checked={mine}
                onCheckedChange={(v) => update({ scope: v === defaultMine ? null : v ? 'mine' : 'all', page: null })}
              />
            </div>
          )}
        </div>
        {/* One panel per tab so each trigger controls a real tabpanel; only the active one renders the table. */}
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.value === bucket && (
              <div className="overflow-hidden rounded-[20px] bg-surface-container-lowest/80 shadow-glass backdrop-blur-2xl">
                <div className="@container overflow-x-auto">
                  <Table
                    className={cn(
                      '[&_td]:py-4 [&_td:first-child]:pl-space-lg [&_td:last-child]:pr-space-lg [&_th]:py-3.5 [&_th:first-child]:pl-space-lg [&_th:last-child]:pr-space-lg',
                      query.isPlaceholderData && 'opacity-60',
                    )}
                  >
                    <TableHeader>
                      <TableRow>
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
                            {/* Pinned to the visible width so it stays on screen when the table scrolls sideways. */}
                            <div className="sticky left-6 w-[calc(100cqw-3rem)]">
                              <ErrorState title="Couldn’t load follow-ups" error={query.error} onRetry={() => query.refetch()} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : query.data.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7}>
                            <div className="sticky left-6 w-[calc(100cqw-3rem)]">
                              <EmptyState icon={history ? History : CalendarCheck} {...emptyCopy[bucket]} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        query.data.items.map((call) => {
                          const overdue = bucket === 'overdue'
                          const ownerId = history ? call.called_by : call.influencer.assigned_to
                          return (
                            <TableRow key={call.id}>
                              {history && (
                                <TableCell className="whitespace-nowrap">
                                  <RelativeTime iso={call.created_at} />
                                </TableCell>
                              )}
                              <TableCell>
                                <InfluencerCell call={call} />
                              </TableCell>
                              <TableCell>
                                {call.influencer.phone ? (
                                  <a
                                    href={`tel:${call.influencer.phone}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low/70 px-2 py-1 font-code text-code whitespace-nowrap text-on-surface hover:underline"
                                  >
                                    <Phone aria-hidden className="size-3.5 text-outline" strokeWidth={1.75} />
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
                                    <span
                                      className={cn(
                                        'flex items-center gap-1 text-label-md font-semibold text-primary',
                                        overdue && 'text-destructive',
                                      )}
                                    >
                                      <Clock
                                        aria-hidden
                                        className={cn('size-[15px]', overdue ? 'text-destructive' : 'text-on-tertiary-container')}
                                        strokeWidth={1.75}
                                      />
                                      {formatDateTime(call.follow_up_date)}
                                    </span>
                                    <span className="block text-body-sm text-muted-foreground">
                                      {call.follow_up_done ? 'Done' : <RelativeTime iso={call.follow_up_date} />}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {ownerId ? (
                                  <OwnerCell name={team.get(ownerId)?.name} />
                                ) : (
                                  <span className="text-muted-foreground">Unassigned</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="bg-surface-container-low/60 text-muted-foreground shadow-sm hover:bg-surface-container-high hover:text-primary active:scale-95"
                                    aria-label="Log call"
                                    title="Log call"
                                    onClick={() =>
                                      setLogFor({
                                        target: { id: call.influencer_id, name: call.influencer.name, stage: call.influencer.stage },
                                        open: true,
                                      })
                                    }
                                  >
                                    <PhoneCall className="size-[18px]" strokeWidth={1.75} />
                                  </Button>
                                  {!history && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-outline hover:bg-surface-container-low hover:text-primary active:scale-95"
                                      aria-label="Mark done"
                                      title="Mark done"
                                      disabled={markDone.isPending}
                                      onClick={() => done(call)}
                                    >
                                      <CheckCheck className="size-[18px]" strokeWidth={1.75} />
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
            )}
          </TabsContent>
        ))}
      </Tabs>

      {query.data && query.data.total > PAGE_SIZE && (
        <div className="flex justify-end">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data.total}
            onPageChange={(p) => update({ page: p > 1 ? String(p) : null })}
          />
        </div>
      )}

      {logFor && (
        <LogCallDialog influencer={logFor.target} open={logFor.open} onOpenChange={(open) => setLogFor((s) => (s ? { ...s, open } : s))} />
      )}
    </div>
  )
}
