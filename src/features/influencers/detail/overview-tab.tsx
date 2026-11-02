import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { InlineSelectField, InlineTextField } from '@/components/common/inline-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCategories } from '@/hooks/use-categories'
import { useCan } from '@/hooks/use-me'
import { addressSchema, fieldSchemas, MAX_TAGS, validateField } from '@/lib/schemas'
import { getErrorMessage } from '@/services'
import type { Address, Influencer, InfluencerUpdate, OnboardingChecklist } from '@/types'
import { useUpdateInfluencer } from '../detail-queries'

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const ADDRESS_FIELDS = [
  { name: 'line1', label: 'Line 1', span: 2 },
  { name: 'line2', label: 'Line 2 (optional)', span: 2 },
  { name: 'city', label: 'City', span: 1 },
  { name: 'state', label: 'State', span: 1 },
  { name: 'postal_code', label: 'Postal code', span: 1 },
  { name: 'country', label: 'Country', span: 1 },
] as const

function AddressEditor({
  address,
  onSave,
  onCancel,
}: {
  address: Address | null
  onSave: (address: Address) => Promise<unknown>
  onCancel: () => void
}) {
  const form = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? { ...address, line2: address.line2 ?? '' }
      : { line1: '', line2: '', city: '', state: '', postal_code: '', country: 'India' },
  })
  const { register, handleSubmit, formState } = form

  const onSubmit = handleSubmit(async (values) => {
    try {
      await onSave(values)
    } catch (err) {
      toast.error('Couldn’t save the address', { description: getErrorMessage(err) })
    }
  })

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 gap-2" noValidate aria-label="Edit address">
      {ADDRESS_FIELDS.map(({ name, label, span }) => (
        <div key={name} className={span === 2 ? 'col-span-2 grid gap-1' : 'grid gap-1'}>
          <Label htmlFor={`addr-${name}`} className="text-xs">
            {label}
          </Label>
          <Input id={`addr-${name}`} aria-invalid={!!formState.errors[name]} {...register(name)} />
          {formState.errors[name] && <p className="text-xs text-destructive">{formState.errors[name]?.message}</p>}
        </div>
      ))}
      <div className="col-span-2 flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={formState.isSubmitting}>
          Save address
        </Button>
      </div>
    </form>
  )
}

