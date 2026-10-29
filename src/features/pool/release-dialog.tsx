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
import { releaseSchema } from '@/lib/schemas'

/** Release to the pool: the reason is required and saved in the activity log. */
export function ReleaseDialog({
  name,
  open,
  ownOnly,
  pending,
  onOpenChange,
  onSubmit,
}: {
  name: string
  open: boolean
  /** Executives lose access once it's released. */
  ownOnly: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  // Fresh field each time it opens.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setReason('')
      setError(null)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = releaseSchema.safeParse({ reason })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Enter a reason')
    onSubmit(parsed.data.reason)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Release {name} to the pool?</DialogTitle>
            <DialogDescription>
              {ownOnly
                ? 'They’ll have no owner, and anyone on the team can claim them. You’ll lose access to their contact details and calls.'
                : 'They’ll have no owner, and anyone on the team can claim them.'}{' '}
              The reason is saved in the activity log.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="release-reason">
              Reason <span className="font-normal text-muted-foreground">(required)</span>
            </Label>
            <Textarea
              id="release-reason"
              rows={3}
              value={reason}
              autoFocus
              aria-invalid={!!error}
              aria-describedby={error ? 'release-reason-error' : undefined}
              onChange={(e) => {
                setReason(e.target.value)
                setError(null)
              }}
            />
            {error && (
              <p id="release-reason-error" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Releasing…' : 'Release to pool'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
