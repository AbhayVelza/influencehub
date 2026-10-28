import { cn } from '@/lib/utils'
import { STAGE_META } from '@/lib/constants'
import type { Stage } from '@/types'

export function StageDot({ stage, className }: { stage: Stage; className?: string }) {
  return <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', STAGE_META[stage].dot, className)} />
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const meta = STAGE_META[stage]
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        meta.badge,
        className,
      )}
    >
      <StageDot stage={stage} />
      {meta.label}
    </span>
  )
}
