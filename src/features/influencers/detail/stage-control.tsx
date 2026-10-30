import { ChevronDown, CornerUpLeft, ShieldAlert } from 'lucide-react'
import { StageDot } from '@/components/common/stage-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMe } from '@/hooks/use-me'
import { ALL_STAGES, STAGE_META } from '@/lib/constants'
import { getStandardTransitions } from '@/lib/stages'
import { cn } from '@/lib/utils'
import type { Influencer, Stage } from '@/types'
import { useStageMover } from '../stage-mover'

interface StageControlProps {
  influencer: Influencer
  previousStage: Stage | null
  /** An "interested" call exists, so Contacted needs no modal. */
  hasInterestedCall: boolean
  /** A package with courier + tracking exists, so Package Sent needs no modal. */
  hasTrackedPackage: boolean
}

export function StageControl({ influencer, previousStage, hasInterestedCall, hasTrackedPackage }: StageControlProps) {
  const { data: me } = useMe()
  const mover = useStageMover()

  if (!me) return null
  const from = influencer.stage
  const standard = getStandardTransitions(from, me.role, previousStage)
  const overrides = me.role === 'admin' ? ALL_STAGES.filter((s) => s !== from && !standard.includes(s)) : []

  // Entering Onboarded from Contacted needs a current agreement (resuming from hold doesn't).
  const needsAgreement = (to: Stage) => to === 'onboarded' && from === 'contacted'
  const hasAgreement = !!influencer.documents?.has_agreement

  const requirementMet = (to: Stage) =>
    to === 'contacted' ? hasInterestedCall : to === 'package_sent' ? hasTrackedPackage : needsAgreement(to) ? hasAgreement : undefined

  const hint = (to: Stage) => {
    if (to === 'contacted' && !hasInterestedCall) return 'Log call…'
    if (to === 'package_sent' && !hasTrackedPackage) return 'Create package…'
    if (needsAgreement(to) && !hasAgreement) return 'Upload agreement…'
    if (to === previousStage && from === 'on_hold') return 'Resume'
    if (to === 'on_hold' || to === 'rejected') return '…'
    return null
  }

  const meta = STAGE_META[from]

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn('ring-1 ring-inset', meta.badge)}
            disabled={mover.pending}
            aria-label={`Stage: ${meta.label}. Change stage`}
          >
            <StageDot stage={from} className="size-2" />
            {meta.label}
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
            {standard.length === 0 && <DropdownMenuItem disabled>No standard moves from {meta.label}</DropdownMenuItem>}
            {standard.map((to) => (
              <DropdownMenuItem key={to} onSelect={() => mover.requestMove(influencer, to, { requirementMet: requirementMet(to) })}>
                <StageDot stage={to} />
                {STAGE_META[to].label}
                {hint(to) && <span className="ml-auto text-xs text-muted-foreground">{hint(to)}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {overrides.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="size-3.5" />
                  Override (admin)
                </DropdownMenuLabel>
                {overrides.map((to) => (
                  <DropdownMenuItem key={to} onSelect={() => mover.requestMove(influencer, to, { override: true })}>
                    <StageDot stage={to} />
                    {STAGE_META[to].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {from === 'on_hold' && previousStage && (
        <Button onClick={() => mover.requestMove(influencer, previousStage)} disabled={mover.pending}>
          <CornerUpLeft />
          Resume to {STAGE_META[previousStage].label}
        </Button>
      )}

      {mover.dialogs}
    </>
  )
}
