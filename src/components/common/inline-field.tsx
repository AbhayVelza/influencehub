import { Check, Loader2, Pencil, X } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { validateField } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'

interface InlineFieldBaseProps {
  label: string
  /** Current value as text ('' when empty). */
  value: string | null
  render?: (value: string) => ReactNode
  placeholder?: string
  disabled?: boolean
  className?: string
}

interface InlineTextFieldProps<T extends z.ZodType> extends InlineFieldBaseProps {
  /** Same schema the forms use; its output is what gets saved. */
  schema: T
  onSave: (value: z.output<T>) => Promise<unknown>
  multiline?: boolean
  inputType?: 'text' | 'tel' | 'email'
}

function FieldShell({
  label,
  labelId,
  children,
  className,
}: {
  label: string
  labelId: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-[7.5rem_1fr] items-start gap-3 py-1.5', className)}>
      <dt id={labelId} className="pt-1.5 text-sm text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function DisplayValue({
  value,
  render,
  placeholder,
  disabled,
  label,
  onEdit,
}: {
  value: string | null
  render?: (value: string) => ReactNode
  placeholder?: string
  disabled?: boolean
  label: string
  onEdit: () => void
}) {
  return (
    <div className="group flex min-h-8 items-center gap-1">
      <div className="min-w-0 py-1 text-sm break-words whitespace-pre-wrap">
        {value ? (render ? render(value) : value) : <span className="text-muted-foreground">{placeholder ?? '—'}</span>}
      </div>
      {!disabled && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
      )}
    </div>
  )
}

/** Click-to-edit text. Enter saves (Ctrl/⌘+Enter when multiline), Escape cancels. */
export function InlineTextField<T extends z.ZodType>({
  label,
  value,
  render,
  placeholder,
  disabled,
  className,
  schema,
  onSave,
  multiline,
  inputType = 'text',
}: InlineTextFieldProps<T>) {
  const labelId = useId()
  const errorId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const start = () => {
    setDraft(value ?? '')
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    const result = validateField(schema, draft)
    if (!result.ok) return setError(result.error)
    if ((result.value ?? '') === (value ?? '')) return setEditing(false)
    setSaving(true)
    try {
      await onSave(result.value)
      setEditing(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setEditing(false)
    }
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void save()
    }
  }

  if (!editing) {
    return (
      <FieldShell label={label} labelId={labelId} className={className}>
        <DisplayValue value={value} render={render} placeholder={placeholder} disabled={disabled} label={label} onEdit={start} />
      </FieldShell>
    )
  }

  const shared = {
    autoFocus: true,
    value: draft,
    // Read-only rather than disabled while saving: disabling drops focus, so after a failed save
    // the user couldn't keep typing or press Escape.
    readOnly: saving,
    'aria-busy': saving,
    'aria-labelledby': labelId,
    'aria-invalid': !!error,
    'aria-describedby': error ? errorId : undefined,
    onKeyDown,
  }

  return (
    <FieldShell label={label} labelId={labelId} className={className}>
      <div className="space-y-1">
        <div className="flex items-start gap-1">
          {multiline ? (
            <Textarea rows={4} {...shared} onChange={(e) => setDraft(e.target.value)} />
          ) : (
            <Input type={inputType} {...shared} onChange={(e) => setDraft(e.target.value)} />
          )}
          <Button size="icon" variant="ghost" aria-label="Save" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)} disabled={saving}>
            <X />
          </Button>
        </div>
        {error && (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        )}
        {multiline && !error && <p className="text-xs text-muted-foreground">Ctrl + Enter to save · Esc to cancel</p>}
      </div>
    </FieldShell>
  )
}

interface InlineSelectFieldProps<T extends z.ZodType> extends InlineFieldBaseProps {
  options: { value: string; label: string }[]
  schema: T
  onSave: (value: z.output<T>) => Promise<unknown>
}

/** Click-to-edit choice; saves as soon as an option is picked. */
export function InlineSelectField<T extends z.ZodType>({
  label,
  value,
  render,
  placeholder,
  disabled,
  className,
  options,
  schema,
  onSave,
}: InlineSelectFieldProps<T>) {
  const labelId = useId()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const pick = async (next: string) => {
    const result = validateField(schema, next)
    if (!result.ok) return setError(result.error)
    if (next === value) return setEditing(false)
    setSaving(true)
    try {
      await onSave(result.value)
      setEditing(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <FieldShell label={label} labelId={labelId} className={className}>
        <DisplayValue
          value={value}
          render={render}
          placeholder={placeholder}
          disabled={disabled}
          label={label}
          onEdit={() => {
            setError(null)
            setEditing(true)
          }}
        />
      </FieldShell>
    )
  }

  return (
    <FieldShell label={label} labelId={labelId} className={className}>
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Select
            defaultOpen
            value={value ?? undefined}
            onValueChange={pick}
            onOpenChange={(open) => !open && !saving && setEditing(false)}
            disabled={saving}
          >
            <SelectTrigger className="w-full" aria-labelledby={labelId}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </FieldShell>
  )
}
