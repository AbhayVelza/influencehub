import { zodResolver } from '@hookform/resolvers/zod'
import { FileUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { DateInput } from '@/components/common/date-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DOCUMENT_ACCEPT, DOCUMENT_FILE_HINT, DOCUMENT_TYPE_META, formatFileSize, validateDocumentFile } from '@/lib/documents'
import { formatDate } from '@/lib/format'
import { PLATFORM_META, PLATFORMS } from '@/lib/platforms'
import { agreementFormSchema, insightsFormSchema, type AgreementFormInput, type InsightsFormInput } from '@/lib/schemas'
import { getErrorMessage } from '@/services'
import type { DocumentType, Influencer, InfluencerDocument, Platform } from '@/types'
import { useUploadDocument } from './queries'

export type UploadTarget = Pick<Influencer, 'id' | 'name'> & { accounts?: { platform: Platform }[] }

interface DocumentUploadDialogProps {
  influencer: UploadTarget | null
  type: DocumentType
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded?: (doc: InfluencerDocument) => void
}

const ANY_PLATFORM = 'any'
const today = () => formatDate(new Date().toISOString())
const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '')

/** The file, its checks (before anything is uploaded) and the three-step upload with progress. */
function useUploader(influencerId: string, onDone: (doc: InfluencerDocument) => void) {
  const upload = useUploadDocument()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const choose = (next: File | null): boolean => {
    setProgress(0)
    const checked = next ? validateDocumentFile(next) : null
    if (next && checked && !checked.ok) {
      setFile(null)
      setFileError(checked.error)
      return false
    }
    setFile(next)
    setFileError(null)
    return !!next
  }

  const submit = async (metadata: UploadMetadata) => {
    const checked = file ? validateDocumentFile(file) : null
    if (!file || !checked?.ok) {
      setFileError(file && checked && !checked.ok ? checked.error : 'Choose a file to upload')
      return
    }
    setProgress(0)
    try {
      const doc = await upload.mutateAsync({ influencerId, file, contentType: checked.contentType, metadata, onProgress: setProgress })
      onDone(doc)
    } catch (err) {
      toast.error('Couldn’t upload the document', { description: getErrorMessage(err) })
    }
  }

  return { file, fileError, progress, busy: upload.isPending, choose, submit }
}

type UploadMetadata = Parameters<ReturnType<typeof useUploadDocument>['mutateAsync']>[0]['metadata']

