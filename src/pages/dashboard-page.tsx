import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, CircleCheck, Filter, History, PhoneCall, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { PersonAvatar } from '@/components/common/person-avatar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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

/** Stitch KPI card: label (+ hint) and a cyan dot, a hairline, then the value; linked tiles show an arrow. */
function Kpi({ label, value, to, hint }: { label: string; value: number; to?: string; hint?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <div className="flex min-w-0 flex-col pr-1">
          <span className="line-clamp-2 text-label-sm font-medium text-muted-foreground">{label}</span>
          {hint && <span className="mt-0.5 text-body-sm text-muted-foreground/60">{hint}</span>}
        </div>
        <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-on-tertiary-container" />
      </div>
      <div>
        <div aria-hidden className="my-3 h-px w-full bg-surface-container-highest" />
        <div className="flex items-center justify-between gap-1">
          <span className="text-headline-md font-semibold tracking-tight text-primary tabular-nums">{formatNumber(value)}</span>
          {to && (
            <ArrowUpRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-on-tertiary-container"
              strokeWidth={1.75}
            />
          )}
        </div>
      </div>
    </>
  )
  const className =
    'group relative flex flex-col justify-between rounded-2xl bg-surface-container-lowest/70 p-space-md shadow-glass backdrop-blur-2xl transition-all duration-200 last:col-span-2 sm:last:col-span-1 dark:ring-1 dark:ring-white/5'
  return to ? (
    <Link
      to={to}
      className={cn(
        className,
        'hover:-translate-y-0.5 hover:shadow-glass-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** Dashboard glass card: optional icon, headline-sm title, body-sm subtitle, and a right-hand slot. */
function Panel({
  title,
  icon: Icon,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode
  icon?: LucideIcon
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('gap-0 p-space-lg', className)}>
      <div className="mb-space-md flex items-start justify-between gap-space-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-space-sm">
            {Icon && <Icon aria-hidden className="size-5 shrink-0 text-primary" strokeWidth={1.75} />}
            <h2 className="text-headline-sm font-semibold tracking-tight text-primary">{title}</h2>
          </div>
          {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

function MyFollowUps({ items }: { items: DashboardSummary['my_follow_ups'] }) {
  const markDone = useMarkFollowUpDone()
  const [logFor, setLogFor] = useState<{ target: LogCallTarget; open: boolean } | null>(null)
  const today = todayKey()

  if (items.length === 0) {
    return <EmptyState icon={CircleCheck} title="You’re all caught up" description="No follow-ups due today or overdue." className="py-10" />
  }
  return (
    <>
      <ul className="divide-y divide-surface-container">
        {items.map((call) => {
          const overdue = dayKey(call.follow_up_date!) < today
          return (
            <li key={call.id} className="flex items-center gap-3 py-2.5">
              <PersonAvatar name={call.influencer.name} src={call.influencer.profile_pic_url} />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/influencers/${call.influencer_id}?tab=calls`}
                  className="block truncate text-body-md font-medium text-primary hover:underline"
                >
                  {call.influencer.name}
                </Link>
                <p className="truncate text-body-sm text-muted-foreground">
                  {CALL_OUTCOME_META[call.outcome].label} ·{' '}
                  {overdue ? (
                    <span className="font-medium text-error">
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
  if (items.length === 0) return <EmptyState icon={History} title="No activity yet" className="py-10" />
  return (
    <ol className="divide-y divide-surface-container">
      {items.map((a) => {
        const { text, detail } = describeActivity(a, team)
        return (
          <li key={a.id} className="py-2.5 text-body-md">
            <Link to={`/influencers/${a.influencer_id}?tab=activity`} className="font-medium text-primary hover:underline">
              {a.influencer.name}
            </Link>{' '}
            <span className="text-muted-foreground">·</span> {text}
            {detail && <span className="text-muted-foreground"> — “{detail}”</span>}
            <p className="mt-0.5 text-body-sm text-muted-foreground">
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
    <div className="space-y-space-lg" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-space-md sm:grid-cols-3 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl last:col-span-2 sm:last:col-span-1" />
        ))}
      </div>
      <div className="grid gap-space-lg lg:grid-cols-12">
        <Skeleton className="h-72 rounded-2xl lg:col-span-7" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-5" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: me } = useMe()
  const summary = useQuery({ queryKey: queryKeys.dashboard, queryFn: ({ signal }) => dashboardApi.summary(signal), refetchInterval: 60_000 })

  return (
    <div className="space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader title={me ? `Welcome back, ${me.name.split(' ')[0]}` : 'Dashboard'} description="Where the pipeline stands today." />
      {summary.isPending ? (
        <DashboardSkeleton />
      ) : summary.isError ? (
        <ErrorState title="Couldn’t load the dashboard" error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <section aria-label="Key numbers" className="grid grid-cols-2 gap-space-md sm:grid-cols-3 lg:grid-cols-7">
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

          <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
            <Panel
              title="Pipeline"
              icon={Filter}
              description="Click a stage to see its influencers"
              className="lg:col-span-7"
              action={
                <span className="shrink-0 rounded-full bg-surface-container px-2.5 py-1 text-label-sm font-medium text-muted-foreground tabular-nums">
                  {formatNumber(summary.data.funnel.reduce((sum, f) => sum + f.count, 0))} total
                </span>
              }
            >
              <PipelineFunnel funnel={summary.data.funnel} />
            </Panel>
            <Panel
              title="My follow-ups"
              icon={PhoneCall}
              className="lg:col-span-5"
              action={<span className="shrink-0 pt-0.5 text-label-sm text-muted-foreground">Today &amp; overdue</span>}
            >
              <MyFollowUps items={summary.data.my_follow_ups} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-2">
            <Card className="gap-0 p-space-lg">
              <BarListChart
                title="Influencers by category"
                description="How many influencers are in each category"
                data={summary.data.by_category.map((c) => ({ label: c.category, value: c.count }))}
                unit="Influencers"
                labelHeader="Category"
              />
            </Card>
            <Card className="gap-0 p-space-lg">
              <BarListChart
                title="Top 10 cities"
                description="Cities with the most influencers"
                data={summary.data.top_cities.map((c) => ({ label: c.city, value: c.count }))}
                unit="Influencers"
                labelHeader="City"
              />
            </Card>
          </div>

          <Panel title="Recent activity" icon={History} description="Latest updates to influencers">
            <RecentActivity items={summary.data.recent_activity} />
          </Panel>
        </>
      )}
    </div>
  )
}
