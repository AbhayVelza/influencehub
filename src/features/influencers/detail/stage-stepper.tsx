import { Check } from 'lucide-react'
import { StageBadge } from '@/components/common/stage-badge'
import { PIPELINE_STAGES, STAGE_META } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Stage } from '@/types'

interface StageStepperProps {
  stage: Stage
  /** Furthest main-pipeline stage reached (for on hold / rejected: where it left off). */
  position: Stage | null
}

export function StageStepper({ stage, position }: StageStepperProps) {
  const reached = position ? PIPELINE_STAGES.indexOf(position) : -1
  const isSide = !PIPELINE_STAGES.includes(stage)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ol className="flex flex-1 items-center" aria-label="Pipeline progress">
        {PIPELINE_STAGES.map((s, i) => {
          const done = i < reached || (i === reached && s === 'delivered')
          const current = i === reached && !isSide && s !== 'delivered'
          const paused = i === reached && isSide
          return (
            <li key={s} className="flex flex-1 items-center last:flex-none" aria-current={current ? 'step' : undefined}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                    done && cn('border-transparent text-white', STAGE_META[s].dot),
                    current && cn('border-transparent ring-4 ring-foreground/10', STAGE_META[s].dot),
                    paused && 'border-dashed border-muted-foreground',
                    !done && !current && !paused && 'border-border',
                  )}
                >
                  {done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    'text-xs whitespace-nowrap',
                    current || paused ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {STAGE_META[s].label}
                </span>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span aria-hidden className={cn('mx-2 h-0.5 flex-1 rounded-full', i < reached ? 'bg-foreground/40' : 'bg-border')} />
              )}
            </li>
          )
        })}
      </ol>
      {isSide && <StageBadge stage={stage} />}
    </div>
  )
}