function FileField({
  uploader,
  onChosen,
}: {
  uploader: ReturnType<typeof useUploader>
  onChosen: (file: File) => void
}) {
  const { file, fileError, progress, busy, choose } = uploader
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="document-file">File</Label>
      <Input
        id="document-file"
        type="file"
        accept={DOCUMENT_ACCEPT}
        disabled={busy}
        aria-invalid={!!fileError}
        aria-describedby="document-file-hint"
        onChange={(e) => {
          const next = e.target.files?.[0] ?? null
          if (choose(next) && next) onChosen(next)
          // A rejected file must not stay in the input.
          else e.target.value = ''
        }}
      />
      <p id="document-file-hint" className="text-xs text-muted-foreground">
        {file ? `${file.name} · ${formatFileSize(file.size)}` : DOCUMENT_FILE_HINT}
      </p>
      {fileError && (
        <p role="alert" className="text-xs text-destructive">
          {fileError}
        </p>
      )}
      {busy && (
        <div className="space-y-1" aria-live="polite">
          <Progress value={progress} aria-label="Upload progress" />
          <p className="text-xs text-muted-foreground">{progress < 100 ? `Uploading… ${progress}%` : 'Saving…'}</p>
        </div>
      )}
    </div>
  )
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function InsightsForm({ influencer, onDone, onCancel }: { influencer: UploadTarget; onDone: (doc: InfluencerDocument) => void; onCancel: () => void }) {
  const uploader = useUploader(influencer.id, onDone)
  const form = useForm({
    resolver: zodResolver(insightsFormSchema),
    defaultValues: { title: '', period_start: '', period_end: '', platform: '', notes: '' } satisfies InsightsFormInput,
  })
  const { register, control, handleSubmit, getValues, setValue, formState } = form
  const { errors } = formState
  const platforms = influencer.accounts?.length ? [...new Set(influencer.accounts.map((a) => a.platform))] : PLATFORMS

  const onSubmit = handleSubmit((values) =>
    uploader.submit({
      type: 'insights_summary',
      title: values.title,
      period_start: values.period_start,
      period_end: values.period_end,
      platform: values.platform,
      notes: values.notes,
    }),
  )

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FileField
        uploader={uploader}
        // The title defaults to the file's name.
        onChosen={(file) => {
          if (!getValues('title')) setValue('title', baseName(file.name))
        }}
      />
      <Field id="doc-title" label="Title" error={errors.title?.message}>
        <Input id="doc-title" placeholder="e.g. Instagram insights · Sep 2026" aria-invalid={!!errors.title} {...register('title')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="doc-period-start" label="Period start" error={errors.period_start?.message}>
          <DateInput id="doc-period-start" aria-invalid={!!errors.period_start} {...register('period_start')} />
        </Field>
        <Field id="doc-period-end" label="Period end" error={errors.period_end?.message}>
          <DateInput id="doc-period-end" aria-invalid={!!errors.period_end} {...register('period_end')} />
        </Field>
      </div>
      <Field id="doc-platform" label="Platform" hint="(optional)">
        <Controller
          control={control}
          name="platform"
          render={({ field }) => (
            <Select value={field.value || ANY_PLATFORM} onValueChange={(v) => field.onChange(v === ANY_PLATFORM ? '' : v)}>
              <SelectTrigger id="doc-platform" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_PLATFORM}>All platforms</SelectItem>
                {platforms.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLATFORM_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field id="doc-notes" label="Notes" hint="(optional)" error={errors.notes?.message}>
        <Textarea id="doc-notes" rows={2} {...register('notes')} />
      </Field>
      <Footer busy={uploader.busy} onCancel={onCancel} />
    </form>
  )
}

function AgreementForm({ influencer, onDone, onCancel }: { influencer: UploadTarget; onDone: (doc: InfluencerDocument) => void; onCancel: () => void }) {
  const uploader = useUploader(influencer.id, onDone)
  const form = useForm({
    resolver: zodResolver(agreementFormSchema),
    defaultValues: {
      title: `Collaboration agreement ${today().slice(-4)}`,
      signed_on: today(),
      valid_until: '',
      notes: '',
    } satisfies AgreementFormInput,
  })
  const { register, handleSubmit, formState } = form
  const { errors } = formState

  const onSubmit = handleSubmit((values) =>
    uploader.submit({
      type: 'agreement',
      title: values.title,
      signed_on: values.signed_on,
      valid_until: values.valid_until,
      notes: values.notes,
    }),
  )

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FileField uploader={uploader} onChosen={() => {}} />
      <Field id="doc-title" label="Title" error={errors.title?.message}>
        <Input id="doc-title" aria-invalid={!!errors.title} {...register('title')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="doc-signed-on" label="Signed on" error={errors.signed_on?.message}>
          <DateInput id="doc-signed-on" aria-invalid={!!errors.signed_on} {...register('signed_on')} />
        </Field>
        <Field id="doc-valid-until" label="Valid until" hint="(optional)" error={errors.valid_until?.message}>
          <DateInput id="doc-valid-until" aria-invalid={!!errors.valid_until} {...register('valid_until')} />
        </Field>
      </div>
      <Field id="doc-notes" label="Notes" hint="(optional)" error={errors.notes?.message}>
        <Textarea id="doc-notes" rows={2} {...register('notes')} />
      </Field>
      <p className="text-xs text-muted-foreground">This becomes the current agreement. Earlier versions are kept as history.</p>
      <Footer busy={uploader.busy} onCancel={onCancel} />
    </form>
  )
}

function Footer({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        <FileUp />
        {busy ? 'Uploading…' : 'Upload'}
      </Button>
    </DialogFooter>
  )
}

/** Upload one insights summary or agreement: pick the file, fill in its details, watch the progress. */
export function DocumentUploadDialog({ influencer, type, open, onOpenChange, onUploaded }: DocumentUploadDialogProps) {
  const label = DOCUMENT_TYPE_META[type].label
  const done = (doc: InfluencerDocument) => {
    toast.success(`${label} uploaded`, { description: doc.title })
    onOpenChange(false)
    onUploaded?.(doc)
  }

  return (
    <Dialog open={open && !!influencer} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload {label.toLowerCase()}</DialogTitle>
          <DialogDescription>{influencer?.name}</DialogDescription>
        </DialogHeader>
        {influencer &&
          (type === 'agreement' ? (
            <AgreementForm influencer={influencer} onDone={done} onCancel={() => onOpenChange(false)} />
          ) : (
            <InsightsForm influencer={influencer} onDone={done} onCancel={() => onOpenChange(false)} />
          ))}
      </DialogContent>
    </Dialog>
  )
}
