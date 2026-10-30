import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, CircleAlert, Heart, Info, Link2, Loader2, Mail, MessageCircle, Pencil, Plus, RefreshCw } from 'lucide-react'
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
import { useCan } from '@/hooks/use-me'
import { copyToClipboard } from '@/lib/clipboard'
import { RelativeTime } from '@/components/common/relative-time'
import { formatCompact, formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { waitForJob } from '@/lib/jobs'
import { audienceOf, exactMetric, formatMetric, metricValue, PLATFORM_META, SYNC_METHOD_LABEL } from '@/lib/platforms'
import { cn } from '@/lib/utils'
import { accountsApi, getErrorMessage } from '@/services'
import type { ConnectStatus, Influencer, SocialAccount, SyncResult } from '@/types'
import { invalidateInfluencer, useAccountMedia, useAccountSnapshots } from '../detail-queries'
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

/** The platform's own stats, with the platform's own labels. */
function StatCards({ account }: { account: SocialAccount }) {
  const defs = PLATFORM_META[account.platform].metrics
  return (
    <dl className="grid grid-cols-2 gap-1.5">
      {defs.map((def) => {
        const value = metricValue(account, def.key)
        return (
          <div key={def.key} className="rounded-md bg-muted/50 px-2 py-1.5">
            <dd className="truncate text-base font-semibold tabular-nums" title={exactMetric(def, value)}>
              {formatMetric(def, value)}
            </dd>
            <dt className="text-xs text-muted-foreground">{def.label}</dt>
          </div>
        )
      })}
    </dl>
  )
}

function RecentPosts({ influencerId, account }: { influencerId: string; account: SocialAccount }) {
  const media = useAccountMedia(influencerId, account.id, true)
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
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
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
      toast.error(`Couldn’t sync from ${meta.label}`, { description: getErrorMessage(err) })
    } finally {
      setSyncing(false)
      void invalidateInfluencer(queryClient, influencer.id)
      void queryClient.invalidateQueries({ queryKey: ['influencers', 'detail', influencer.id] })
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{SYNC_METHOD_LABEL[account.sync_method]}</span>
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
            <p className="text-xs text-muted-foreground">
              Syncing from {meta.label}… {progress}%
            </p>
          </div>
        )}
      </div>

      {account.sync_method === 'manual' && (
        <Notice tone="info" title="Entered manually">
          {account.platform === 'instagram' || account.platform === 'facebook'
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
        <p className="text-sm text-muted-foreground">Waiting for the first sync. Stats appear once {meta.label} returns data.</p>
      )}

      <StatCards account={account} />
      {account.bio && <p className="text-sm whitespace-pre-wrap">{account.bio}</p>}

      {tracked &&
        (snapshots.isPending ? (
          <Skeleton className="h-36 w-full" />
        ) : snapshots.isError ? (
          <p className="text-xs text-muted-foreground">Couldn’t load the history.</p>
        ) : (
          <GrowthChart snapshots={snapshots.data.items} label={meta.audienceLabel} id={account.id} />
        ))}

      {tracked && (account.platform === 'instagram' || account.platform === 'youtube') && (
        <section className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">{account.platform === 'youtube' ? 'Recent videos' : 'Recent posts'}</h4>
          <RecentPosts influencerId={influencer.id} account={account} />
        </section>
      )}

      <EditStatsDialog influencer={influencer} account={account} open={editing} onOpenChange={setEditing} />
    </div>
  )
}

/** One tab per social account (a vertical list, which suits the narrow column), each with its own platform's stats. */
export function SocialAccountsPanel({ influencer }: { influencer: Influencer }) {
  const canEdit = useCan('influencer:edit')
  const [tab, setTab] = useState<string | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const accounts = influencer.accounts
  const activeId = accounts.some((a) => a.id === tab) ? tab! : accounts[0]?.id
  const active = accounts.find((a) => a.id === activeId)

  // Arrow keys move between accounts, like any tab list.
  const onKeyDown = (event: KeyboardEvent) => {
    const index = accounts.findIndex((a) => a.id === activeId)
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = accounts[(index + step + accounts.length) % accounts.length]!
    setTab(next.id)
    document.getElementById(`account-tab-${next.id}`)?.focus()
  }

  return (
    <Card size="sm" aria-labelledby="accounts-panel-title">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle id="accounts-panel-title" className="text-sm">
          Social accounts
        </CardTitle>
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add account
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="tablist" aria-label="Social accounts" aria-orientation="vertical" className="space-y-1" onKeyDown={onKeyDown}>
          {accounts.map((a) => {
            const selected = a.id === activeId
            const audience = audienceOf(a)
            return (
              <button
                key={a.id}
                id={`account-tab-${a.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`account-panel-${a.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(a.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected ? 'bg-muted font-medium' : 'hover:bg-muted/50',
                )}
              >
                <PlatformMark platform={a.platform} />
                <span className="min-w-0 flex-1 truncate">@{a.handle}</span>
                <span className={cn('shrink-0 text-xs tabular-nums', selected ? 'text-foreground' : 'text-muted-foreground')}>{audience === null ? '—' : formatCompact(audience)}</span>
              </button>
            )
          })}
        </div>
        {active && (
          <div role="tabpanel" id={`account-panel-${active.id}`} aria-labelledby={`account-tab-${active.id}`} className="space-y-3 border-t pt-3">
            <a
              href={active.profile_url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {PLATFORM_META[active.platform].label} · @{active.handle}
              {active.is_primary && ' · Primary'}
            </a>
            <AccountView key={active.id} influencer={influencer} account={active} />
          </div>
        )}
      </CardContent>
      <AddAccountDialog influencer={influencer} open={adding} onOpenChange={setAdding} onAdded={(id) => setTab(id)} />
    </Card>
  )
}
