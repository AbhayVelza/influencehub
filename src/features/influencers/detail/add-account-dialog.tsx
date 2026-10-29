import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EMPTY_ACCOUNT } from '@/features/add-influencer/account-input'
import { AccountRow } from '@/features/add-influencer/account-row'
import { AlreadyInCrm } from '@/features/add-influencer/already-in-crm'
import { conflictFromError, type ConflictState } from '@/features/add-influencer/conflict'
import { findDuplicates, toAccountCreate } from '@/features/add-influencer/queries'
import { DuplicateWarning } from '@/features/duplicates/duplicate-warning'
import { waitForJob } from '@/lib/jobs'
import { PLATFORM_META } from '@/lib/platforms'
import { accountInputSchema, type AccountInput } from '@/lib/schemas'
import { accountsApi, getErrorMessage, influencersApi } from '@/services'
import type { DuplicateMatch, Influencer } from '@/types'
import { z } from 'zod'
import { invalidateInfluencer } from '../detail-queries'

const schema = z.object({ account: accountInputSchema })

/**
 * Adds another platform account. Checks for a possible duplicate creator first (excluding this one); lookup
 * accounts are synced straight away.
 */
export function AddAccountDialog({
  influencer,
  open,
  onOpenChange,
  onAdded,
}: {
  influencer: Influencer
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (accountId: string) => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<{ account: AccountInput }, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { account: EMPTY_ACCOUNT },
  })
  const [busy, setBusy] = useState(false)
  const [taken, setTaken] = useState(false)
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      form.reset({ account: EMPTY_ACCOUNT })
      setMatches(null)
      setConflict(null)
    }
  }

  const save = async (values: z.output<typeof schema>, acknowledged: boolean) => {
    const body = toAccountCreate(values.account)
    setBusy(true)
    try {
      if (!acknowledged) {
        const found = await findDuplicates({ accounts: [{ platform: body.platform, handle: body.handle }], exclude_id: influencer.id })
        if (found.length) {
          setMatches(found)
          return
        }
      }
      const account = await influencersApi.addAccount(influencer.id, body)
      const label = `${PLATFORM_META[account.platform].label} @${account.handle}`
      if (account.sync_status === 'pending') {
        const { job_id } = await accountsApi.sync(account.id)
        const job = await waitForJob(job_id)
        if (job.status === 'succeeded') toast.success(`${label} added and synced`)
        else toast.warning(`${label} added, but the sync failed`, { description: job.error?.message })
      } else {
        toast.success(`${label} added`)
      }
      onAdded(account.id)
      onOpenChange(false)
    } catch (err) {
      const found = await conflictFromError(err, body.platform, body.handle)
      if (found) setConflict(found)
      else toast.error('Couldn’t add the account', { description: getErrorMessage(err) })
    } finally {
      setBusy(false)
      void invalidateInfluencer(queryClient, influencer.id)
      void queryClient.invalidateQueries({ queryKey: ['influencers', 'detail', influencer.id] })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((v) => save(v, false))} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Add a social account</DialogTitle>
              <DialogDescription>
                Public Instagram, YouTube, Threads and Facebook Page stats are fetched. TikTok and Pinterest need a connect
                link; LinkedIn and Snapchat are typed in.
              </DialogDescription>
            </DialogHeader>
            <AccountRow
              name="account"
              idPrefix="add-acc"
              onDone={() => onOpenChange(false)}
              onTaken={setTaken}
            />
            {conflict && <AlreadyInCrm {...conflict} onDone={() => onOpenChange(false)} />}
            {matches && (
              <DuplicateWarning
                matches={matches}
                proceedLabel="Add anyway"
                busy={busy}
                onLeave={() => onOpenChange(false)}
                onProceed={() => void form.handleSubmit((v) => save(v, true))()}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              {!matches && (
                <Button type="submit" disabled={busy || taken}>
                  {busy ? 'Adding…' : 'Add account'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
