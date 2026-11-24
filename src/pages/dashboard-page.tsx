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
import { AreaTrendChart } from '@/features/dashboard/area-trend-chart'
import { BarListChart } from '@/features/dashboard/bar-list-chart'
import { ColumnChart } from '@/features/dashboard/column-chart'
import { RecentlyOnboardedTable, TeamPerformanceTable } from '@/features/dashboard/dashboard-tables'
import { MeterList } from '@/features/dashboard/meter-list'
import { PipelineFunnel } from '@/features/dashboard/pipeline-funnel'
import { SegmentedBar } from '@/features/dashboard/segmented-bar'
import { PlatformMark } from '@/components/common/platform-badge'
import { PLATFORM_META } from '@/lib/platforms'
import { useCan, useMe } from '@/hooks/use-me'
import { useTeamMap } from '@/hooks/use-team'
import { describeActivity } from '@/lib/activity-text'
import { CALL_OUTCOME_META, PACKAGE_STATUS_META } from '@/lib/constants'
import { RelativeTime } from '@/components/common/relative-time'
import { dayKey, formatChartDay, formatDateTime, formatDay, formatNumber, formatTime, todayKey } from '@/lib/format'
import { queryKeys } from '@/lib/query'
import { ONBOARDED_OR_LATER } from '@/lib/stages'
import { cn } from '@/lib/utils'
import { dashboardApi, getErrorMessage } from '@/services'
import type { DashboardSummary } from '@/types'

/** Stitch KPI card: label (+ hint) and a cyan dot, a hairline, then the value; linked tiles show an arrow. */
function Kpi({ label, value, to, hint }: { label: string; value: number; to?: string; hint?: string }) {
  // Two parts: the words on top, the number below a divider. Tiles in a row share a height, so every number sits on
  // the same line.
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <div className="flex min-w-0 flex-col pr-1">
          <span className="line-clamp-2 text-small font-medium text-muted-foreground">{label}</span>
          {hint && <span className="mt-0.5 text-small text-muted-foreground/60">{hint}</span>}
        </div>
        <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-on-tertiary-container" />
      </div>
      <div>
        <div aria-hidden className="my-3 h-px w-full bg-surface-container-highest" />
        <div className="flex items-center justify-between gap-1">
          <span className="text-h2 font-semibold tracking-tight text-primary tabular-nums">{formatNumber(value)}</span>
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
            <h2 className="text-h3 font-semibold tracking-tight text-primary">{title}</h2>
          </div>
          {description && <p className="mt-0.5 text-small text-muted-foreground">{description}</p>}
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
                  className="block truncate text-body font-medium text-primary hover:underline"
                >
                  {call.influencer.name}
                </Link>
                <p className="truncate text-small text-muted-foreground">
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
          <li key={a.id} className="py-2.5 text-body">
            <Link to={`/influencers/${a.influencer_id}?tab=activity`} className="font-medium text-primary hover:underline">
              {a.influencer.name}
            </Link>{' '}
            <span className="text-muted-foreground">·</span> {text}
            {detail && <span className="text-muted-foreground"> — “{detail}”</span>}
            <p className="mt-0.5 text-small text-muted-foreground">
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

/** Chart rows for the dashboard's trends and breakdowns. */
function chartData(s: DashboardSummary) {
  return {
    weeks: s.onboarded_by_week.map((w) => ({
      key: w.week_start,
      label: formatChartDay(w.week_start),
      fullLabel: `Week of ${formatDay(w.week_start)}`,
      value: w.count,
    })),
    days: s.calls_by_day.map((d) => ({ key: d.day, label: formatChartDay(d.day), fullLabel: formatDay(d.day), value: d.count })),
    bands: s.follower_bands.map((b) => ({ key: b.band, label: shortBand(b.band), fullLabel: b.band, value: b.count })),
    platforms: s.by_platform.map((p) => ({
      key: p.platform,
      name: PLATFORM_META[p.platform].label,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <PlatformMark platform={p.platform} />
          {PLATFORM_META[p.platform].label}
        </span>
      ),
      value: p.count,
    })),
    kits: s.packages_by_status.map((p) => ({ key: p.status, label: PACKAGE_STATUS_META[p.status].label, value: p.count })),
    outcomes: s.call_outcomes_30d.map((o) => ({ key: o.outcome, label: CALL_OUTCOME_META[o.outcome].label, value: o.count })),
  }
}

/** Axis label for a size band that fits a narrow card: "Under 10K" → "<10K", "100K–500K" → "100–500K". */
const shortBand = (band: string) => band.replace(/^Under /, '<').replace(/^(\d+)K–(\d+)K$/, '$1–$2K')

