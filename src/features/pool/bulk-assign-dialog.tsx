import { useState } from 'react'
import { PersonAvatar } from '@/components/common/person-avatar'
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
import { ROLE_LABEL } from '@/lib/constants'
import type { User } from '@/types'
import { assigneesLabel, splitRoundRobin } from './use-pool-actions'

const plural = (n: number) => `${n} influencer${n === 1 ? '' : 's'}`

/**
 * Bulk assign from the pool: choose one or more people (several share the influencers out evenly), then confirm.
 * The parent closes it once the assignment settles.
 */
export function BulkAssignDialog({
  count,
  members,
  meId,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  /** How many influencers are selected. */
  count: number
  members: User[]
  meId?: string
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (assignees: User[]) => void
}) {
  const [chosenIds, setChosenIds] = useState<Set<string>>(() => new Set())
  const [step, setStep] = useState<'choose' | 'confirm'>('choose')
  const [wasOpen, setWasOpen] = useState(open)
  // Fresh choice each time it opens.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setChosenIds(new Set())
      setStep('choose')
    }
  }

  // In list order, so the split is the same as the preview.
  const chosen = members.filter((u) => chosenIds.has(u.id))
  const shares = chosen.length ? splitRoundRobin(Array.from({ length: count }), chosen.length).map((s) => s.length) : []
  const shareOf = new Map(chosen.map((u, i) => [u.id, shares[i]]))
  const nameOf = (u: User) => (u.id === meId ? `${u.name} (me)` : u.name)

  const toggle = (id: string, on: boolean) =>
    setChosenIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        {step === 'choose' ? (
          <>
            <DialogHeader>
              <DialogTitle>Assign {plural(count)}</DialogTitle>
              <DialogDescription>Choose who gets them. Choose more than one person to share them out evenly.</DialogDescription>
            </DialogHeader>
            <fieldset className="min-w-0">
              <legend className="sr-only">Assign to</legend>
              <ul className="-mx-1 max-h-72 space-y-0.5 overflow-y-auto px-1 py-0.5">
                {members.map((user) => {
                  const id = `bulk-assign-${user.id}`
                  const share = shareOf.get(user.id)
                  return (
                    <li key={user.id}>
                      <label
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted has-[:focus-visible]:bg-muted"
                      >
                        <Checkbox id={id} checked={chosenIds.has(user.id)} onCheckedChange={(on) => toggle(user.id, on === true)} />
                        <PersonAvatar name={user.name} className="size-6 text-[10px]" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{nameOf(user)}</span>
                          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
                        </span>
                        {share !== undefined && (
                          <span className="text-xs text-muted-foreground tabular-nums">{plural(share)}</span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!chosen.length} onClick={() => setStep('confirm')}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                Assign {plural(count)} to {assigneesLabel(chosen.map((u) => u.name))}?
              </DialogTitle>
              <DialogDescription>
                They’ll leave the pool. Any a teammate claims in the meantime are skipped.
              </DialogDescription>
            </DialogHeader>
            {chosen.length > 1 && (
              <ul className="space-y-1 text-sm" aria-label="How they’re shared out">
                {chosen.map((user, i) => (
                  <li key={user.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{nameOf(user)}</span>
                    <span className="text-muted-foreground tabular-nums">{plural(shares[i])}</span>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('choose')} disabled={pending}>
                Back
              </Button>
              <Button type="button" disabled={pending} onClick={() => onConfirm(chosen)}>
                {pending ? 'Assigning…' : `Assign ${count}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
