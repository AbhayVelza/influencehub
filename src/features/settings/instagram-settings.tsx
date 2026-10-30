import { BadgeCheck, CircleAlert, Link2Off } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SYNC_INTERVAL_OPTIONS } from '@/lib/constants'
import { RelativeTime } from '@/components/common/relative-time'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { SyncIntervalHours, SyncRunStatus, TokenStatus } from '@/types'
import { useInstagramSettings, useUpdateInstagramSettings } from './queries'

const TOKEN: Record<TokenStatus, { label: string; className: string }> = {
  valid: { label: 'Valid', className: 'bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300' },
  expiring: { label: 'Expiring soon', className: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' },
  expired: { label: 'Expired', className: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300' },
}

const RUN: Record<SyncRunStatus, { label: string; className: string }> = {
  running: { label: 'Running', className: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300' },
  succeeded: { label: 'Succeeded', className: 'bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300' },
  partial: { label: 'Partial', className: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300' },
}

/** Meter: the fill carries severity; the track is a lighter step of the same ramp. */
function UsageMeter({ value }: { value: number }) {
  const level = value >= 90 ? 'critical' : value >= 70 ? 'warning' : 'normal'
  const fill = { normal: 'bg-[var(--chart-series-1)]', warning: 'bg-amber-500', critical: 'bg-red-500' }[level]
  const track = { normal: 'bg-blue-100 dark:bg-blue-950', warning: 'bg-amber-100 dark:bg-amber-950', critical: 'bg-red-100 dark:bg-red-950' }[level]
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium" id="usage-label">
          API usage
        </span>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{value}%</span>
          <span className="text-muted-foreground"> of the rate limit</span>
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby="usage-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value}% used${level === 'normal' ? '' : `, ${level}`}`}
        className={cn('h-2.5 overflow-hidden rounded-full', track)}
      >
        <div className={cn('h-full rounded-full', fill)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      {level !== 'normal' && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CircleAlert className="size-3.5" />
          {level === 'critical' ? 'Close to the limit — syncs may be rate limited.' : 'Usage is high.'}
        </p>
      )}
    </div>
  )
}

const minutes = (from: string, to: string | null) =>
  to ? `${Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60_000))} min` : '—'

export function InstagramSettings() {
  const settings = useInstagramSettings()
  const update = useUpdateInstagramSettings()

  if (settings.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (settings.isError) {
    return <ErrorState title="Couldn’t load Instagram settings" error={settings.error} onRetry={() => settings.refetch()} />
  }
  const s = settings.data

  const setInterval = (value: string) =>
    update.mutate(
      { sync_interval_hours: Number(value) as SyncIntervalHours },
      {
        onSuccess: (data) => toast.success(`Syncing every ${data.sync_interval_hours} hours`),
        onError: (err) => toast.error('Couldn’t change the sync interval', { description: getErrorMessage(err) }),
      },
    )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instagram integration</CardTitle>
          <CardDescription>Syncs followers, engagement and recent posts for Business and Creator accounts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Connection</dt>
            <dd className="flex items-center gap-1.5">
              {s.connected ? (
                <>
                  <BadgeCheck className="size-4 text-green-600 dark:text-green-400" />
                  Connected
                </>
              ) : (
                <>
                  <Link2Off className="size-4 text-destructive" />
                  Not connected
                </>
              )}
            </dd>
            <dt className="text-muted-foreground">Business account</dt>
            <dd>
              {s.business_account ? (
                <>
                  @{s.business_account.username}
                  <span className="block font-mono text-xs text-muted-foreground">ID {s.business_account.ig_user_id}</span>
                </>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-muted-foreground">Access token</dt>
            <dd>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TOKEN[s.token_status].className)}>
                {TOKEN[s.token_status].label}
              </span>
              {s.token_expires_at && (
                <span className="block text-xs text-muted-foreground">
                  {s.token_status === 'expired' ? 'Expired' : 'Expires'} <RelativeTime iso={s.token_expires_at} /> ({formatDate(s.token_expires_at)})
                </span>
              )}
            </dd>
          </dl>
          <div className="space-y-5">
            <div className="grid gap-1.5">
              <Label htmlFor="sync-interval">Sync frequency</Label>
              <Select value={String(s.sync_interval_hours)} onValueChange={setInterval} disabled={update.isPending}>
                <SelectTrigger id="sync-interval" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNC_INTERVAL_OPTIONS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      Every {h} hours
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <UsageMeter value={s.api_usage_pct} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last {s.last_runs.length} sync runs</CardTitle>
        </CardHeader>
        <CardContent>
          {s.last_runs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No sync runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started (IST)</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Synced</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.last_runs.map((run) => (
                  <TableRow key={run.started_at}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(run.started_at)}</TableCell>
                    <TableCell>{minutes(run.started_at, run.finished_at)}</TableCell>
                    <TableCell>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', RUN[run.status].className)}>{RUN[run.status].label}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(run.synced)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', run.failed > 0 && 'font-medium text-destructive')}>
                      {formatNumber(run.failed)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
