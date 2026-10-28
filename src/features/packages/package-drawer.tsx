import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type FieldError } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useChangeStage } from '@/features/influencers/detail-queries'
import { copyToClipboard } from '@/lib/clipboard'
import { COURIERS, PACKAGE_STATUS_META, PACKAGE_STATUSES } from '@/lib/constants'
import { packageSchema, type PackageFormInput } from '@/lib/schemas'
import { getErrorMessage } from '@/services'
import type { Address, Influencer, Package, PackageStatus } from '@/types'
import { PackageStatusConfirm } from './package-status-confirm'
import { needsStatusConfirm, useCreatePackage, useUpdatePackage, type StageChangingStatus } from './queries'

/** `stage` is optional; when known, the delivered/returned confirmation says exactly what happens. */
export type PackageTarget = Pick<Influencer, 'id' | 'name' | 'address'> & { stage?: Influencer['stage'] }

interface PackageDrawerProps {
  influencer: PackageTarget
  /** Edit this package; omit to create one. */
  pkg?: Package | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opened from Stage → Package Sent: ship now, then move the influencer. */
  intent?: 'package_sent'
  onSaved?: (pkg: Package) => void
}

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', state: '', postal_code: '', country: '' }

function toAddressInput(address: Address | null | undefined) {
  return address ? { ...address, line2: address.line2 ?? '' } : EMPTY_ADDRESS
}

function defaults(influencer: PackageTarget, pkg: Package | null | undefined, intent?: 'package_sent'): PackageFormInput {
  if (pkg) {
    return {
      items: pkg.items.map((i) => ({ name: i.name, qty: i.qty })),
      address: toAddressInput(pkg.address),
      courier: pkg.courier ?? '',
      tracking_number: pkg.tracking_number ?? '',
      status: pkg.status,
    }
  }
  return {
    items: [{ name: '', qty: 1 }],
    address: toAddressInput(influencer.address),
    courier: '',
    tracking_number: '',
    status: intent === 'package_sent' ? 'sent' : 'preparing',
  }
}

const ADDRESS_FIELDS = [
  { name: 'line1', label: 'Address line 1', span: 2 },
  { name: 'line2', label: 'Address line 2 (optional)', span: 2 },
  { name: 'city', label: 'City', span: 1 },
  { name: 'state', label: 'State', span: 1 },
  { name: 'postal_code', label: 'Postal code', span: 1 },
  { name: 'country', label: 'Country', span: 1 },
] as const

type SubmitValues = z.output<typeof packageSchema>

function FieldMessage({ error }: { error?: FieldError | { message?: string } }) {
  return error?.message ? <p className="text-xs text-destructive">{error.message}</p> : null
}

