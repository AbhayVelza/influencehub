import { Link } from 'react-router-dom'
import { PIPELINE_STAGES, SIDE_STAGES, STAGE_META } from '@/lib/constants'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Stage } from '@/types'

/** Stage counts as bars in the shared stage colours; each row opens the list filtered to that stage. */
export function PipelineFunnel({ funnel }: { funnel: { stage: Stage; count: number }[] }) {
  const counts = new Map(funnel.map((f) => [f.stage, f.count]))
  const max = Math.max(1, ...funnel.map((f) => f.count))
  const total = funnel.reduce((sum, f) => sum + f.count, 0)

  const row = (stage: Stage, secondary = false) => {
    const count = counts.get(stage) ?? 0
    return (
      <li key={stage}>
        <Link
          to={`/influencers?stage=${stage}`}
          className={cn(
            'group -mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-container-low/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:gap-4',
            secondary && 'opacity-85',
          )}
        >
          <span className="flex w-28 shrink-0 items-center gap-2 sm:w-36">
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STAGE_META[stage].dot)} />
            <span className={cn('truncate text-body font-medium', secondary ? 'text-muted-foreground' : 'text-on-surface')}>
              {STAGE_META[stage].label}
            </span>
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 overflow-hidden rounded-full',
              secondary ? 'h-2 bg-surface-container' : 'h-2.5 bg-surface-container-highest',
            )}
          >
            <span
              className={cn('block h-full rounded-full transition-[width] duration-500', STAGE_META[stage].dot, secondary && 'opacity-70')}
              style={{ width: `${(count / max) * 100}%`, minWidth: count ? 4 : 0 }}
            />
          </span>
          <span className={cn('w-20 shrink-0 text-right tabular-nums text-small', secondary ? 'text-muted-foreground' : 'text-primary')}>
            <span className={secondary ? 'font-medium' : 'font-semibold'}>{formatNumber(count)}</span>{' '}
            <span className="text-small text-muted-foreground">({total ? Math.round((count / total) * 100) : 0}%)</span>
            <span className="sr-only"> influencers — open the list filtered to this stage</span>
          </span>
        </Link>
      </li>
    )
  }

  return (
    <div>
      <ol className="space-y-1">{PIPELINE_STAGES.map((s) => row(s))}</ol>
      <div aria-hidden className="my-space-md h-px w-full bg-surface-container-highest" />
      <ul className="space-y-1">{SIDE_STAGES.map((s) => row(s, true))}</ul>
    </div>
  )
}
