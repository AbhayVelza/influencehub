import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Small uppercase line above the title (Stitch eyebrow), with a cyan dot. */
  eyebrow?: ReactNode
  /** A count shown as a pill after the title. */
  count?: ReactNode
  /** Leading visual before the title (e.g. a platform tile). */
  icon?: ReactNode
  className?: string
}

/** Stitch page header: eyebrow → 32px title (+ count pill) → muted subtitle; actions on the right. */
export function PageHeader({ title, description, actions, eyebrow, count, icon, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col justify-between gap-space-sm md:flex-row md:items-end', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 flex items-center gap-space-xs">
            <span aria-hidden className="inline-block size-2 rounded-full bg-on-tertiary-container" />
            <span className="text-small tracking-wider text-muted-foreground uppercase">{eyebrow}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {icon}
          <h1 className="text-h1 font-semibold tracking-tight text-primary">
            {title}
          </h1>
          {count !== undefined && count !== null && (
            <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-body font-medium text-muted-foreground tabular-nums shadow-sm">
              {count}
            </span>
          )}
        </div>
        {description && <p className="mt-0.5 text-body text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-sm">{actions}</div>}
    </div>
  )
}
