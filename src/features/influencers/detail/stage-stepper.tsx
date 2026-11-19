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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface-container-lowest/60 px-space-md py-3.5 shadow-glass backdrop-blur-xl sm:px-space-lg dark:ring-1 dark:ring-white/5">
      <ol className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Pipeline progress">
        {PIPELINE_STAGES.map((s, i) => {
          const done = i < reached || (i === reached && s === 'delivered')
          const current = i === reached && !isSide && s !== 'delivered'
          const paused = i === reached && isSide
          return (
            <li key={s} className="flex flex-1 items-center last:flex-none" aria-current={current ? 'step' : undefined}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    done && cn('border-transparent text-white', STAGE_META[s].dot),
                    current && cn('border-transparent shadow-sm ring-4 ring-tertiary-fixed/60', STAGE_META[s].dot),
                    paused && 'border-dashed border-muted-foreground',
                    !done && !current && !paused && 'border-surface-container-highest bg-surface-container-lowest/70',
                  )}
                >
                  {done && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    'text-label-md whitespace-nowrap',
                    current || paused ? 'font-semibold text-primary' : done ? 'font-medium text-on-surface' : 'text-muted-foreground',
                  )}
                >
                  {STAGE_META[s].label}
                </span>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span aria-hidden className={cn('mx-3 h-0.5 min-w-4 flex-1 rounded-full', i < reached ? 'bg-on-surface/35' : 'bg-surface-container-high')} />
              )}
            </li>
          )
        })}
      </ol>
      {isSide && <StageBadge stage={stage} />}
    </div>
  )
}
