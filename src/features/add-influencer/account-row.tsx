import { Check, Loader2, X } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useFormContext, useWatch, type FieldErrors } from 'react-hook-form'
import { PlatformMark } from '@/components/common/platform-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PLATFORM_META, PLATFORMS } from '@/lib/platforms'
import type { AccountInput } from '@/lib/schemas'
import { isManualAccount, useHandleCheck } from './account-input'
import { AlreadyInCrm } from './already-in-crm'
import { Field } from './details-fields'

/** Platform, handle, and (for accounts typed in by hand) the audience. `name` is the form path, e.g. "accounts.0". */
export function AccountRow({
  name,
  idPrefix,
  onRemove,
  onDone,
  onTaken,
}: {
  name: string
  idPrefix: string
  onRemove?: () => void
  onDone: () => void
  /** Reports whether this row's handle is already in the CRM (blocks saving). */
  onTaken?: (taken: boolean) => void
}) {
  const { control, register, formState } = useFormContext()
  const row = (useWatch({ control, name }) ?? {}) as AccountInput
  const platform = row.platform ?? 'instagram'
  const manual = isManualAccount(platform, !!row.personal)
  const check = useHandleCheck(platform, row.handle ?? '')
  const isTaken = check.taken !== undefined
  useEffect(() => onTaken?.(isTaken), [isTaken, onTaken])
  // Nested errors for this row, e.g. accounts.0.handle.
  const errors = name.split('.').reduce<FieldErrors | undefined>((e, key) => (e?.[key] as FieldErrors | undefined), formState.errors) as
    | FieldErrors<AccountInput>
    | undefined
  const id = (field: string) => `${idPrefix}-${field}`
  const meta = PLATFORM_META[platform]

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[9.5rem_1fr_auto] items-start gap-2">
        <Field id={id('platform')} label="Platform">
          <Controller
            control={control}
            name={`${name}.platform`}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id('platform')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      <PlatformMark platform={p} />
                      {PLATFORM_META[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field
          id={id('handle')}
          label={`${meta.label} handle or link`}
          error={errors?.handle as never}
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
            id={id('handle')}
            placeholder={meta.url('riyastyle').replace(/^https:\/\/(www\.)?/, '')}
            autoComplete="off"
            aria-invalid={!!errors?.handle || check.taken !== undefined}
            {...register(`${name}.handle`)}
          />
        </Field>
        {onRemove ? (
          <Button type="button" variant="ghost" size="icon" className="mt-5" onClick={onRemove} aria-label={`Remove ${meta.label} account`}>
            <X />
          </Button>
        ) : (
          <span className="w-9" />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pl-1">
        {(platform === 'instagram' || platform === 'facebook') && (
          <Controller
            control={control}
            name={`${name}.personal`}
            render={({ field }) => (
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                Personal profile (can’t be looked up; enter stats by hand)
              </label>
            )}
          />
        )}
        {manual && (
          <Field id={id('audience')} label={`${meta.audienceLabel} (optional)`} error={errors?.audience as never} className="w-40">
            <Input id={id('audience')} inputMode="decimal" placeholder="e.g. 12k" {...register(`${name}.audience`)} />
          </Field>
        )}
        {!manual && meta.defaultSyncMethod === 'connect' && (
          <p className="text-xs text-muted-foreground">Stats arrive once the creator connects it (send a connect link from their profile).</p>
        )}
      </div>
      {check.taken && <AlreadyInCrm {...check.taken} onDone={onDone} />}
    </div>
  )
}
