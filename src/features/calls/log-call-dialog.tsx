import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { DateTimeInput } from '@/components/common/date-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useChangeStage } from '@/features/influencers/detail-queries'
import { useMe } from '@/hooks/use-me'
import { CALL_OUTCOME_META, CALL_OUTCOMES } from '@/lib/constants'
import { dateTimeInputFromNow, parseDateTimeInput } from '@/lib/format'
import { callLogSchema, type CallLogFormInput } from '@/lib/schemas'
import { getStandardTransitions } from '@/lib/stages'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { CallOutcome, Stage } from '@/types'
import { useLogCall } from './queries'

export interface LogCallTarget {
  id: string
  name: string
  stage: Stage
}

interface LogCallDialogProps {
  influencer: LogCallTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opened from Stage → Contacted: preselect "Interested" and the move. */
  intent?: 'contacted'
}

const QUICK_PICKS = [
  { label: 'Today 5 PM', days: 0, hour: 17 },
  { label: 'Tomorrow 11 AM', days: 1, hour: 11 },
  { label: 'In 3 days', days: 3, hour: 11 },
  { label: 'Next week', days: 7, hour: 11 },
]

function defaults(intent?: 'contacted'): CallLogFormInput {
  return { outcome: intent === 'contacted' ? 'interested' : '', notes: '', follow_up: '', move_to_contacted: intent === 'contacted' }
}

export function LogCallDialog({ influencer, open, onOpenChange, intent }: LogCallDialogProps) {
  const { data: me } = useMe()
  const logCall = useLogCall(influencer.id)
  const changeStage = useChangeStage(influencer.id)
  const form = useForm({ resolver: zodResolver(callLogSchema), defaultValues: defaults(intent) })
  const { register, control, handleSubmit, setValue, reset, formState } = form

  useEffect(() => {
    if (open) reset(defaults(intent))
  }, [open, intent, reset])

  const outcome = useWatch({ control, name: 'outcome' }) as CallOutcome | ''
  const canMoveToContacted =
    outcome === 'interested' && !!me && getStandardTransitions(influencer.stage, me.role, null).includes('contacted')
  const busy = logCall.isPending || changeStage.isPending

  const onSubmit = handleSubmit(async (values) => {
    try {
      await logCall.mutateAsync({
        outcome: values.outcome as CallOutcome,
        notes: values.notes,
        follow_up_date: values.follow_up ? parseDateTimeInput(values.follow_up) : null,
      })
    } catch (err) {
      toast.error('Couldn’t log the call', { description: getErrorMessage(err) })
      return
    }
    onOpenChange(false)
    if (canMoveToContacted && values.move_to_contacted) {
      try {
        await changeStage.mutateAsync({ to: 'contacted' })
        toast.success(`Call logged · ${influencer.name} moved to Contacted`)
      } catch (err) {
        toast.warning('Call logged, but the stage didn’t change', { description: getErrorMessage(err) })
      }
      return
    }
    toast.success('Call logged')
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Log call</DialogTitle>
            <DialogDescription>{influencer.name}</DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Outcome</legend>
            <Controller
              control={control}
              name="outcome"
              render={({ field, fieldState }) => (
                <>
                  <div role="radiogroup" aria-label="Outcome" className="flex flex-wrap gap-1.5">
                    {CALL_OUTCOMES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={field.value === value}
                        onClick={() => field.onChange(value)}
                        className={cn(
                          'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                          field.value === value
                            ? cn('border-transparent', CALL_OUTCOME_META[value].badge, 'ring-2 ring-ring/40')
                            : 'hover:bg-muted',
                        )}
                      >
                        {CALL_OUTCOME_META[value].label}
                      </button>
                    ))}
                  </div>
                  {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                </>
              )}
            />
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="call-notes">Notes</Label>
            <Textarea id="call-notes" rows={3} placeholder="What did you discuss?" {...register('notes')} />
            {formState.errors.notes && <p className="text-xs text-destructive">{formState.errors.notes.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="call-follow-up">
              Follow-up{' '}
              <span className="font-normal text-muted-foreground">
                {outcome === 'call_back' ? '(required)' : '(optional)'} · IST
              </span>
            </Label>
            <DateTimeInput
              id="call-follow-up"
              aria-invalid={!!formState.errors.follow_up}
              {...register('follow_up')}
            />
            <div className="flex flex-wrap gap-1">
              {QUICK_PICKS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setValue('follow_up', dateTimeInputFromNow(p.days, p.hour), { shouldValidate: true })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {formState.errors.follow_up && (
              <p className="text-xs text-destructive">{formState.errors.follow_up.message}</p>
            )}
          </div>

          {canMoveToContacted && (
            <Controller
              control={control}
              name="move_to_contacted"
              render={({ field }) => (
                <label className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                  Move to <strong className="font-medium">Contacted</strong>
                </label>
              )}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Log call'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
