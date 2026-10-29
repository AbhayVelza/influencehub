import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { metricValue, PLATFORM_META } from '@/lib/platforms'
import { countField, validateField } from '@/lib/schemas'
import { accountsApi, getErrorMessage } from '@/services'
import type { Influencer, SocialAccount } from '@/types'
import { invalidateInfluencer } from '../detail-queries'

/** Manual accounts: type in the platform's stats (counts accept 12k / 1.2m). */
export function EditStatsDialog({
  influencer,
  account,
  open,
  onOpenChange,
}: {
  influencer: Influencer
  account: SocialAccount
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const defs = PLATFORM_META[account.platform].metrics.filter((d) => d.format === 'count' || d.format === 'text')
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(Object.fromEntries(defs.map((d) => [d.key, String(metricValue(account, d.key) ?? '')])))
      setErrors({})
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const metrics: Record<string, number | string | null> = {}
    const nextErrors: Record<string, string> = {}
    for (const def of defs) {
      const raw = values[def.key] ?? ''
      if (def.format === 'text') {
        metrics[def.key] = raw.trim().slice(0, 80) || null
        continue
      }
      const result = validateField(countField, raw)
      if (result.ok) metrics[def.key] = result.value
      else nextErrors[def.key] = result.error
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true)
    try {
      await accountsApi.update(account.id, { metrics })
      toast.success(`${PLATFORM_META[account.platform].label} stats saved`)
      onOpenChange(false)
    } catch (err) {
      toast.error('Couldn’t save the stats', { description: getErrorMessage(err) })
    } finally {
      setBusy(false)
      void invalidateInfluencer(queryClient, influencer.id)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {PLATFORM_META[account.platform].label} stats · @{account.handle}
            </DialogTitle>
            <DialogDescription>Entered by hand. Leave a field empty if you don’t know it.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {defs.map((def) => (
              <div key={def.key} className="grid gap-1">
                <Label htmlFor={`stat-${def.key}`} className="text-xs">
                  {def.label}
                </Label>
                <Input
                  id={`stat-${def.key}`}
                  inputMode={def.format === 'count' ? 'decimal' : 'text'}
                  value={values[def.key] ?? ''}
                  aria-invalid={!!errors[def.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
                />
                {errors[def.key] && <p className="text-xs text-destructive">{errors[def.key]}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save stats'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
