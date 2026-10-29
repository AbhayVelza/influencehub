import { useQueries, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Download, FileUp, Loader2, RotateCcw, TriangleAlert, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCategories } from '@/hooks/use-categories'
import { useJob } from '@/hooks/use-job'
import { downloadCsv, parseCsv, toCsvText } from '@/lib/csv'
import {
  autoMatchColumns,
  IMPORT_FIELDS,
  mapImportRow,
  missingMappings,
  templateCsv,
  validateImportRow,
  type ImportField,
  type ValidatedImportRow,
} from '@/lib/csv-import'
import { formatNumber } from '@/lib/format'
import { queryKeys } from '@/lib/query'
import { cn } from '@/lib/utils'
import { ConfidenceBadge } from '@/features/duplicates/duplicate-warning'
import { getErrorMessage, importsApi } from '@/services'
import type { CsvColumnMapping, CsvDuplicatePolicy, CsvImportResult } from '@/types'
import { findDuplicates } from './queries'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 5000
const PREVIEW_ROWS = 20
const SKIP = '__skip'

interface ParsedFile {
  file: File
  headers: string[]
  rows: string[][]
}

function UploadStep({ onParsed }: { onParsed: (parsed: ParsedFile) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const read = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!/\.csv$/i.test(file.name)) return setError('Choose a .csv file')
    if (file.size > MAX_BYTES) return setError('The file is larger than 2 MB')
    const [header, ...rows] = parseCsv(await file.text())
    if (!header?.length) return setError('The file is empty')
    if (rows.length === 0) return setError('The file has a header row but no data rows')
    if (rows.length > MAX_ROWS) return setError(`At most ${formatNumber(MAX_ROWS)} rows per import`)
    onParsed({ file, headers: header.map((h) => h.trim()), rows })
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    void read(event.dataTransfer.files[0])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">Start from the template so columns match automatically.</span>
        <Button variant="outline" size="sm" onClick={() => downloadCsv('influencehub-import-template.csv', templateCsv())}>
          <Download />
          Download template
        </Button>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center',
          dragging && 'border-primary bg-primary/5',
        )}
      >
        <FileUp className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drop a CSV file here</p>
        <p className="text-xs text-muted-foreground">Up to 2 MB and {formatNumber(MAX_ROWS)} rows</p>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload />
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="CSV file"
          onChange={(e) => {
            void read(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** "Possible duplicate" flags for the previewed rows, from POST /duplicates/check. */
function useRowMatches(rows: ValidatedImportRow[]) {
  return useQueries({
    queries: rows.map((row) => {
      const body = {
        name: row.values.name ?? null,
        email: row.values.email ?? null,
        phone: row.values.phone ?? null,
        city: row.values.city ?? null,
        accounts: row.accounts,
      }
      return {
        queryKey: ['csv-duplicates', body],
        queryFn: () => findDuplicates(body),
        enabled: Object.keys(row.errors).length === 0,
        staleTime: 60_000,
      }
    }),
  })
}

function MatchCell({ matches }: { matches: Awaited<ReturnType<typeof findDuplicates>> | undefined }) {
  const top = matches?.[0]
  if (!top) return <span className="text-muted-foreground">—</span>
  return (
    <span className="block space-y-0.5" title={top.reasons.join(' · ')}>
      <span className="block truncate font-medium">{top.influencer?.name ?? 'A teammate’s creator'}</span>
      <ConfidenceBadge confidence={top.confidence} />
    </span>
  )
}

function MappingStep({
  parsed,
  onBack,
  onImport,
}: {
  parsed: ParsedFile
  onBack: () => void
  onImport: (options: { mapping: CsvColumnMapping; fetchProfiles: boolean; onDuplicate: CsvDuplicatePolicy }) => void
}) {
  const categories = useCategories()
  const [mapping, setMapping] = useState<CsvColumnMapping>(() => autoMatchColumns(parsed.headers))
  const [fetchProfiles, setFetchProfiles] = useState(true)
  const [onDuplicate, setOnDuplicate] = useState<CsvDuplicatePolicy>('skip')
  const categoryNames = useMemo(
    () => (categories.data?.items ?? []).filter((c) => c.is_active).map((c) => c.name),
    [categories.data],
  )

  const validated = useMemo(
    () => parsed.rows.map((row) => validateImportRow(mapImportRow(row, parsed.headers, mapping), categoryNames)),
    [parsed, mapping, categoryNames],
  )
  // Accounts repeated within the file: later rows are skipped as duplicates.
  const repeated = useMemo(() => {
    const seen = new Set<string>()
    return validated.map((v) => {
      const keys = v.accounts.map((a) => `${a.platform}:${a.handle}`)
      const dup = keys.some((k) => seen.has(k))
      keys.forEach((k) => seen.add(k))
      return dup
    })
  }, [validated])
  const invalidRows = validated.filter((v) => Object.keys(v.errors).length > 0).length
  const missingRequired = missingMappings(mapping)
  const shownFields = IMPORT_FIELDS.filter((f) => mapping[f.key])
  const previewRows = useMemo(() => validated.slice(0, PREVIEW_ROWS), [validated])
  const rowMatches = useRowMatches(previewRows)
  const flagged = rowMatches.filter((m) => m.data?.length).length

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          Match columns · <span className="font-normal text-muted-foreground">{parsed.file.name}</span>
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {IMPORT_FIELDS.map((field) => (
            <div key={field.key} className="grid grid-cols-[8rem_1fr] items-center gap-2">
              <Label htmlFor={`map-${field.key}`} className="text-xs">
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
                {field.handle && <span className="sr-only"> handle</span>}
              </Label>
              <Select
                value={mapping[field.key] ?? SKIP}
                onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === SKIP ? undefined : v }))}
              >
                <SelectTrigger id={`map-${field.key}`} size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SKIP}>— Don’t import —</SelectItem>
                  {parsed.headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">One column per platform; map at least one of them.</p>
        {missingRequired.length > 0 && (
          <p role="alert" className="text-xs text-destructive">
            Match a column for {missingRequired.join(' and ')}.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Preview · first {Math.min(PREVIEW_ROWS, parsed.rows.length)} rows</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(parsed.rows.length)} rows ·{' '}
            <span className={cn(invalidRows > 0 && 'font-medium text-destructive')}>
              {formatNumber(invalidRows)} with errors (won’t import)
            </span>
            {flagged > 0 && <> · {formatNumber(flagged)} may match existing creators</>}
          </p>
        </div>
        <div className="max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Row</th>
                {shownFields.map((f) => (
                  <th key={f.key} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Possible duplicate</th>
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, PREVIEW_ROWS).map((row, i) => {
                const raw = mapImportRow(row, parsed.headers, mapping)
                const { errors, warnings } = validated[i]!
                return (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1 align-top text-muted-foreground tabular-nums">
                      {i + 2}
                      {repeated[i] && (
                        <span className="ml-1 rounded bg-muted px-1" title="Same account earlier in the file">
                          dup
                        </span>
                      )}
                      {errors.accounts && (
                        <span className="mt-0.5 flex items-start gap-1 text-[11px] leading-tight text-destructive">
                          <CircleAlert className="mt-px size-3 shrink-0" />
                          {errors.accounts}
                        </span>
                      )}
                    </td>
                    {shownFields.map((f) => {
                      const key = f.key as ImportField
                      const error = errors[key]
                      const warning = warnings[key]
                      return (
                        <td
                          key={f.key}
                          className={cn(
                            'max-w-40 px-2 py-1 align-top',
                            error && 'bg-destructive/10 text-destructive',
                            !error && warning && 'bg-amber-50 dark:bg-amber-400/10',
                          )}
                        >
                          <span className="block truncate" title={raw[key]}>
                            {raw[key] ?? <span className="text-muted-foreground">—</span>}
                          </span>
                          {(error || warning) && (
                            <span className="mt-0.5 flex items-start gap-1 text-[11px] leading-tight">
                              {error ? <CircleAlert className="mt-px size-3 shrink-0" /> : <TriangleAlert className="mt-px size-3 shrink-0 text-amber-600" />}
                              {error ?? warning}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="max-w-44 px-2 py-1 align-top">
                      <MatchCell matches={rowMatches[i]?.data} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-md border p-3">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={fetchProfiles} onCheckedChange={(v) => setFetchProfiles(!!v)} className="mt-0.5" />
          <span>
            Fetch public profiles for imported rows
            <span className="block text-xs text-muted-foreground">
              Instagram, YouTube, Threads and Facebook Page stats. TikTok and Pinterest wait for a connect link.
            </span>
          </span>
        </label>
        <fieldset className="space-y-1">
          <legend className="text-sm">If an account is already in the CRM</legend>
          <div role="radiogroup" className="flex gap-4 text-sm">
            {(['skip', 'update'] as const).map((policy) => (
              <label key={policy} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="on-duplicate"
                  value={policy}
                  checked={onDuplicate === policy}
                  onChange={() => setOnDuplicate(policy)}
                  className="accent-primary"
                />
                {policy === 'skip' ? 'Skip it' : 'Update it with the file’s values'}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Choose another file
        </Button>
        <Button
          disabled={missingRequired.length > 0 || invalidRows === parsed.rows.length}
          onClick={() => onImport({ mapping, fetchProfiles, onDuplicate })}
        >
          Import {formatNumber(parsed.rows.length - invalidRows)} rows
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <div className="rounded-md border p-3">
      <div className={cn('text-xl font-semibold tabular-nums', tone === 'bad' && value > 0 && 'text-destructive')}>
        {formatNumber(value)}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function Summary({ result, onDone, onAgain }: { result: CsvImportResult; onDone: () => void; onAgain: () => void }) {
  const navigate = useNavigate()
  const report = () =>
    downloadCsv(
      'influencehub-import-errors.csv',
      toCsvText(
        ['row', 'handle', 'error'],
        result.errors.map((e) => [e.row, e.handle ?? '', e.message]),
      ),
    )

  return (
    <div className="space-y-4" aria-live="polite">
      <p className="font-medium">Import finished · {formatNumber(result.total_rows)} rows</p>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Created" value={result.created} />
        <Stat label="Updated" value={result.updated} />
        <Stat label="Duplicates skipped" value={result.duplicates} />
        <Stat label="Failed" value={result.failed} tone="bad" />
      </div>
      {result.profiles && (
        <p className="text-sm text-muted-foreground">
          Profiles: {formatNumber(result.profiles.synced)} accounts synced, {formatNumber(result.profiles.failed)} couldn’t be
          fetched (personal, not found or rate limited).
        </p>
      )}
      {result.errors.length > 0 && (
        <div className="space-y-2">
          <div className="max-h-40 overflow-auto rounded-md border text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Row</th>
                  <th className="px-2 py-1 text-left font-medium">Handle</th>
                  <th className="px-2 py-1 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.slice(0, 50).map((e) => (
                  <tr key={e.row} className="border-t">
                    <td className="px-2 py-1 tabular-nums">{e.row}</td>
                    <td className="px-2 py-1">{e.handle ?? '—'}</td>
                    <td className="px-2 py-1">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={report}>
            <Download />
            Download error report
          </Button>
        </div>
      )}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onAgain}>
          <RotateCcw />
          Import another file
        </Button>
        <Button
          onClick={() => {
            onDone()
            navigate('/influencers?sort=-created_at')
          }}
        >
          View influencers
        </Button>
      </div>
    </div>
  )
}

export function CsvTab({ onDone, onBusyChange }: { onDone: () => void; onBusyChange: (busy: boolean) => void }) {
  const queryClient = useQueryClient()
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const job = useJob<CsvImportResult>(jobId)
  const status = job.data?.status
  const finished = status === 'succeeded' || status === 'failed'
  const running = starting || (jobId !== null && !finished)

  useEffect(() => onBusyChange(running), [running, onBusyChange])
  // New rows exist once the job ends: refresh lists and counts.
  useEffect(() => {
    if (status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.influencers })
      void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    }
  }, [status, queryClient])

  const start = async (options: { mapping: CsvColumnMapping; fetchProfiles: boolean; onDuplicate: CsvDuplicatePolicy }) => {
    if (!parsed) return
    setStarting(true)
    try {
      const { upload_url, key } = await importsApi.presignCsv(parsed.file.name)
      await importsApi.uploadToPresignedUrl(upload_url, parsed.file)
      const { job_id } = await importsApi.startCsvImport({
        key,
        mapping: options.mapping,
        fetch_profiles: options.fetchProfiles,
        on_duplicate: options.onDuplicate,
      })
      setJobId(job_id)
    } catch (err) {
      toast.error('Couldn’t start the import', { description: getErrorMessage(err) })
    } finally {
      setStarting(false)
    }
  }

  const again = () => {
    setParsed(null)
    setJobId(null)
  }

  if (status === 'succeeded' && job.data?.result) return <Summary result={job.data.result} onDone={onDone} onAgain={again} />
  if (status === 'failed') {
    return (
      <div role="alert" className="space-y-3">
        <p className="font-medium text-destructive">The import failed</p>
        <p className="text-sm text-muted-foreground">{job.data?.error?.message ?? 'Something went wrong.'} Nothing was imported.</p>
        <Button variant="outline" onClick={again}>
          Try again
        </Button>
      </div>
    )
  }
  if (running) {
    return (
      <div className="space-y-2 py-6" aria-live="polite">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {starting ? 'Uploading the file…' : `Importing ${parsed ? formatNumber(parsed.rows.length) : ''} rows… ${job.data?.progress ?? 0}%`}
        </div>
        <Progress value={starting ? 5 : (job.data?.progress ?? 0)} aria-label="Import progress" />
        <p className="text-xs text-muted-foreground">Keep this window open until the import finishes.</p>
      </div>
    )
  }
  if (!parsed) return <UploadStep onParsed={setParsed} />
  return <MappingStep parsed={parsed} onBack={() => setParsed(null)} onImport={start} />
}
