import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CircleAlert, ExternalLink, Heart, Info, Loader2, MessageCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SyncStatusBadge } from '@/components/common/sync-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ACCOUNT_TYPE_LABEL } from '@/lib/constants'
import { formatCompact, formatDate, formatDateTime, formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { waitForJob } from '@/lib/jobs'
import { queryKeys } from '@/lib/query'
import { influencersApi, getErrorMessage } from '@/services'
import type { Influencer, SyncResult } from '@/types'
import { invalidateInfluencer, useMedia, useSnapshots } from '../detail-queries'
import { GrowthChart } from './growth-chart'

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <div className="text-base font-semibold tabular-nums" title={title}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function Notice({ tone, title, children }: { tone: 'info' | 'error'; title: string; children: React.ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : Info
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm'
          : 'flex gap-2 rounded-md border bg-muted/40 p-3 text-sm'
      }
    >
      <Icon className={tone === 'error' ? 'mt-0.5 size-4 shrink-0 text-destructive' : 'mt-0.5 size-4 shrink-0 text-muted-foreground'} />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

function RecentPosts({ influencer }: { influencer: Influencer }) {
  const media = useMedia(influencer.id, true)
  if (media.isPending) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    )
  }
  if (media.isError) return <p className="text-xs text-muted-foreground">Couldn’t load recent posts.</p>
  if (media.data.items.length === 0) return <p className="text-xs text-muted-foreground">No recent posts.</p>
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {media.data.items.slice(0, 6).map((post) => (
        <li key={post.permalink}>
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="group relative block aspect-square overflow-hidden rounded-md bg-muted"
            title={`Posted ${formatDate(post.posted_at)}`}
          >
            <img
              src={post.thumbnail}
              alt={`Post from ${formatDate(post.posted_at)}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover transition-transform group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-[10px] font-medium text-white">
              <span className="inline-flex items-center gap-0.5">
                <Heart className="size-2.5" />
                {formatCompact(post.likes)}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <MessageCircle className="size-2.5" />
                {formatCompact(post.comments)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function InstagramData({ influencer }: { influencer: Influencer }) {
  const snapshots = useSnapshots(influencer.id, true)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Followers" value={formatCompact(influencer.followers)} title={formatNumber(influencer.followers)} />
        <Stat label="Following" value={formatCompact(influencer.following)} title={formatNumber(influencer.following)} />
        <Stat label="Posts" value={formatCompact(influencer.posts_count)} title={formatNumber(influencer.posts_count)} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Engagement rate</dt>
        <dd className="text-right font-medium tabular-nums">{formatPercent(influencer.engagement_rate, 2)}</dd>
        <dt className="text-muted-foreground">Account type</dt>
        <dd className="flex items-center justify-end gap-1">
          {ACCOUNT_TYPE_LABEL[influencer.account_type]}
          {influencer.is_verified && <BadgeCheck className="size-4 text-sky-500" aria-label="Verified" />}
        </dd>
      </dl>
      {influencer.bio && <p className="text-sm whitespace-pre-wrap">{influencer.bio}</p>}
      {snapshots.isPending ? (
        <Skeleton className="h-36 w-full" />
      ) : snapshots.isError ? (
        <p className="text-xs text-muted-foreground">Couldn’t load follower history.</p>
      ) : (
        <GrowthChart snapshots={snapshots.data.items} />
      )}
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">Recent posts</h4>
        <RecentPosts influencer={influencer} />
      </section>
    </div>
  )
}

/** Instagram data with its four sync states: synced, pending, error and not synced (personal account). */
export function InstagramPanel({ influencer }: { influencer: Influencer }) {
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const status = influencer.ig_sync_status
  const hasData = influencer.followers != null && status !== 'not_synced'

  const refresh = () => {
    const id = influencer.id
    void invalidateInfluencer(queryClient, id)
    void queryClient.invalidateQueries({ queryKey: queryKeys.influencerSnapshots(id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.influencerMedia(id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.influencerActivity(id) })
  }

  /** POST /sync → poll GET /jobs/{id} every 2 s → refresh the panel however the job ends. */
  const sync = async () => {
    setSyncing(true)
    setProgress(0)
    try {
      const { job_id } = await influencersApi.sync(influencer.id)
      // The API flips the status to "pending" straight away.
      void queryClient.invalidateQueries({ queryKey: queryKeys.influencer(influencer.id) })
      const job = await waitForJob<SyncResult>(job_id, (j) => setProgress(j.progress))
      if (job.status === 'succeeded') {
        setLastError(null)
        toast.success('Synced from Instagram')
      } else {
        const message = job.error?.message ?? 'Sync failed'
        setLastError(message)
        toast.error('Instagram sync failed', { description: message })
      }
    } catch (err) {
      toast.error('Couldn’t sync from Instagram', { description: getErrorMessage(err) })
    } finally {
      setSyncing(false)
      refresh()
    }
  }

  return (
    <Card size="sm" aria-labelledby="ig-panel-title">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle id="ig-panel-title" className="text-sm">
            Instagram
          </CardTitle>
          <a
            href={influencer.profile_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            @{influencer.instagram_handle}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs" title={formatDateTime(influencer.last_synced_at)}>
            <SyncStatusBadge status={syncing ? 'pending' : status} />
            {!syncing && status === 'synced' && influencer.last_synced_at && (
              <span className="text-muted-foreground"> · {formatRelative(influencer.last_synced_at)}</span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {status === 'not_synced' ? 'Check again' : 'Sync now'}
          </Button>
        </div>
        {syncing && (
          <div className="space-y-1" aria-live="polite">
            <Progress value={progress} aria-label="Sync progress" />
            <p className="text-xs text-muted-foreground">
              Syncing from Instagram… {progress}%
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {status === 'not_synced' && (
          <Notice tone="info" title="Personal account · not synced">
            Instagram only shares data for Business and Creator accounts, so details here are entered manually.
            {influencer.followers != null && (
              <p className="mt-2 text-foreground">
                Followers (manual): <span className="font-medium tabular-nums">{formatCompact(influencer.followers)}</span>
              </p>
            )}
          </Notice>
        )}

        {status === 'error' && (
          <Notice tone="error" title="Last sync failed">
            {lastError ?? `Instagram didn’t return data for @${influencer.instagram_handle}. Check the handle or try again.`}
            {influencer.last_synced_at && (
              <p className="mt-1">Showing data from {formatRelative(influencer.last_synced_at)}.</p>
            )}
          </Notice>
        )}

        {status === 'pending' && !hasData && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Waiting for the first sync. Stats, growth and recent posts appear once Instagram returns data.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
            <Skeleton className="h-28 w-full" />
          </div>
        )}

        {hasData && <InstagramData influencer={influencer} />}
      </CardContent>
    </Card>
  )
}
