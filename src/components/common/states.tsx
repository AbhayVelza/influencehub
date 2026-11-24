import type { LucideIcon } from 'lucide-react'
import { CircleAlert, Inbox, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center whitespace-normal', className)}>
      {/* Stitch empty-state mark: soft halo, tinted ring, white disc, cyan icon. */}
      <div className="relative mb-5 flex size-20 items-center justify-center">
        <div aria-hidden className="absolute inset-0 rounded-full bg-tertiary-fixed opacity-60 blur-2xl" />
        <div className="relative flex size-20 items-center justify-center rounded-full bg-tertiary-fixed/60 shadow-inner">
          <div className="flex size-14 items-center justify-center rounded-full bg-surface-container-lowest shadow-sm">
            <Icon className="size-7 text-on-tertiary-container" strokeWidth={1.75} />
          </div>
        </div>
      </div>
      <p className="text-h3 font-semibold tracking-tight text-primary">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-body text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  error?: unknown
  onRetry?: () => void
  className?: string
}

export function ErrorState({ title = 'Something went wrong', error, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-14 text-center whitespace-normal', className)}>
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-error-container/60 shadow-inner">
        <div className="flex size-11 items-center justify-center rounded-full bg-surface-container-lowest shadow-sm">
          <CircleAlert className="size-5 text-error" strokeWidth={1.75} />
        </div>
      </div>
      <p className="text-h3 font-semibold tracking-tight text-primary">{title}</p>
      {error !== undefined && <p className="mt-1.5 max-w-md text-body text-muted-foreground">{getErrorMessage(error)}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  )
}
