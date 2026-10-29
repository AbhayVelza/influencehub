import { Combine, CopyCheck, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel, PlatformMarks } from '@/components/common/platform-badge'
import { StageBadge } from '@/components/common/stage-badge'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfidenceBadge } from '@/features/duplicates/duplicate-warning'
import { MergeDialog } from '@/features/duplicates/merge-dialog'
import { useDismissDuplicate, useDuplicatePairs } from '@/features/duplicates/queries'
import { useTeamMap } from '@/hooks/use-team'
import { formatCompact, formatLocation, formatNumber, formatRelative } from '@/lib/format'
import { primaryAccount, toRef } from '@/lib/platforms'
import { getErrorMessage } from '@/services'
import type { DuplicatePair, Influencer } from '@/types'

function Side({ influencer }: { influencer: Influencer }) {
  const team = useTeamMap()
  const primary = primaryAccount(influencer)
  const rows: [string, ReactNode][] = [
    ['Primary account', <AccountLabel key="p" account={primary && toRef(primary)} link />],
    ['Platforms', <PlatformMarks key="pl" platforms={influencer.accounts.map((a) => a.platform)} />],
    ['Total reach', influencer.total_reach == null ? '—' : <span key="r" title={formatNumber(influencer.total_reach)}>{formatCompact(influencer.total_reach)}</span>],
    ['Email', influencer.email ?? '—'],
    ['Phone', influencer.phone ?? '—'],
    ['Location', formatLocation([influencer.city, influencer.state, influencer.country])],
    ['Stage', <StageBadge key="s" stage={influencer.stage} />],
    ['Owner', influencer.assigned_to ? (team.get(influencer.assigned_to)?.name ?? '…') : 'Unassigned'],
    ['Added', formatRelative(influencer.created_at)],
  ]
  return (
    <div className="min-w-0 space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={influencer.name} src={influencer.profile_pic_url} />
        <Link to={`/influencers/${influencer.id}`} className="truncate font-medium hover:underline">
          {influencer.name}
        </Link>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate">{value}</dd>
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
    <article aria-label={`${a.name} and ${b.name}`} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <ConfidenceBadge confidence={pair.confidence} />
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
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
      <div className="grid gap-3 md:grid-cols-2">
        <Side influencer={a} />
        <Side influencer={b} />
      </div>
      {merging && <MergeDialog pair={pair} open={merging} onOpenChange={setMerging} />}
    </article>
  )
}

export default function DuplicatesPage() {
  const pairs = useDuplicatePairs()
  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={
          <>
            Possible duplicates{' '}
            {pairs.data && <span className="font-normal text-muted-foreground tabular-nums">({formatNumber(pairs.data.total)})</span>}
          </>
        }
        description="Creators that may be the same person across platforms. Merge them, or dismiss a pair that isn’t."
      />
      {pairs.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading duplicates">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : pairs.isError ? (
        <ErrorState title="Couldn’t load possible duplicates" error={pairs.error} onRetry={() => pairs.refetch()} />
      ) : pairs.data.items.length === 0 ? (
        <EmptyState icon={CopyCheck} title="No possible duplicates" description="New matches show up here as creators are added." />
      ) : (
        <div className="space-y-3">
          {pairs.data.items.map((pair) => (
            <PairCard key={pair.id} pair={pair} />
          ))}
        </div>
      )}
    </div>
  )
}
