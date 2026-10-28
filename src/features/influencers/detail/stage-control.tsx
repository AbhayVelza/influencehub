import { ChevronDown, CornerUpLeft, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { StageDot } from '@/components/common/stage-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMe } from '@/hooks/use-me'
import { ALL_STAGES, STAGE_META } from '@/lib/constants'
import { overrideSchema } from '@/lib/schemas'
import { getStandardTransitions } from '@/lib/stages'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { Influencer, Stage } from '@/types'
import { useChangeStage } from '../detail-queries'

interface StageControlProps {
  influencer: Influencer
  previousStage: Stage | null
  /** An "interested" call exists, so Contacted needs no modal. */
  hasInterestedCall: boolean
  /** A package with courier + tracking exists, so Package Sent needs no modal. */
  hasTrackedPackage: boolean
  onNeedCall: () => void
  onNeedPackage: () => void
}

type ReasonDialogState = { to: Stage; mode: 'confirm' | 'override' } | null

const REASON_MAX = 500

export function StageControl({
  influencer,
  previousStage,
  hasInterestedCall,
  hasTrackedPackage,
  onNeedCall,
  onNeedPackage,
}: StageControlProps) {
  const { data: me } = useMe()
  const changeStage = useChangeStage(influencer.id)
  const [dialog, setDialog] = useState<ReasonDialogState>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)

  if (!me) return null
  const from = influencer.stage
  const standard = getStandardTransitions(from, me.role, previousStage)
  const overrides = me.role === 'admin' ? ALL_STAGES.filter((s) => s !== from && !standard.includes(s)) : []

  const move = async (to: Stage, why?: string) => {
    try {
      await changeStage.mutateAsync({ to, reason: why })
      toast.success(`${influencer.name} moved to ${STAGE_META[to].label}`)
      return true
    } catch (err) {
      toast.error(`Couldn’t move to ${STAGE_META[to].label}`, { description: getErrorMessage(err) })
      return false
    }
  }

  const openDialog = (to: Stage, mode: 'confirm' | 'override') => {
    setReason('')
    setReasonError(null)
    setDialog({ to, mode })
  }

  const onStandard = (to: Stage) => {
    if (to === 'contacted' && !hasInterestedCall) return onNeedCall()
    if (to === 'package_sent' && !hasTrackedPackage) return onNeedPackage()
    if (to === 'on_hold' || to === 'rejected') return openDialog(to, 'confirm')
    void move(to)
  }

  const hint = (to: Stage) => {
    if (to === 'contacted' && !hasInterestedCall) return 'Log call…'
    if (to === 'package_sent' && !hasTrackedPackage) return 'Create package…'
    if (to === previousStage && from === 'on_hold') return 'Resume'
    if (to === 'on_hold' || to === 'rejected') return '…'
    return null
  }

  const submitDialog = async (event: FormEvent) => {
    event.preventDefault()
    if (!dialog) return
    let why: string | undefined = reason.trim() || undefined
    if (dialog.mode === 'override') {
      const parsed = overrideSchema.safeParse({ to: dialog.to, reason })
      if (!parsed.success) return setReasonError(parsed.error.issues[0]?.message ?? 'Enter a reason')
      why = parsed.data.reason
    } else if (reason.trim().length > REASON_MAX) {
      return setReasonError(`At most ${REASON_MAX} characters`)
    }
    if (await move(dialog.to, why)) setDialog(null)
  }

  const meta = STAGE_META[from]
  const target = dialog ? STAGE_META[dialog.to].label : ''

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn('ring-1 ring-inset', meta.badge)}
            disabled={changeStage.isPending}
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
              <DropdownMenuItem key={to} onSelect={() => onStandard(to)}>
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
                  <DropdownMenuItem key={to} onSelect={() => openDialog(to, 'override')}>
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
        <Button onClick={() => move(previousStage)} disabled={changeStage.isPending}>
          <CornerUpLeft />
          Resume to {STAGE_META[previousStage].label}
        </Button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && !changeStage.isPending && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitDialog} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>
                {dialog?.mode === 'override'
                  ? `Override: move to ${target}`
                  : dialog?.to === 'rejected'
                    ? `Reject ${influencer.name}?`
                    : `Put ${influencer.name} on hold?`}
              </DialogTitle>
              <DialogDescription>
                {dialog?.mode === 'override'
                  ? `This skips the normal ${meta.label} → ${target} rules. The reason is saved in the activity log.`
                  : 'The reason is saved in the activity log.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="stage-reason">
                Reason{' '}
                <span className="font-normal text-muted-foreground">
                  {dialog?.mode === 'override' ? '(required)' : '(optional)'}
                </span>
              </Label>
              <Textarea
                id="stage-reason"
                rows={3}
                value={reason}
                autoFocus
                aria-invalid={!!reasonError}
                onChange={(e) => {
                  setReason(e.target.value)
                  setReasonError(null)
                }}
              />
              {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={changeStage.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={dialog?.to === 'rejected' ? 'destructive' : 'default'}
                disabled={changeStage.isPending}
              >
                {dialog?.mode === 'override' ? 'Override stage' : `Move to ${target}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
