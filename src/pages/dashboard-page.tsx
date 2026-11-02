import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, History, PhoneCall } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { PersonAvatar } from '@/components/common/person-avatar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LogCallDialog, type LogCallTarget } from '@/features/calls/log-call-dialog'
import { useMarkFollowUpDone } from '@/features/calls/queries'
import { BarListChart } from '@/features/dashboard/bar-list-chart'
import { PipelineFunnel } from '@/features/dashboard/pipeline-funnel'
import { useMe } from '@/hooks/use-me'
import { useTeamMap } from '@/hooks/use-team'
import { describeActivity } from '@/lib/activity-text'
import { CALL_OUTCOME_META } from '@/lib/constants'
import { RelativeTime } from '@/components/common/relative-time'
import { dayKey, formatDateTime, formatNumber, formatTime, todayKey } from '@/lib/format'
import { queryKeys } from '@/lib/query'
import { ONBOARDED_OR_LATER } from '@/lib/stages'
import { cn } from '@/lib/utils'
import { dashboardApi, getErrorMessage } from '@/services'
import type { DashboardSummary } from '@/types'

function Kpi({ label, value, to, hint }: { label: string; value: number; to?: string; hint?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(value)}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  )
  const className = 'block rounded-xl bg-card p-4 ring-1 ring-foreground/10'
  return to ? (
    <Link to={to} className={cn(className, 'hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function Panel({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function MyFollowUps({ items }: { items: DashboardSummary['my_follow_ups'] }) {
  const markDone = useMarkFollowUpDone()
  const [logFor, setLogFor] = useState<{ target: LogCallTarget; open: boolean } | null>(null)
  const today = todayKey()

  if (items.length === 0) {
    return <EmptyState icon={CalendarCheck} title="You’re all caught up" description="No follow-ups due today or overdue." className="py-8" />
  }
  return (
    <>
      <ul className="divide-y">
        {items.map((call) => {
          const overdue = dayKey(call.follow_up_date!) < today
          return (
            <li key={call.id} className="flex items-center gap-3 py-2">
              <PersonAvatar name={call.influencer.name} src={call.influencer.profile_pic_url} />
              <div className="min-w-0 flex-1">
                <Link to={`/influencers/${call.influencer_id}?tab=calls`} className="block truncate text-sm font-medium hover:underline">
                  {call.influencer.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {CALL_OUTCOME_META[call.outcome].label} ·{' '}
                  {overdue ? (
                    <span className="font-medium text-destructive">
                      Overdue <RelativeTime iso={call.follow_up_date} />
                    </span>
                  ) : (
                    <span title={formatDateTime(call.follow_up_date)}>Today {formatTime(call.follow_up_date)}</span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Log call with ${call.influencer.name}`}
                onClick={() => setLogFor({ target: { id: call.influencer_id, name: call.influencer.name, stage: call.influencer.stage }, open: true })}
              >
                <PhoneCall />
                Log call
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={markDone.isPending}
                aria-label={`Mark follow-up with ${call.influencer.name} done`}
                onClick={() =>
                  markDone.mutate(call.id, {
                    onSuccess: () => toast.success('Follow-up marked done'),
                    onError: (err) => toast.error('Couldn’t update the follow-up', { description: getErrorMessage(err) }),
                  })
                }
              >
                Done
              </Button>
            </li>
          )
        })}
      </ul>
      {logFor && (
        <LogCallDialog influencer={logFor.target} open={logFor.open} onOpenChange={(open) => setLogFor((s) => (s ? { ...s, open } : s))} />
      )}
    </>
  )
}

function RecentActivity({ items }: { items: DashboardSummary['recent_activity'] }) {
  const team = useTeamMap()
  if (items.length === 0) return <EmptyState icon={History} title="No activity yet" className="py-8" />
  return (
    <ol className="divide-y">
      {items.map((a) => {
        const { text, detail } = describeActivity(a, team)
        return (
          <li key={a.id} className="py-2 text-sm">
            <Link to={`/influencers/${a.influencer_id}?tab=activity`} className="font-medium hover:underline">
              {a.influencer.name}
            </Link>{' '}
            <span className="text-muted-foreground">·</span> {text}
            {detail && <span className="text-muted-foreground"> — “{detail}”</span>}
            <p className="text-xs text-muted-foreground">
              {a.actor ? (team.get(a.actor)?.name ?? 'Someone') : 'System'} ·{' '}
              <RelativeTime iso={a.created_at} />
            </p>
          </li>
        )
      })}
    </ol>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-3 gap-3 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: me } = useMe()
  const summary = useQuery({ queryKey: queryKeys.dashboard, queryFn: ({ signal }) => dashboardApi.summary(signal), refetchInterval: 60_000 })

  return (
    <div className="space-y-4 p-6">
      <PageHeader title={me ? `Welcome back, ${me.name.split(' ')[0]}` : 'Dashboard'} description="Where the pipeline stands today." />
      {summary.isPending ? (
        <DashboardSkeleton />
      ) : summary.isError ? (
        <ErrorState title="Couldn’t load the dashboard" error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <section aria-label="Key numbers" className="grid grid-cols-3 gap-3 xl:grid-cols-7">
            <Kpi label={me?.role === 'executive' ? 'My influencers' : 'Total influencers'} value={summary.data.kpis.total} to="/influencers" />
            <Kpi
              label="Unassigned Pool"
              value={summary.data.kpis.pool}
              to="/pool"
              hint={summary.data.kpis.claimed_this_week === null ? undefined : `${formatNumber(summary.data.kpis.claimed_this_week)} claimed this week`}
            />
            <Kpi label="Contacted this week" value={summary.data.kpis.contacted_this_week} hint="Moved to Contacted since Monday" />
            <Kpi label="Onboarded this month" value={summary.data.kpis.onboarded_this_month} />
            <Kpi label="Packages in transit" value={summary.data.kpis.packages_in_transit} to="/packages?status=sent&status=in_transit" />
            <Kpi label="Follow-ups today" value={summary.data.kpis.follow_ups_today} to="/calls" />
            <Kpi
              label="Onboarded without agreement"
              value={summary.data.kpis.onboarded_without_agreement}
              to={`/influencers?${ONBOARDED_OR_LATER.map((s) => `stage=${s}`).join('&')}&agreement=missing`}
              hint="Onboarded or later, no agreement on file"
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Pipeline" action={<span className="text-xs text-muted-foreground">Click a stage to see its influencers</span>}>
              <PipelineFunnel funnel={summary.data.funnel} />
            </Panel>
            <Panel title="My follow-ups · today & overdue">
              <MyFollowUps items={summary.data.my_follow_ups} />
            </Panel>
            <Panel title="Influencers by category">
              <BarListChart
                data={summary.data.by_category.map((c) => ({ label: c.category, value: c.count }))}
                unit="Influencers"
                labelHeader="Category"
              />
            </Panel>
            <Panel title="Top 10 cities">
              <BarListChart data={summary.data.top_cities.map((c) => ({ label: c.city, value: c.count }))} unit="Influencers" labelHeader="City" />
            </Panel>
          </div>

          <Panel title="Recent activity">
            <RecentActivity items={summary.data.recent_activity} />
          </Panel>
        </>
      )}
    </div>
  )
}
