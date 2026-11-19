import { CircleCheck, Combine, Copy, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel, PlatformMarks } from '@/components/common/platform-badge'
import { StageBadge } from '@/components/common/stage-badge'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfidenceBadge } from '@/features/duplicates/duplicate-warning'
import { MergeDialog } from '@/features/duplicates/merge-dialog'
import { useDismissDuplicate, useDuplicatePairs } from '@/features/duplicates/queries'
import { useTeamMap } from '@/hooks/use-team'
import { RelativeTime } from '@/components/common/relative-time'
import { formatCompact, formatLocation, formatNumber } from '@/lib/format'
import { primaryAccount, toRef } from '@/lib/platforms'
import { getErrorMessage } from '@/services'
import type { DuplicatePair, Influencer } from '@/types'

function Side({ influencer }: { influencer: Influencer }) {
  const team = useTeamMap()
  const primary = primaryAccount(influencer)
  const rows: [string, ReactNode][] = [
    ['Primary account', <AccountLabel key="p" account={primary && toRef(primary)} link />],
    ['Platforms', <PlatformMarks key="pl" platforms={influencer.accounts.map((a) => a.platform)} />],
    ['Total followers', influencer.total_reach == null ? '—' : <span key="r" title={formatNumber(influencer.total_reach)}>{formatCompact(influencer.total_reach)}</span>],
    ['Email', influencer.email ?? '—'],
    ['Phone', influencer.phone ?? '—'],
    ['Location', formatLocation([influencer.city, influencer.state, influencer.country])],
    ['Stage', <StageBadge key="s" stage={influencer.stage} />],
    ['Owner', influencer.assigned_to ? (team.get(influencer.assigned_to)?.name ?? '…') : 'Unassigned'],
    ['Added', <RelativeTime key="a" iso={influencer.created_at} />],
  ]
  return (
    <div className="min-w-0 space-y-3 rounded-xl bg-surface-container-low/50 p-4">
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={influencer.name} src={influencer.profile_pic_url} className="size-9 shadow-sm" />
        <Link to={`/influencers/${influencer.id}`} className="truncate text-label-md font-semibold text-primary hover:underline">
          {influencer.name}
        </Link>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-on-surface">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function PairCard({ pair }: { pair: DuplicatePair }) {
  const dismiss = useDismissDuplicate()
  const [merging, setMerging] = useState(false)
  const [a, b] = pair.influencers
  return (
    <article
      aria-label={`${a.name} and ${b.name}`}
      className="space-y-space-md rounded-[20px] bg-surface-container-lowest/70 p-space-md shadow-glass backdrop-blur-2xl transition-shadow hover:shadow-glass-hover sm:p-space-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <ConfidenceBadge confidence={pair.confidence} />
          <ul className="list-disc space-y-0.5 pl-5 text-body-md text-muted-foreground marker:text-outline">
            {pair.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={dismiss.isPending}
            onClick={() =>
              dismiss.mutate(pair.id, {
                onSuccess: () => toast.success('Dismissed — they won’t be suggested again'),
                onError: (err) => toast.error('Couldn’t dismiss', { description: getErrorMessage(err) }),
              })
            }
          >
            <X />
            Dismiss
          </Button>
          <Button onClick={() => setMerging(true)}>
            <Combine />
            Merge…
          </Button>
        </div>
      </div>
      <div className="grid gap-space-sm md:grid-cols-2">
        <Side influencer={a} />
        <Side influencer={b} />
      </div>
      {merging && <MergeDialog pair={pair} open={merging} onOpenChange={setMerging} />}
    </article>
  )
}

/** The reference's empty canvas: a large glass card with the illustrated duplicate mark. */
function NoDuplicates() {
  return (
    <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden rounded-[20px] bg-surface-container-lowest/65 p-space-xl text-center shadow-glass backdrop-blur-2xl">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-surface-container-lowest to-transparent opacity-80" />
      <div className="group relative mb-space-lg">
        <div aria-hidden className="absolute inset-0 rounded-full bg-tertiary-fixed-dim/30 blur-2xl transition-transform duration-700 group-hover:scale-125" />
        <div className="relative flex size-24 items-center justify-center rounded-[24px] bg-surface-container-lowest/80 shadow-[0_16px_40px_rgba(14,26,36,0.06),0_2px_8px_rgba(14,26,36,0.04)] backdrop-blur-2xl transition-transform duration-300 group-hover:scale-105">
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[24px] bg-gradient-to-b from-white/90 via-white/20 to-transparent dark:from-white/10 dark:via-white/5" />
          <div aria-hidden className="relative flex items-center justify-center">
            <Copy className="size-9 text-primary transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1" strokeWidth={1.75} />
            <CircleCheck className="absolute -right-1 -bottom-1 size-5 rounded-full bg-surface-container-lowest text-on-tertiary-container drop-shadow-[0_2px_4px_rgba(0,142,190,0.3)]" strokeWidth={2.25} />
          </div>
        </div>
      </div>
      <h2 className="mb-space-xs text-headline-md font-semibold tracking-tight text-primary">No possible duplicates</h2>
      <p className="max-w-md text-body-md leading-relaxed text-muted-foreground">New matches show up here as creators are added.</p>
    </div>
  )
}

export default function DuplicatesPage() {
  const pairs = useDuplicatePairs()
  return (
    <div className="space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader
        title="Possible duplicates"
        count={
          pairs.data && (
            <>
              <span className="sr-only">(</span>
              {formatNumber(pairs.data.total)}
              <span className="sr-only">)</span>
            </>
          )
        }
        description="Creators that may be the same person across platforms. Merge them, or dismiss a pair that isn’t."
      />
      {pairs.isPending ? (
        <div className="space-y-space-md" aria-busy="true" aria-label="Loading duplicates">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-[20px]" />
          ))}
        </div>
      ) : pairs.isError ? (
        <div className="rounded-[20px] bg-surface-container-lowest/65 shadow-glass backdrop-blur-2xl">
          <ErrorState title="Couldn’t load possible duplicates" error={pairs.error} onRetry={() => pairs.refetch()} />
        </div>
      ) : pairs.data.items.length === 0 ? (
        <NoDuplicates />
      ) : (
        <div className="space-y-space-md">
          {pairs.data.items.map((pair) => (
            <PairCard key={pair.id} pair={pair} />
          ))}
        </div>
      )}
    </div>
  )
}
