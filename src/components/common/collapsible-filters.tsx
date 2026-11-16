import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CollapsibleFiltersProps {
  /** How many filters are set (each filter once, however many values it holds); shown on the button. */
  activeCount: number
  /** Always visible beside the button, e.g. "Clear all". */
  actions?: ReactNode
  /** The filter controls. They stay mounted while hidden, so whatever they keep up to date keeps running. */
  children: ReactNode
  className?: string
}

/**
 * Every list's filters sit behind one "Filters" button and show only once it's clicked. Meant for a flex-wrap
 * row (it wraps the panel onto its own line) or on its own.
 */
export function CollapsibleFilters({ activeCount, actions, children, className }: CollapsibleFiltersProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <>
      <div className={cn('flex items-center gap-2', className)}>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', activeCount > 0 && 'border-primary/40 bg-primary/5 dark:bg-primary/10')}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal />
          Filters
          {activeCount > 0 && (
            <span
              className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"
              aria-label={`${activeCount} active`}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown className={cn('opacity-60 transition-transform', open && 'rotate-180')} />
        </Button>
        {actions}
      </div>
      <div
        id={panelId}
        role="group"
        aria-label="Filters"
        className={cn('basis-full flex-wrap items-center gap-2', open ? 'flex' : 'hidden')}
      >
        {children}
      </div>
    </>
  )
}
