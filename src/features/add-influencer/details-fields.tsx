import type { ReactNode } from 'react'
import { Controller, useFormContext, type FieldError } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCategories } from '@/hooks/use-categories'
import { useCan, useMe } from '@/hooks/use-me'
import { useTeam } from '@/hooks/use-team'
import type { InfluencerDetailsInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'

const UNASSIGNED = '__unassigned'

export function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string
  label: ReactNode
  error?: FieldError
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1', className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      {error?.message ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error.message}
        </p>
      ) : (
        hint && <div className="text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  )
}

/**
 * Category, contact, location and owner. Used inside a FormProvider by both the Instagram and the manual
 * form. Executives can only own it themselves or leave it unassigned (the claim rule).
 */
export function DetailsFields({ idPrefix, showName = true }: { idPrefix: string; showName?: boolean }) {
  const { register, control, formState } = useFormContext<InfluencerDetailsInput>()
  const errors = formState.errors
  const categories = useCategories()
  const team = useTeam()
  const { data: me } = useMe()
  const canReassign = useCan('influencer:reassign')
  const id = (name: string) => `${idPrefix}-${name}`
  const owners = canReassign ? (team.data?.items ?? []).filter((u) => u.is_active) : me ? [me] : []

  return (
    <div className="grid grid-cols-2 gap-3">
      {showName && (
        <Field id={id('name')} label="Name" error={errors.name} className="col-span-2">
          <Input id={id('name')} aria-invalid={!!errors.name} {...register('name')} />
        </Field>
      )}
      <Field id={id('category')} label="Category" error={errors.category}>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id={id('category')} className="w-full" aria-invalid={!!errors.category}>
                <SelectValue placeholder={categories.isLoading ? 'Loading…' : 'Choose a category'} />
              </SelectTrigger>
              <SelectContent>
                {(categories.data?.items ?? [])
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field id={id('owner')} label="Owner">
        <Controller
          control={control}
          name="assigned_to"
          render={({ field }) => (
            <Select value={field.value || UNASSIGNED} onValueChange={(v) => field.onChange(v === UNASSIGNED ? '' : v)}>
              <SelectTrigger id={id('owner')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {owners.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.id === me?.id ? `${u.name} (me)` : u.name}
                  </SelectItem>
                ))}
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field id={id('phone')} label="Phone" error={errors.phone} hint="+91 is added when no country code is given">
        <Input id={id('phone')} type="tel" placeholder="98765 43210" aria-invalid={!!errors.phone} {...register('phone')} />
      </Field>
      <Field id={id('email')} label="Email" error={errors.email}>
        <Input id={id('email')} type="email" aria-invalid={!!errors.email} {...register('email')} />
      </Field>
      <div className="col-span-2 grid grid-cols-3 gap-3">
        <Field id={id('city')} label="City" error={errors.city}>
          <Input id={id('city')} aria-invalid={!!errors.city} {...register('city')} />
        </Field>
        <Field id={id('state')} label="State" error={errors.state}>
          <Input id={id('state')} aria-invalid={!!errors.state} {...register('state')} />
        </Field>
        <Field id={id('country')} label="Country" error={errors.country}>
          <Input id={id('country')} aria-invalid={!!errors.country} {...register('country')} />
        </Field>
      </div>
    </div>
  )
}
