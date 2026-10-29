import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { FormProvider, useFieldArray, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DuplicateWarning } from '@/features/duplicates/duplicate-warning'
import { useCan, useMe } from '@/hooks/use-me'
import { manualInfluencerSchema, type ManualInfluencerInput } from '@/lib/schemas'
import { getErrorMessage, influencersApi } from '@/services'
import type { DuplicateMatch } from '@/types'
import type { z } from 'zod'
import { EMPTY_ACCOUNT } from './account-input'
import { AccountRow } from './account-row'
import { AlreadyInCrm } from './already-in-crm'
import { conflictFromError, type ConflictState } from './conflict'
import type { ManualPrefill } from './context'
import { DetailsFields, Field } from './details-fields'
import { afterCreate, detailDefaults, findDuplicates, toAccountCreate, useCreateInfluencer } from './queries'

type Values = z.output<typeof manualInfluencerSchema>

export function ManualTab({ prefill, onDone }: { prefill?: ManualPrefill; onDone: () => void }) {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const canReassign = useCan('influencer:reassign')
  const create = useCreateInfluencer()
  const [serverConflict, setServerConflict] = useState<ConflictState | null>(null)
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [taken, setTaken] = useState<Record<number, boolean>>({})
  const form = useForm<ManualInfluencerInput, unknown, Values>({
    resolver: zodResolver(manualInfluencerSchema),
    defaultValues: {
      ...detailDefaults(me?.id),
      accounts: [prefill ? { ...EMPTY_ACCOUNT, platform: prefill.platform, handle: prefill.handle, personal: !!prefill.personal } : EMPTY_ACCOUNT],
      notes: '',
    },
  })
  const { register, control, formState } = form
  const accounts = useFieldArray({ control, name: 'accounts' })
  const anyTaken = Object.values(taken).some(Boolean)
  const markTaken = useCallback((index: number, value: boolean) => setTaken((t) => (t[index] === value ? t : { ...t, [index]: value })), [])

  const save = async (values: Values, acknowledged: boolean) => {
    if (anyTaken) return
    const body = { ...values, accounts: values.accounts.map(toAccountCreate) }
    setBusy(true)
    try {
      if (!acknowledged) {
        const found = await findDuplicates({
          name: values.name,
          email: values.email,
          phone: values.phone,
          city: values.city,
          accounts: body.accounts.map((a) => ({ platform: a.platform, handle: a.handle })),
        })
        if (found.length) return setMatches(found)
      }
      const created = await create.mutateAsync(body)
      const next = afterCreate(created, canReassign)
      toast.success(next.message)
      onDone()
      navigate(next.path)
    } catch (err) {
      const first = body.accounts[0]!
      const found = await conflictFromError(err, first.platform, first.handle)
      if (found) setServerConflict(found)
      else toast.error('Couldn’t add the influencer', { description: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  /** Same creator: add these accounts to the existing profile instead of creating a new one. */
  const addToExisting = async (match: DuplicateMatch) => {
    if (!match.influencer_id) return
    const values = form.getValues()
    const parsed = manualInfluencerSchema.safeParse(values)
    if (!parsed.success) return
    setBusy(true)
    try {
      for (const a of parsed.data.accounts.map(toAccountCreate)) await influencersApi.addAccount(match.influencer_id, a)
      toast.success(`Added to ${match.influencer?.name}`)
      onDone()
      navigate(`/influencers/${match.influencer_id}`)
    } catch (err) {
      toast.error('Couldn’t add the accounts', { description: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormProvider {...form}>
      {/* Editing after a duplicate warning makes it out of date. */}
      <form
        onSubmit={form.handleSubmit((v) => save(v, false))}
        onChange={() => setMatches(null)}
        className="space-y-4"
        noValidate
        aria-label="Add manually"
      >
        <Field id="m-name" label="Name" error={formState.errors.name}>
          <Input id="m-name" autoFocus aria-invalid={!!formState.errors.name} {...register('name')} />
        </Field>

        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium">Social accounts · the first is primary</legend>
          {accounts.fields.map((field, index) => (
            <AccountRow
              key={field.id}
              name={`accounts.${index}`}
              idPrefix={`m-acc-${index}`}
              onDone={onDone}
              onTaken={(value) => markTaken(index, value)}
              onRemove={
                accounts.fields.length > 1
                  ? () => {
                      accounts.remove(index)
                      setTaken({}) // rows re-report their state
                    }
                  : undefined
              }
            />
          ))}
          {formState.errors.accounts?.root?.message && (
            <p className="text-xs text-destructive">{formState.errors.accounts.root.message}</p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => accounts.append({ ...EMPTY_ACCOUNT, platform: 'youtube' })}>
            <Plus />
            Add another account
          </Button>
        </fieldset>

        {serverConflict && <AlreadyInCrm {...serverConflict} onDone={onDone} />}
        <DetailsFields idPrefix="m" showName={false} />
        <Field id="m-notes" label="Notes" error={formState.errors.notes}>
          <Textarea id="m-notes" rows={2} {...register('notes')} />
        </Field>
        {matches ? (
          <DuplicateWarning
            matches={matches}
            busy={busy}
            onUseExisting={(m) => void addToExisting(m)}
            proceedLabel="Create anyway"
            onLeave={onDone}
            onProceed={() => void form.handleSubmit((v) => save(v, true))()}
          />
        ) : (
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || anyTaken}>
              {busy ? 'Saving…' : 'Add influencer'}
            </Button>
          </div>
        )}
      </form>
    </FormProvider>
  )
}
