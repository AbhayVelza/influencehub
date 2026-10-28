import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Disabled placeholder for an action whose screen is built in a later phase. */
export function ComingSoonButton({
  phase,
  variant,
  children,
}: {
  phase: number
  variant?: 'default' | 'outline'
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button variant={variant} disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming in Phase {phase}</TooltipContent>
    </Tooltip>
  )
}
