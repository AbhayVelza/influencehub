import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, CircleAlert, ExternalLink, Heart, Info, Layers, Link2, Loader2, Mail, MessageCircle, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { PlatformMark } from '@/components/common/platform-badge'
import { SyncStatusBadge } from '@/components/common/sync-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileLookup } from '@/hooks/use-integrations'
import { useCan } from '@/hooks/use-me'
import { copyToClipboard } from '@/lib/clipboard'
import { RelativeTime } from '@/components/common/relative-time'
import { formatCompact, formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { isSessionChanged, waitForJob } from '@/lib/jobs'
import { audienceOf, exactMetric, formatMetric, metricValue, PLATFORM_META, SYNC_METHOD_LABEL, totalReach, type MetricDef } from '@/lib/platforms'
import { cn } from '@/lib/utils'
import { accountsApi, getErrorMessage } from '@/services'
import type { ConnectStatus, Influencer, Platform, SocialAccount, SyncResult } from '@/types'
import { invalidateInfluencer, useAccountMedia, useAccountsMedia, useAccountSnapshots } from '../detail-queries'
import { AddAccountDialog } from './add-account-dialog'
import { EditStatsDialog } from './edit-stats-dialog'
import { GrowthChart } from './growth-chart'

function Notice({ tone, title, children }: { tone: 'info' | 'error'; title: string; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : Info
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'flex gap-2.5 rounded-xl bg-error-container/50 p-3 text-small'
          : 'flex gap-2.5 rounded-xl bg-tertiary-fixed/30 p-3 text-small'
      }
    >
      <Icon strokeWidth={1.75} className={tone === 'error' ? 'mt-0.5 size-4 shrink-0 text-error' : 'mt-0.5 size-4 shrink-0 text-on-tertiary-container'} />
      <div className="space-y-1">
        <p className="font-semibold text-primary">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

const isNumeric = (def: MetricDef) => def.format === 'count' || def.format === 'percent'

/** The platform's own number stats, with the platform's own labels. */
function StatCards({ account }: { account: SocialAccount }) {
  const defs = PLATFORM_META[account.platform].metrics.filter(isNumeric)
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      {defs.map((def) => {
        const value = metricValue(account, def.key)
        return (
          <div key={def.key} className="flex min-w-0 flex-col-reverse gap-0.5">
            <dd className="truncate text-h3 font-semibold tracking-tight text-primary tabular-nums" title={exactMetric(def, value)}>
              {formatMetric(def, value)}
            </dd>
            <dt className="text-small tracking-wider text-muted-foreground uppercase">{def.label}</dt>
          </div>
        )
      })}
    </dl>
  )
}

/** Descriptive stats (account type, channel country, page category). */
function DetailStats({ account }: { account: SocialAccount }) {
  const defs = PLATFORM_META[account.platform].metrics.filter((d) => !isNumeric(d))
  if (defs.length === 0) return null
  return (
    <dl className="grid gap-3">
      {defs.map((def) => (
        <div key={def.key} className="flex flex-col-reverse gap-0.5">
          <dd className="text-body text-on-surface">{formatMetric(def, metricValue(account, def.key))}</dd>
          <dt className="text-small tracking-wider text-muted-foreground uppercase">{def.label}</dt>
        </div>
      ))}
    </dl>
  )
}

function RecentPosts({ influencerId, account }: { influencerId: string; account: SocialAccount }) {
  const media = useAccountMedia(influencerId, account.id, true)
  if (media.isPending) {
    return (
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (media.isError) return <p className="text-small text-muted-foreground">Couldn’t load recent posts.</p>
  if (media.data.items.length === 0) return <p className="text-small text-muted-foreground">No recent posts.</p>
  return (
    <ul className="grid grid-cols-3 gap-2 md:grid-cols-6">
      {media.data.items.slice(0, 6).map((post) => (
        <li key={post.permalink}>
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="group relative block aspect-square overflow-hidden rounded-xl bg-surface-container-low shadow-sm"
            title={`Posted ${formatDate(post.posted_at)}`}
          >
            {post.thumbnail ? (
              <img
                src={post.thumbnail}
                alt={`Post from ${formatDate(post.posted_at)}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <span className="flex size-full items-center justify-center p-2 text-center text-small text-muted-foreground">
                Post from {formatDate(post.posted_at)}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-small font-medium text-white">
              <span className="inline-flex items-center gap-0.5" title={post.likes === null ? 'Likes hidden' : undefined}>
                <Heart className="size-3" />
                {post.likes === null ? '–' : formatCompact(post.likes)}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <MessageCircle className="size-3" />
                {post.comments === null ? '–' : formatCompact(post.comments)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

const CONNECT_LABEL: Record<ConnectStatus, { label: string; dot: string }> = {
  not_connected: { label: 'Not connected', dot: 'bg-gray-400' },
  link_sent: { label: 'Link sent', dot: 'bg-amber-500' },
  connected: { label: 'Connected', dot: 'bg-green-500' },
  expired: { label: 'Link expired', dot: 'bg-red-500' },
}

function ConnectStatusBadge({ account }: { account: SocialAccount }) {
  const status = account.connect_status ?? 'not_connected'
  const meta = CONNECT_LABEL[status]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low/80 px-2 py-0.5 text-small font-medium whitespace-nowrap text-muted-foreground">
      <span aria-hidden className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
      {status === 'link_sent' && account.connect_link_expires_at && (
        <span> · expires <RelativeTime iso={account.connect_link_expires_at} /></span>
      )}
    </span>
  )
}

/** Connect-method accounts: send the creator a link to authorise us (copy it, or email it to them). */
function ConnectLinkButton({ influencer, account }: { influencer: Influencer; account: SocialAccount }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const resend = account.connect_status === 'link_sent' || account.connect_status === 'expired'

  const send = async (email: boolean) => {
    setBusy(true)
    try {
      const res = await accountsApi.connectLink(account.id, { send_email: email })
      if (email) toast.success('Connect link emailed', { description: `Sent to ${res.emailed_to}. It expires ${formatRelative(res.expires_at)} (${formatDateTime(res.expires_at)}).` })
      else await copyToClipboard(res.url, 'Connect link copied')
    } catch (err) {
      toast.error('Couldn’t create the connect link', { description: getErrorMessage(err) })
    } finally {
      setBusy(false)
      void invalidateInfluencer(queryClient, influencer.id)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
          {resend ? 'Resend connect link' : 'Send connect link'}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => void send(false)}>
          <Link2 />
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!influencer.email} onSelect={() => void send(true)}>
          <Mail />
          <span className="truncate">{influencer.email ? `Email to ${influencer.email}` : 'Email (no address on file)'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountView({ influencer, account }: { influencer: Influencer; account: SocialAccount }) {
  const queryClient = useQueryClient()
  const canEdit = useCan('influencer:edit')
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const meta = PLATFORM_META[account.platform]
  const syncable = account.sync_method === 'lookup' || account.connect_status === 'connected'
  const hasData = meta.metrics.some((m) => metricValue(account, m.key) !== null)
  const tracked = account.last_synced_at !== null && account.sync_method !== 'manual'
  const snapshots = useAccountSnapshots(influencer.id, account.id, tracked)
  const lookup = useProfileLookup()
  const canAutoSync = account.sync_method === 'manual' && lookup.includes(account.platform)
  const [switching, setSwitching] = useState(false)

  /** A typed-in account hands over to auto-sync: the server fetches it in the background. */
  const switchToAutoSync = async () => {
    setSwitching(true)
    try {
      await accountsApi.update(account.id, { sync_method: 'lookup' })
      toast.success(`${meta.label} auto-sync on`, { description: 'Its stats update within the next hour or so.' })
    } catch (err) {
      if (!isSessionChanged(err)) toast.error('Couldn’t switch to auto-sync', { description: getErrorMessage(err) })
    } finally {
      setSwitching(false)
      void invalidateInfluencer(queryClient, influencer.id)
      void queryClient.invalidateQueries({ queryKey: ['influencers', 'detail', influencer.id] })
    }
  }

  /** POST /accounts/{id}/sync → poll GET /jobs/{id} every 2 s → refresh however the job ends. */
  const sync = async () => {
    setSyncing(true)
    setProgress(0)
    try {
      const { job_id } = await accountsApi.sync(account.id)
      void queryClient.invalidateQueries({ queryKey: ['influencers', 'detail', influencer.id] })
      const job = await waitForJob<SyncResult>(job_id, (j) => setProgress(j.progress))
      if (job.status === 'succeeded') {
        setLastError(null)
        toast.success(`Synced from ${meta.label}`)
      } else {
        const message = job.error?.message ?? 'Sync failed'
        setLastError(message)
        toast.error(`${meta.label} sync failed`, { description: message })
      }
    } catch (err) {
      if (isSessionChanged(err)) return
      toast.error(`Couldn’t sync from ${meta.label}`, { description: getErrorMessage(err) })
    } finally {
      setSyncing(false)
      void invalidateInfluencer(queryClient, influencer.id)
      void queryClient.invalidateQueries({ queryKey: ['influencers', 'detail', influencer.id] })
    }
  }

  return (
    <>
      <div className="min-w-0 space-y-4">
        <a href={account.profile_url} target="_blank" rel="noreferrer" className="block truncate text-small text-on-tertiary-container hover:underline">
          {meta.label} · @{account.handle}
          {account.is_primary && ' · Primary'}
        </a>
      <div className="space-y-2 rounded-xl bg-surface-container-low/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-small">
          <span className="text-small tracking-wider text-muted-foreground uppercase">{SYNC_METHOD_LABEL[account.sync_method]}</span>
          {account.sync_method === 'connect' ? (
            <ConnectStatusBadge account={account} />
          ) : account.sync_method === 'lookup' ? (
            <span title={formatDateTime(account.last_synced_at)}>
              <SyncStatusBadge status={syncing ? 'pending' : account.sync_status} />
              {!syncing && account.sync_status === 'synced' && account.last_synced_at && (
                <span className="text-muted-foreground"> · <RelativeTime iso={account.last_synced_at} /></span>
              )}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {account.sync_method === 'connect' && account.connect_status !== 'connected' && canEdit && (
            <ConnectLinkButton influencer={influencer} account={account} />
          )}
          {syncable && (
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Sync now
            </Button>
          )}
          {canAutoSync && canEdit && (
            <Button variant="outline" size="sm" onClick={switchToAutoSync} disabled={switching}>
              {switching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Auto-sync
            </Button>
          )}
          {account.sync_method === 'manual' && canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit stats
            </Button>
          )}
        </div>
        {syncing && (
          <div className="space-y-1" aria-live="polite">
            <Progress value={progress} aria-label="Sync progress" />
            <p className="text-small text-muted-foreground">
              Syncing from {meta.label}… {progress}%
            </p>
          </div>
        )}
      </div>

      {account.sync_method === 'manual' && (
        <Notice tone="info" title="Entered manually">
          {canAutoSync
            ? `Its stats are typed in. Auto-sync fetches them from ${meta.label} instead${account.platform === 'instagram' ? ' (Business and Creator accounts only)' : ''}.`
            : account.platform === 'instagram' || account.platform === 'facebook'
              ? `A personal ${meta.label} profile, which can’t be looked up. Its stats are typed in.`
              : `${meta.label} doesn’t share stats with us, so they’re typed in.`}
        </Notice>
      )}
      {account.sync_method === 'connect' && account.connect_status !== 'connected' && (
        <Notice tone="info" title={account.connect_status === 'expired' ? 'The connect link expired' : 'Waiting for the creator to connect'}>
          {meta.label} only shares stats once the creator authorises InfluenceHub. Send them a connect link.
        </Notice>
      )}
      {account.sync_status === 'error' && (
        <Notice tone="error" title="Last sync failed">
          {lastError ?? `${meta.label} didn’t return data for @${account.handle}. Check the handle or try again.`}
          {account.last_synced_at && <p className="mt-1">
              Showing data from <RelativeTime iso={account.last_synced_at} />.
            </p>}
        </Notice>
      )}
      {account.sync_status === 'pending' && !hasData && (
        <p className="text-body text-muted-foreground">Waiting for the first sync. Stats appear once {meta.label} returns data.</p>
      )}

      <StatCards account={account} />
        <EditStatsDialog influencer={influencer} account={account} open={editing} onOpenChange={setEditing} />
      </div>

      <div className="min-w-0 space-y-4 border-t border-surface-container pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <DetailStats account={account} />
        {account.bio && (
          <p className="rounded-xl bg-surface-container-low/50 p-3 text-body whitespace-pre-wrap text-on-surface">{account.bio}</p>
        )}

      {tracked &&
        (snapshots.isPending ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : snapshots.isError ? (
          <p className="text-small text-muted-foreground">Couldn’t load the history.</p>
        ) : snapshots.data.items.length < 2 ? (
          <p className="text-small text-muted-foreground">
            {meta.audienceLabel} history builds up with each day’s sync; the chart appears after the second day.
          </p>
        ) : (
          <GrowthChart snapshots={snapshots.data.items} label={meta.audienceLabel} id={account.id} />
        ))}
        {!tracked && !account.bio && meta.metrics.every(isNumeric) && (
          <p className="text-small text-muted-foreground">Bio and history appear once the account syncs.</p>
        )}
      </div>
    </>
  )
}

/** Instagram and YouTube accounts that sync show their latest posts in a full-width card. */
const hasPosts = (a: SocialAccount) =>
  (a.platform === 'instagram' || a.platform === 'youtube') && a.last_synced_at !== null && a.sync_method !== 'manual'

function RecentPostsCard({ influencerId, account }: { influencerId: string; account: SocialAccount }) {
  const label = account.platform === 'youtube' ? 'Recent videos' : 'Recent posts'
  return (
    <Card size="sm" aria-label={label}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-h3">
          {label} <span className="text-small font-normal text-muted-foreground">· @{account.handle}</span>
        </CardTitle>
        <a href={account.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-small text-on-tertiary-container hover:underline">
          View on {PLATFORM_META[account.platform].label}
          <ExternalLink className="size-3.5" />
        </a>
      </CardHeader>
      <CardContent>
        <RecentPosts influencerId={influencerId} account={account} />
      </CardContent>
    </Card>
  )
}

/** Platforms whose recent posts carry like counts. */
const LIKE_PLATFORMS: Platform[] = ['instagram', 'youtube']

/** All accounts together: total followers, and average likes per recent post across Instagram and YouTube. */
function OverallView({ influencer }: { influencer: Influencer }) {
  const accounts = influencer.accounts
  const likeAccounts = accounts.filter((a) => LIKE_PLATFORMS.includes(a.platform) && a.last_synced_at !== null && a.sync_method !== 'manual')
  const media = useAccountsMedia(influencer.id, likeAccounts.map((a) => a.id))
  const likesPending = media.some((m) => m.isPending)

  /** Likes summed over the account's recent posts that show them, and how many posts that is. */
  const likesOf = new Map(
    likeAccounts.map((a, i) => {
      const counts = (media[i]?.data?.items ?? []).map((p) => p.likes).filter((n): n is number => n !== null)
      return [a.id, { sum: counts.reduce((x, y) => x + y, 0), posts: counts.length }] as const
    }),
  )
  const all = [...likesOf.values()].reduce((t, l) => ({ sum: t.sum + l.sum, posts: t.posts + l.posts }), { sum: 0, posts: 0 })
  const avg = (l: { sum: number; posts: number } | undefined) => (l && l.posts ? Math.round(l.sum / l.posts) : null)
  const reach = totalReach(accounts)
  const combinedAvg = avg(all)

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2">
        <div className="flex flex-col-reverse rounded-xl bg-surface-container-low/70 px-3 py-2.5">
          <dd className="truncate text-h3 font-semibold tracking-tight text-primary tabular-nums">{reach === null ? '—' : formatCompact(reach)}</dd>
          <dt className="text-small tracking-wider text-muted-foreground uppercase">Total followers</dt>
        </div>
        <div className="flex flex-col-reverse rounded-xl bg-surface-container-low/70 px-3 py-2.5">
          <dd className="truncate text-h3 font-semibold tracking-tight text-primary tabular-nums">
            {likesPending ? <Skeleton className="h-7 w-14" /> : combinedAvg === null ? '—' : formatCompact(combinedAvg)}
          </dd>
          <dt className="text-small tracking-wider text-muted-foreground uppercase">Avg likes per post</dt>
        </div>
      </dl>

      <table className="w-full text-small">
        <thead>
          <tr className="text-left text-small tracking-wider text-muted-foreground uppercase">
            <th scope="col" className="pb-1.5 font-medium">Account</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Followers</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Avg likes</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const audience = audienceOf(a)
            const likes = avg(likesOf.get(a.id))
            return (
              <tr key={a.id} className="border-t border-surface-container">
                <td className="max-w-0 py-1.5 pr-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlatformMark platform={a.platform} />
                    <span className="truncate">@{a.handle}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{audience === null ? '—' : formatCompact(audience)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {likesOf.has(a.id) && likesPending ? '…' : likes === null ? '—' : formatCompact(likes)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="text-small text-muted-foreground">
        Avg likes counts the recent posts and videos each sync fetches from Instagram and YouTube; posts with hidden likes are left out. Facebook page likes and other platforms aren’t included.
      </p>
    </div>
  )
}

const OVERALL = 'overall'

/** One tab per social account (a vertical list, which suits the narrow column), each with its own platform's stats,
 *  and an Overall tab above them when there are two or more accounts. */
export function SocialAccountsPanel({ influencer }: { influencer: Influencer }) {
  const canEdit = useCan('influencer:edit')
  const [tab, setTab] = useState<string | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const accounts = influencer.accounts
  const showOverall = accounts.length >= 2
  const tabIds = [...(showOverall ? [OVERALL] : []), ...accounts.map((a) => a.id)]
  const activeId = tab && tabIds.includes(tab) ? tab : tabIds[0]
  const active = accounts.find((a) => a.id === activeId)

  // Arrow keys move between tabs, like any tab list.
  const onKeyDown = (event: KeyboardEvent) => {
    const index = tabIds.findIndex((id) => id === activeId)
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = tabIds[(index + step + tabIds.length) % tabIds.length]!
    setTab(next)
    document.getElementById(`account-tab-${next}`)?.focus()
  }

  // Recent posts: the selected account's, or on Overall the first account that has some.
  const postsAccount = active ? (hasPosts(active) ? active : undefined) : accounts.find(hasPosts)

  return (
    <div className="space-y-gutter">
    <Card size="sm" aria-labelledby="accounts-panel-title">
      <CardContent className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id="accounts-panel-title" className="text-small tracking-wider text-muted-foreground uppercase">
            Social accounts
          </h3>
          {canEdit && (
            <Button variant="link" size="sm" className="h-auto px-1 text-on-tertiary-container" onClick={() => setAdding(true)}>
              <Plus />
              Add account
            </Button>
          )}
        </div>
        <div role="tablist" aria-label="Social accounts" aria-orientation="vertical" className="space-y-0.5 rounded-xl bg-surface-container-low/50 p-1" onKeyDown={onKeyDown}>
          {showOverall && (
            <button
              id={`account-tab-${OVERALL}`}
              type="button"
              role="tab"
              aria-selected={activeId === OVERALL}
              aria-controls={`account-panel-${OVERALL}`}
              tabIndex={activeId === OVERALL ? 0 : -1}
              onClick={() => setTab(OVERALL)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg py-2 pr-9 pl-2.5 text-left text-body transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                activeId === OVERALL
                  ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm dark:bg-surface-container-highest'
                  : 'text-muted-foreground hover:bg-surface-container-lowest/60 hover:text-on-surface',
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-container-low">
                <Layers className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">Overall</span>
              <span className="shrink-0 tabular-nums text-small">{formatCompact(totalReach(accounts))}</span>
            </button>
          )}
          {accounts.map((a) => {
            const selected = a.id === activeId
            const audience = audienceOf(a)
            return (
              <div
                key={a.id}
                className={cn(
                  'flex items-center rounded-lg transition-colors duration-150',
                  selected
                    ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm dark:bg-surface-container-highest'
                    : 'text-muted-foreground hover:bg-surface-container-lowest/60 hover:text-on-surface',
                )}
              >
                <button
                  id={`account-tab-${a.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`account-panel-${a.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(a.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-2.5 text-left text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <PlatformMark platform={a.platform} />
                  <span className="min-w-0 flex-1 truncate">@{a.handle}</span>
                  <span className={cn('shrink-0 tabular-nums text-small', selected ? 'text-primary' : 'text-muted-foreground')}>{audience === null ? '—' : formatCompact(audience)}</span>
                </button>
                <a
                  href={a.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open @${a.handle} on ${PLATFORM_META[a.platform].label}`}
                  title={`Open on ${PLATFORM_META[a.platform].label}`}
                  className="mx-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-surface-container-low hover:text-on-tertiary-container focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            )
          })}
        </div>
        </div>
        {activeId === OVERALL && (
          <div role="tabpanel" id={`account-panel-${OVERALL}`} aria-labelledby={`account-tab-${OVERALL}`} className="min-w-0 border-t border-surface-container pt-4 lg:col-span-2 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <OverallView influencer={influencer} />
          </div>
        )}
        {active && (
          <div role="tabpanel" id={`account-panel-${active.id}`} aria-labelledby={`account-tab-${active.id}`} className="grid min-w-0 gap-6 border-t border-surface-container pt-4 lg:col-span-2 lg:grid-cols-2 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <AccountView key={active.id} influencer={influencer} account={active} />
          </div>
        )}
        {accounts.length === 0 && <p className="text-body text-muted-foreground lg:col-span-2">No social accounts yet.</p>}
      </CardContent>
      <AddAccountDialog influencer={influencer} open={adding} onOpenChange={setAdding} onAdded={(id) => setTab(id)} />
    </Card>
    {postsAccount && <RecentPostsCard key={postsAccount.id} influencerId={influencer.id} account={postsAccount} />}
    </div>
  )
}