function TagsEditor({
  tags,
  disabled,
  onChange,
}: {
  tags: string[]
  disabled: boolean
  onChange: (tags: string[]) => Promise<unknown>
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const result = validateField(fieldSchemas.tag, draft)
    if (!result.ok) return setError(result.error)
    if (tags.includes(result.value)) return setError('Already tagged')
    if (tags.length >= MAX_TAGS) return setError(`At most ${MAX_TAGS} tags`)
    try {
      await onChange([...tags, result.value])
      setDraft('')
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
        {tags.length === 0 && <li className="text-sm text-muted-foreground">No tags yet</li>}
        {tags.map((tag) => (
          <li key={tag} className="inline-flex h-6 items-center gap-1 rounded-full border bg-muted/60 pr-0.5 pl-2.5 text-xs">
            {tag}
            {!disabled && (
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onChange(tags.filter((t) => t !== tag)).catch((err) => setError(getErrorMessage(err)))}
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            placeholder="Add a tag"
            aria-label="New tag"
            aria-invalid={!!error}
            className="h-7 max-w-48 text-xs"
          />
          <Button type="submit" variant="outline" size="sm" disabled={!draft.trim()}>
            <Plus />
            Add
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

const CHECKLIST: { key: keyof OnboardingChecklist; label: string }[] = [
  { key: 'called', label: 'Called' },
  { key: 'agreement_signed', label: 'Agreement signed' },
  { key: 'insights_received', label: 'Insights received' },
  { key: 'address_collected', label: 'Address collected' },
  { key: 'ig_connected', label: 'Instagram connected' },
]

export function OverviewTab({ influencer }: { influencer: Influencer }) {
  const update = useUpdateInfluencer(influencer.id)
  const canEdit = useCan('influencer:edit')
  const categories = useCategories()
  const [editingAddress, setEditingAddress] = useState(false)

  const save = (body: InfluencerUpdate) => update.mutateAsync(body)
  const categoryOptions = (categories.data?.items ?? [])
    .filter((c) => c.is_active || c.name === influencer.category)
    .map((c) => ({ value: c.name, label: c.name }))
  const done = CHECKLIST.filter((c) => influencer.onboarding_checklist[c.key]).length
  const address = influencer.address

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Contact">
        <dl>
          <InlineTextField label="Name" value={influencer.name} schema={fieldSchemas.name} onSave={(name) => save({ name })} disabled={!canEdit} />
          <InlineTextField
            label="Phone"
            inputType="tel"
            value={influencer.phone}
            placeholder="Add phone"
            schema={fieldSchemas.phone}
            onSave={(phone) => save({ phone })}
            disabled={!canEdit}
            render={(v) => (
              <a href={`tel:${v}`} className="hover:underline">
                {v}
              </a>
            )}
          />
          <InlineTextField
            label="Email"
            inputType="email"
            value={influencer.email}
            placeholder="Add email"
            schema={fieldSchemas.email}
            onSave={(email) => save({ email })}
            disabled={!canEdit}
            render={(v) => (
              <a href={`mailto:${v}`} className="hover:underline">
                {v}
              </a>
            )}
          />
          <InlineSelectField
            label="Category"
            value={influencer.category}
            options={categoryOptions}
            schema={fieldSchemas.category}
            onSave={(category) => save({ category })}
            disabled={!canEdit}
          />
        </dl>
      </Section>

      <Section title="Location">
        <dl>
          <InlineTextField label="City" value={influencer.city} placeholder="Add city" schema={fieldSchemas.city} onSave={(city) => save({ city })} disabled={!canEdit} />
          <InlineTextField label="State" value={influencer.state} placeholder="Add state" schema={fieldSchemas.state} onSave={(state) => save({ state })} disabled={!canEdit} />
          <InlineTextField
            label="Country"
            value={influencer.country}
            placeholder="Add country"
            schema={fieldSchemas.country}
            onSave={(country) => save({ country })}
            disabled={!canEdit}
          />
        </dl>
      </Section>

      <Section
        title="Shipping address"
        action={
          canEdit &&
          !editingAddress && (
            <Button variant="ghost" size="xs" onClick={() => setEditingAddress(true)}>
              <Pencil />
              {address ? 'Edit' : 'Add'}
            </Button>
          )
        }
      >
        {editingAddress ? (
          <AddressEditor
            address={address}
            onCancel={() => setEditingAddress(false)}
            onSave={async (next) => {
              await save({ address: next })
              setEditingAddress(false)
              toast.success('Address saved')
            }}
          />
        ) : address ? (
          <address className="text-sm leading-relaxed not-italic">
            {address.line1}
            {address.line2 && (
              <>
                <br />
                {address.line2}
              </>
            )}
            <br />
            {address.city}, {address.state} {address.postal_code}
            <br />
            {address.country}
          </address>
        ) : (
          <p className="text-sm text-muted-foreground">No address yet. Needed before sending a package.</p>
        )}
      </Section>

      <Section title={`Onboarding checklist · ${done}/${CHECKLIST.length}`}>
        <ul className="space-y-2">
          {CHECKLIST.map(({ key, label }) => (
            <li key={key}>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={influencer.onboarding_checklist[key]}
                  disabled={!canEdit || update.isPending}
                  onCheckedChange={(value) =>
                    save({ onboarding_checklist: { ...influencer.onboarding_checklist, [key]: !!value } }).catch((err) =>
                      toast.error('Couldn’t update the checklist', { description: getErrorMessage(err) }),
                    )
                  }
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tags">
        <TagsEditor tags={influencer.tags} disabled={!canEdit} onChange={(tags) => save({ tags })} />
      </Section>

      <Section title="Notes">
        <dl>
          <InlineTextField
            label="Notes"
            className="grid-cols-1 [&>dt]:sr-only"
            multiline
            value={influencer.notes}
            placeholder="Add notes"
            schema={fieldSchemas.notes}
            onSave={(notes) => save({ notes })}
            disabled={!canEdit}
          />
        </dl>
      </Section>
    </div>
  )
}
