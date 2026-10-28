import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useMe } from '@/hooks/use-me'
import { ACCOUNT_TYPE_LABEL } from '@/lib/constants'
import { fieldSchemas, manualInfluencerSchema, normalizeHandle, validateField } from '@/lib/schemas'
import { ApiError, getErrorMessage, influencersApi } from '@/services'
import type { AccountType } from '@/types'
import { AlreadyInCrm } from './already-in-crm'
import type { ManualPrefill } from './context'
import { DetailsFields, Field } from './details-fields'
import { detailDefaults, useCreateInfluencer } from './queries'

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]

/** Live "is this handle already in the CRM?" check, debounced. */
function useHandleCheck(handle: string) {
  const normalized = normalizeHandle(handle)
  const valid = validateField(fieldSchemas.instagram_handle, normalized).ok
  const debounced = useDebouncedValue(valid ? normalized : '', 400)
  const query = useQuery({
    queryKey: ['check-handle', debounced],
    queryFn: ({ signal }) => influencersApi.checkHandle(debounced, signal),
    enabled: debounced !== '',
    staleTime: 10_000,
  })
  const settled = debounced === normalized && valid
  return {
    handle: debounced,
    checking: valid && (!settled || query.isFetching),
    taken: settled && query.data?.available === false ? (query.data.influencer_id ?? null) : undefined,
    available: settled && query.data?.available === true,
  }
}

export function ManualTab({ prefill, onDone }: { prefill?: ManualPrefill; onDone: () => void }) {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const create = useCreateInfluencer()
  const [serverConflict, setServerConflict] = useState<{ handle: string; id: string | null } | null>(null)
  const form = useForm({
    resolver: zodResolver(manualInfluencerSchema),
    defaultValues: {
      ...detailDefaults(me?.id),
      instagram_handle: prefill?.instagram_handle ?? '',
      account_type: prefill?.account_type ?? 'unknown',
      followers: '',
      notes: '',
    },
  })
  const { register, control, formState } = form
  const handleInput = useWatch({ control, name: 'instagram_handle' }) ?? ''
  const check = useHandleCheck(handleInput)
  const conflict = check.taken !== undefined ? { handle: check.handle, id: check.taken } : serverConflict

  const onSubmit = form.handleSubmit(async (values) => {
    if (check.taken !== undefined) return
    try {
      const created = await create.mutateAsync(values)
      toast.success(`${created.name} added`)
      onDone()
      navigate(`/influencers/${created.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'handle_taken') {
        const res = await influencersApi.checkHandle(values.instagram_handle).catch(() => null)
        setServerConflict({ handle: values.instagram_handle, id: res?.influencer_id ?? null })
        return
      }
      toast.error('Couldn’t add the influencer', { description: getErrorMessage(err) })
    }
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label="Add manually">
        <div className="grid grid-cols-2 gap-3">
          <Field id="m-name" label="Name" error={formState.errors.name}>
            <Input id="m-name" autoFocus aria-invalid={!!formState.errors.name} {...register('name')} />
          </Field>
          <Field
            id="m-handle"
            label="Instagram handle"
            error={formState.errors.instagram_handle}
            hint={
              check.checking ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Checking…
                </span>
              ) : check.available ? (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                  <Check className="size-3" />
                  Not in the CRM yet
                </span>
              ) : null
            }
          >
            <Input
              id="m-handle"
              placeholder="riyastyle"
              autoComplete="off"
              aria-invalid={!!formState.errors.instagram_handle || check.taken !== undefined}
              {...register('instagram_handle', { onChange: () => setServerConflict(null) })}
            />
          </Field>
          <Field id="m-account" label="Account type">
            <Controller
              control={control}
              name="account_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="m-account" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ACCOUNT_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field id="m-followers" label="Followers (optional)" error={formState.errors.followers} hint="e.g. 12k or 1.2m">
            <Input id="m-followers" inputMode="decimal" aria-invalid={!!formState.errors.followers} {...register('followers')} />
          </Field>
        </div>
        {conflict && <AlreadyInCrm handle={conflict.handle} influencerId={conflict.id} onOpen={onDone} />}
        <DetailsFields idPrefix="m" showName={false} />
        <Field id="m-notes" label="Notes" error={formState.errors.notes}>
          <Textarea id="m-notes" rows={2} {...register('notes')} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending || check.taken !== undefined}>
            {create.isPending ? 'Saving…' : 'Add influencer'}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
