import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { STAGE_META } from '@/lib/constants'
import { overrideSchema } from '@/lib/schemas'
import type { Stage } from '@/types'

export type ReasonState = { target: { name: string; stage: Stage }; to: Stage; mode: 'confirm' | 'override' } | null
const REASON_MAX = 500

/** Confirm (on hold / rejected, optional reason) or admin override (reason required). */
export function StageReasonDialog({
  state,
  pending,
  onCancel,
  onSubmit,
}: {
  state: ReasonState
  pending: boolean
  onCancel: () => void
  onSubmit: (reason: string | undefined) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState<ReasonState>(null)
  // Fresh field each time the dialog opens for a new move.
  if (state !== shownFor) {
    setShownFor(state)
    setReason('')
    setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!state) return
    if (state.mode === 'override') {
      const parsed = overrideSchema.safeParse({ to: state.to, reason })
      if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Enter a reason')
      return onSubmit(parsed.data.reason)
    }
    if (reason.trim().length > REASON_MAX) return setError(`At most ${REASON_MAX} characters`)
    onSubmit(reason.trim() || undefined)
  }

  const target = state ? STAGE_META[state.to].label : ''
  const from = state ? STAGE_META[state.target.stage].label : ''

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {state?.mode === 'override'
                ? `Override: move to ${target}`
                : state?.to === 'rejected'
                  ? `Reject ${state.target.name}?`
                  : `Put ${state?.target.name} on hold?`}
            </DialogTitle>
            <DialogDescription>
              {state?.mode === 'override'
                ? `This skips the normal ${from} → ${target} rules. The reason is saved in the activity log.`
                : 'The reason is saved in the activity log.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="stage-reason">
              Reason{' '}
              <span className="font-normal text-muted-foreground">
                {state?.mode === 'override' ? '(required)' : '(optional)'}
              </span>
            </Label>
            <Textarea
              id="stage-reason"
              rows={3}
              value={reason}
              autoFocus
              aria-invalid={!!error}
              onChange={(e) => {
                setReason(e.target.value)
                setError(null)
              }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={state?.to === 'rejected' ? 'destructive' : 'default'} disabled={pending}>
              {state?.mode === 'override' ? 'Override stage' : `Move to ${target}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

