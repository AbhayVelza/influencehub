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
          className="group grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 rounded-md px-2 py-1 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className={cn('truncate text-sm', secondary && 'text-muted-foreground')}>{STAGE_META[stage].label}</span>
          <span className="h-5 rounded-sm bg-muted/60">
            <span
              className={cn('block h-full rounded-r-[4px] transition-[width]', STAGE_META[stage].dot, secondary && 'opacity-70')}
              style={{ width: `${(count / max) * 100}%`, minWidth: count ? 4 : 0 }}
            />
          </span>
          <span className="text-right text-sm tabular-nums">
            <span className="font-medium">{formatNumber(count)}</span>
            <span className="ml-1 text-xs text-muted-foreground">{total ? Math.round((count / total) * 100) : 0}%</span>
            <span className="sr-only"> influencers — open the list filtered to this stage</span>
          </span>
        </Link>
      </li>
    )
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-0.5">{PIPELINE_STAGES.map((s) => row(s))}</ol>
      <ul className="space-y-0.5 border-t pt-2">{SIDE_STAGES.map((s) => row(s, true))}</ul>
    </div>
  )
}