export function PackageDrawer({ influencer, pkg, open, onOpenChange, intent, onSaved }: PackageDrawerProps) {
  const createPackage = useCreatePackage()
  const updatePackage = useUpdatePackage()
  const changeStage = useChangeStage(influencer.id)
  const form = useForm({ resolver: zodResolver(packageSchema), defaultValues: defaults(influencer, pkg, intent) })
  const { register, control, handleSubmit, reset, setValue, formState } = form
  const items = useFieldArray({ control, name: 'items' })
  const errors = formState.errors
  const isEdit = !!pkg
  const busy = createPackage.isPending || updatePackage.isPending || changeStage.isPending

  useEffect(() => {
    if (open) reset(defaults(influencer, pkg, intent))
  }, [open, influencer, pkg, intent, reset])

  const tracking = useWatch({ control, name: 'tracking_number' })
  const [confirm, setConfirm] = useState<{ status: StageChangingStatus; values: SubmitValues } | null>(null)

  const onSubmit = handleSubmit((values) => {
    const status = values.status as PackageStatus
    if (isEdit && needsStatusConfirm(pkg?.status, status)) return setConfirm({ status, values })
    return save(values)
  })

  const save = async (values: SubmitValues) => {
    const body = {
      items: values.items,
      address: values.address,
      courier: values.courier,
      tracking_number: values.tracking_number,
      status: values.status as PackageStatus,
    }
    let saved: Package
    try {
      saved = pkg
        ? await updatePackage.mutateAsync({ id: pkg.id, body })
        : await createPackage.mutateAsync({ influencer_id: influencer.id, ...body })
    } catch (err) {
      toast.error(isEdit ? 'Couldn’t update the package' : 'Couldn’t create the package', {
        description: getErrorMessage(err),
      })
      return
    }
    onOpenChange(false)
    onSaved?.(saved)
    if (intent === 'package_sent') {
      try {
        await changeStage.mutateAsync({ to: 'package_sent' })
        toast.success(`Package created · ${influencer.name} moved to Package Sent`)
      } catch (err) {
        toast.warning('Package created, but the stage didn’t change', { description: getErrorMessage(err) })
      }
      return
    }
    toast.success(isEdit ? 'Package updated' : 'Package created')
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex h-full flex-col" noValidate>
          <SheetHeader className="border-b">
            <SheetTitle>{isEdit ? 'Edit package' : intent === 'package_sent' ? 'Ship a package' : 'Create package'}</SheetTitle>
            <SheetDescription>
              {influencer.name}
              {intent === 'package_sent' && ' · courier and tracking number are needed to move to Package Sent'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Items</h3>
              {items.fields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      aria-label={`Item ${index + 1} name`}
                      placeholder="e.g. Festive Kurta Set"
                      aria-invalid={!!errors.items?.[index]?.name}
                      {...register(`items.${index}.name`)}
                    />
                    <FieldMessage error={errors.items?.[index]?.name} />
                  </div>
                  <div className="w-20">
                    <Input
                      aria-label={`Item ${index + 1} quantity`}
                      type="number"
                      min={1}
                      aria-invalid={!!errors.items?.[index]?.qty}
                      {...register(`items.${index}.qty`)}
                    />
                    <FieldMessage error={errors.items?.[index]?.qty} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={items.fields.length === 1}
                    onClick={() => items.remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <FieldMessage error={errors.items?.root ?? (errors.items as FieldError | undefined)} />
              <Button type="button" variant="outline" size="sm" onClick={() => items.append({ name: '', qty: 1 })}>
                <Plus />
                Add item
              </Button>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Ship to</h3>
                {influencer.address && (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() => setValue('address', toAddressInput(influencer.address), { shouldValidate: true })}
                  >
                    Use profile address
                  </Button>
                )}
              </div>
              {!influencer.address && !isEdit && (
                <p className="text-xs text-muted-foreground">No address on the profile yet. Enter one for this package.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {ADDRESS_FIELDS.map(({ name, label, span }) => (
                  <div key={name} className={span === 2 ? 'col-span-2 grid gap-1' : 'grid gap-1'}>
                    <Label htmlFor={`pkg-${name}`} className="text-xs">
                      {label}
                    </Label>
                    <Input id={`pkg-${name}`} aria-invalid={!!errors.address?.[name]} {...register(`address.${name}`)} />
                    <FieldMessage error={errors.address?.[name]} />
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2">
              <h3 className="col-span-2 text-sm font-medium">Shipping</h3>
              <div className="grid gap-1">
                <Label htmlFor="pkg-status" className="text-xs">
                  Status
                </Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="pkg-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PACKAGE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {PACKAGE_STATUS_META[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pkg-courier" className="text-xs">
                  Courier
                </Label>
                <Input id="pkg-courier" list="pkg-couriers" aria-invalid={!!errors.courier} {...register('courier')} />
                <datalist id="pkg-couriers">
                  {COURIERS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <FieldMessage error={errors.courier} />
              </div>
              <div className="col-span-2 grid gap-1">
                <Label htmlFor="pkg-tracking" className="text-xs">
                  Tracking number
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="pkg-tracking"
                    className="font-mono"
                    aria-invalid={!!errors.tracking_number}
                    {...register('tracking_number')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy tracking number"
                    disabled={!tracking?.trim()}
                    onClick={() => copyToClipboard(tracking!.trim(), 'Tracking number copied')}
                  >
                    <Copy />
                  </Button>
                </div>
                <FieldMessage error={errors.tracking_number} />
              </div>
            </section>
          </div>

          <SheetFooter className="flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : isEdit ? 'Save changes' : intent === 'package_sent' ? 'Create & mark sent' : 'Create package'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
      <PackageStatusConfirm
        status={confirm?.status ?? null}
        influencerName={influencer.name}
        influencerStage={influencer.stage}
        pending={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          await save(confirm.values)
          setConfirm(null)
        }}
      />
    </Sheet>
  )
}