export default function DashboardPage() {
  const { data: me } = useMe()
  const crm = useCan('crm:access')
  const summary = useQuery({ queryKey: queryKeys.dashboard, queryFn: ({ signal }) => dashboardApi.summary(signal), refetchInterval: 60_000 })
  const noun = crm ? 'Influencers' : 'Creators'

  return (
    <div className="space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader title={me ? `Welcome back, ${me.name.split(' ')[0]}` : 'Dashboard'} description={crm ? 'Where the pipeline stands today.' : 'Your onboarded creators at a glance.'} />
      {summary.isPending ? (
        <DashboardSkeleton />
      ) : summary.isError ? (
        <ErrorState title="Couldn’t load the dashboard" error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        (() => {
          const s = summary.data
          const c = chartData(s)
          const onboardedWeeks = (
            <Panel title="Onboarded per week · last 12 weeks">
              <ColumnChart data={c.weeks} unit="Onboarded" labelHeader="Week" />
            </Panel>
          )
          const breakdowns = (
            <div className="grid gap-space-lg md:grid-cols-2 xl:grid-cols-3">
              <Panel title={`${noun} by follower size`}>
                <ColumnChart data={c.bands} unit={noun} labelHeader="Total followers" height={200} showEveryLabel />
              </Panel>
              <Card className="gap-0 p-space-lg">
                <BarListChart
                  title={`${noun} by category`}
                  data={s.by_category.map((x) => ({ label: x.category, value: x.count }))}
                  unit={noun}
                  labelHeader="Category"
                />
              </Card>
              <Card className="gap-0 p-space-lg md:col-span-2 xl:col-span-1">
                <BarListChart
                  title="Top 10 cities"
                  data={s.top_cities.map((x) => ({ label: x.city, value: x.count }))}
                  unit={noun}
                  labelHeader="City"
                />
              </Card>
            </div>
          )
          const platforms = (
            <Panel title={`${noun} by platform`}>
              <MeterList rows={c.platforms} whole={s.kpis.total} unit={noun} />
            </Panel>
          )
          const recent = (
            <Panel title="Recently onboarded">
              <RecentlyOnboardedTable rows={s.recently_onboarded} />
            </Panel>
          )

          if (!crm) {
            // Brand Specialist: onboarded numbers only (the server sends nothing else).
            return (
              <>
                <section aria-label="Key numbers" className="grid grid-cols-2 gap-space-md sm:max-w-md">
                  <Kpi label="Onboarded creators" value={s.kpis.total} to="/influencers" />
                  <Kpi label="Onboarded this month" value={s.kpis.onboarded_this_month} />
                </section>
                <div className="grid gap-space-lg lg:grid-cols-2">
                  {onboardedWeeks}
                  {platforms}
                </div>
                {breakdowns}
                {recent}
              </>
            )
          }

          return (
            <>
              <section aria-label="Key numbers" className="grid grid-cols-2 gap-space-md sm:grid-cols-3 xl:grid-cols-7">
                <Kpi label={me?.role === 'executive' ? 'My influencers' : 'Total influencers'} value={s.kpis.total} to="/influencers" />
                <Kpi
                  label="Unassigned Pool"
                  value={s.kpis.pool}
                  to="/pool"
                  hint={s.kpis.claimed_this_week === null ? undefined : `${formatNumber(s.kpis.claimed_this_week)} claimed this week`}
                />
                <Kpi label="Contacted this week" value={s.kpis.contacted_this_week} hint="Moved to Contacted since Monday" />
                <Kpi label="Onboarded this month" value={s.kpis.onboarded_this_month} />
                <Kpi label="Welcome Kits in transit" value={s.kpis.packages_in_transit} to="/packages?status=sent&status=in_transit" />
                <Kpi label="Follow-ups today" value={s.kpis.follow_ups_today} to="/calls" />
                <Kpi
                  label="Onboarded without agreement"
                  value={s.kpis.onboarded_without_agreement}
                  to={`/influencers?${ONBOARDED_OR_LATER.map((st) => `stage=${st}`).join('&')}&agreement=missing`}
                  hint="Onboarded or later, no agreement on file"
                />
              </section>

              <div className="grid gap-space-lg lg:grid-cols-2">
                {onboardedWeeks}
                <Panel title="Calls per day · last 30 days">
                  <AreaTrendChart data={c.days} unit="Calls" labelHeader="Day" />
                </Panel>
              </div>

              <div className="grid gap-space-lg lg:grid-cols-2">
                <Panel title="Pipeline" icon={Filter} description="Click a stage to see its influencers">
                  <PipelineFunnel funnel={s.funnel} />
                </Panel>
                <Panel title="My follow-ups" icon={PhoneCall} action={<span className="shrink-0 pt-0.5 text-small text-muted-foreground">Today &amp; overdue</span>}>
                  <MyFollowUps items={s.my_follow_ups} />
                </Panel>
              </div>

              <div className="grid gap-space-lg md:grid-cols-2 xl:grid-cols-3">
                <Panel title="Welcome Kits by status">
                  <SegmentedBar parts={c.kits} unit="Welcome Kits" labelHeader="Status" />
                </Panel>
                <Panel title="Call outcomes · last 30 days">
                  <SegmentedBar parts={c.outcomes} unit="Calls" labelHeader="Outcome" />
                </Panel>
                <div className="md:col-span-2 xl:col-span-1">{platforms}</div>
              </div>

              {breakdowns}

              {s.team && (
                <Panel title="Team performance">
                  <TeamPerformanceTable rows={s.team} />
                </Panel>
              )}

              {recent}

              <Panel title="Recent activity" icon={History} description="Latest updates to influencers">
                <RecentActivity items={s.recent_activity} />
              </Panel>
            </>
          )
        })()
      )}
    </div>
  )
}
