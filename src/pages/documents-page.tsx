import { CalendarDays, ChartColumn, ChevronDown, FileImage, FileSpreadsheet, FileText, Handshake, SearchX, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DateRangeFilter } from '@/components/common/date-range-filter'
import { CollapsibleFilters } from '@/components/common/collapsible-filters'
import { MultiSelectFilter } from '@/components/common/multi-select-filter'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/common/pagination'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel } from '@/components/common/platform-badge'
import { RelativeTime } from '@/components/common/relative-time'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AgreementBadges, DocumentButtons, DocumentTypeBadge } from '@/features/documents/document-parts'
import { DocumentUploadDialog } from '@/features/documents/document-upload-dialog'
import { useDocuments } from '@/features/documents/queries'
import { useDocumentActions } from '@/features/documents/use-document-actions'
import { ListSearch } from '@/features/influencers/list-search'
import { InfluencerPicker } from '@/features/packages/influencer-picker'
import { useCan } from '@/hooks/use-me'
import { useTeam, useTeamMap } from '@/hooks/use-team'
import { DOCUMENT_TYPE_META, DOCUMENT_TYPES, documentDetail, formatFileSize } from '@/lib/documents'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DocumentListParams, DocumentType, Influencer, InfluencerDocument } from '@/types'

const TYPE_ICON: Record<DocumentType, typeof FileText> = { insights_summary: ChartColumn, agreement: Handshake }

/** The glyph beside a file name: red for PDFs, as in the reference. */
function FileGlyph({ contentType }: { contentType: InfluencerDocument['content_type'] }) {
  const cls = 'size-[18px] shrink-0'
  if (contentType === 'application/pdf') return <FileText aria-hidden className={cn(cls, 'text-error')} strokeWidth={1.75} />
  if (contentType.startsWith('image/')) return <FileImage aria-hidden className={cn(cls, 'text-on-tertiary-container')} strokeWidth={1.75} />
  if (contentType.includes('spreadsheet')) return <FileSpreadsheet aria-hidden className={cn(cls, 'text-muted-foreground')} strokeWidth={1.75} />
  return <FileText aria-hidden className={cn(cls, 'text-muted-foreground')} strokeWidth={1.75} />
}

const PAGE_SIZE = 25

function readParams(sp: URLSearchParams): DocumentListParams & { page: number } {
  return {
    type: sp.getAll('type').filter((t): t is DocumentType => DOCUMENT_TYPES.includes(t as DocumentType)),
    q: sp.get('q') || undefined,
    uploaded_by: sp.getAll('uploaded_by'),
    uploaded_from: sp.get('uploaded_from') || undefined,
    uploaded_to: sp.get('uploaded_to') || undefined,
    page: Math.max(1, Number(sp.get('page')) || 1),
  }
}

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = readParams(searchParams)
  const query = useDocuments({ ...params, page_size: PAGE_SIZE })
  const team = useTeam()
  const teamMap = useTeamMap()
  const canUpload = useCan('document:upload')
  const { actions, dialogs } = useDocumentActions()
  // Upload from here: pick the creator first, then fill in the details.
  const [pickType, setPickType] = useState<DocumentType | null>(null)
  const [target, setTarget] = useState<{ influencer: Influencer; type: DocumentType; open: boolean } | null>(null)

  const update = (patch: Partial<Record<'q' | 'uploaded_from' | 'uploaded_to', string | undefined>> & { type?: string[]; uploaded_by?: string[]; page?: number }) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key)
        if (Array.isArray(value)) value.forEach((v) => next.append(key, v))
        else if (value !== undefined && value !== '' && !(key === 'page' && value === 1)) next.set(key, String(value))
      }
      if (!('page' in patch)) next.delete('page')
      return next
    })

  const filtered = !!(params.type?.length || params.q || params.uploaded_by?.length || params.uploaded_from || params.uploaded_to)
  const COLUMNS = 8

  return (
    <div className="space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader
        title="Documents"
        count={
          query.data && (
            <>
              <span className="sr-only">(</span>
              {formatNumber(query.data.total)}
              <span className="sr-only">)</span>
            </>
          )
        }
        description="Insights summaries and agreements for the influencers you can see."
        actions={
          canUpload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="shadow-md">
                  <Upload className="size-[17px]" />
                  Upload
                  <ChevronDown className="opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1.5">
                {DOCUMENT_TYPES.map((type) => {
                  const Icon = TYPE_ICON[type]
                  return (
                    <DropdownMenuItem key={type} onSelect={() => setPickType(type)} className="gap-2.5 rounded-xl px-3 py-2 text-label-md">
                      <Icon className="size-[18px] text-on-tertiary-container" strokeWidth={1.75} />
                      {DOCUMENT_TYPE_META[type].label}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-space-sm rounded-2xl bg-surface-container-lowest/70 p-space-sm shadow-sm backdrop-blur-2xl">
        <ListSearch
          value={params.q}
          onChange={(q) => update({ q })}
          placeholder="Search creator name or handle…"
          label="Search creators"
          className="max-w-none min-w-48 flex-1"
        />
        <CollapsibleFilters
          activeCount={(params.type?.length ? 1 : 0) + (params.uploaded_by?.length ? 1 : 0) + (params.uploaded_from || params.uploaded_to ? 1 : 0)}
          actions={
            filtered && (
              <Button variant="link" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
                Clear all
              </Button>
            )
          }
        >
          <MultiSelectFilter
            label="Type"
            options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_META[t].label }))}
            selected={params.type ?? []}
            onChange={(type) => update({ type })}
          />
          <MultiSelectFilter
            label="Uploaded by"
            options={(team.data?.items ?? []).map((u) => ({ value: u.id, label: u.name }))}
            selected={params.uploaded_by ?? []}
            onChange={(uploaded_by) => update({ uploaded_by })}
            loading={team.isLoading}
            searchPlaceholder="Search team…"
          />
          <DateRangeFilter
            label="Uploaded"
            value={{ from: params.uploaded_from, to: params.uploaded_to }}
            onChange={({ from, to }) => update({ uploaded_from: from, uploaded_to: to })}
          />
        </CollapsibleFilters>
      </div>

      <div className="overflow-hidden rounded-[20px] bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl">
        {query.data && query.data.items.length > 0 && (
          <div className="flex items-center gap-2 bg-surface-container-lowest/40 px-4 py-3 sm:px-space-lg">
            <span className="text-label-sm tracking-wider text-muted-foreground uppercase">Showing</span>
            <span className="text-label-md font-semibold text-primary tabular-nums">
              {formatNumber(query.data.items.length)} of {formatNumber(query.data.total)} documents
            </span>
          </div>
        )}
        <div className="@container overflow-x-auto">
          <Table className={cn(query.isPlaceholderData && 'opacity-60')}>
            <TableHeader>
              <TableRow>
                <TableHead className="px-space-md">Creator</TableHead>
                <TableHead className="px-space-md">Document type</TableHead>
                <TableHead className="px-space-md">Period / signed</TableHead>
                <TableHead className="px-space-md">File name &amp; size</TableHead>
                <TableHead className="px-space-md">Uploaded by</TableHead>
                <TableHead className="px-space-md">Uploaded</TableHead>
                <TableHead className="px-space-md">Status</TableHead>
                <TableHead className="w-28 px-space-md">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COLUMNS }, (_, j) => (
                      <TableCell key={j} className="px-space-md py-3.5">
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : query.isError ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="p-0">
                    {/* Pinned to the visible width so the message stays on screen when the table scrolls sideways. */}
                    <div className="sticky left-0 w-[100cqw]">
                    <ErrorState title="Couldn’t load documents" error={query.error} onRetry={() => query.refetch()} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : query.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="p-0">
                    {/* Pinned to the visible width so the message stays on screen when the table scrolls sideways. */}
                    <div className="sticky left-0 w-[100cqw]">
                    {filtered ? (
                      <EmptyState icon={SearchX} title="No documents match these filters" />
                    ) : (
                      <EmptyState icon={FileText} title="No documents yet" description="Upload an insights summary or an agreement." />
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                query.data.items.map((doc) => {
                  const uploader = teamMap.get(doc.uploaded_by)
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="px-space-md py-3.5">
                        <div className="flex items-center gap-space-sm">
                          <PersonAvatar name={doc.influencer.name} src={doc.influencer.profile_pic_url} className="shadow-sm" />
                          <div className="min-w-0">
                            <Link
                              to={`/influencers/${doc.influencer_id}?tab=documents`}
                              className="block truncate text-label-md font-semibold text-primary hover:underline"
                            >
                              {doc.influencer.name}
                            </Link>
                            <AccountLabel account={doc.influencer.primary_account} block className="text-body-sm text-muted-foreground" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-space-md py-3.5">
                        <DocumentTypeBadge type={doc.type} />
                        <span className="mt-1 block max-w-56 truncate text-body-sm text-muted-foreground" title={doc.title}>
                          {doc.title}
                        </span>
                      </TableCell>
                      <TableCell className="px-space-md py-3.5 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays aria-hidden className="size-[15px] shrink-0 text-outline" strokeWidth={1.75} />
                          {documentDetail(doc)}
                        </span>
                      </TableCell>
                      <TableCell className="px-space-md py-3.5">
                        <div className="flex items-center gap-2">
                          <FileGlyph contentType={doc.content_type} />
                          <div className="min-w-0">
                            <span className="block max-w-[190px] truncate text-label-md font-medium text-primary" title={doc.file_name}>
                              {doc.file_name}
                            </span>
                            <span className="text-body-sm text-muted-foreground">{formatFileSize(doc.size)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-space-md py-3.5 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {uploader && (
                            <PersonAvatar
                              name={uploader.name}
                              aria-hidden
                              className="size-5 [&_[data-slot=avatar-fallback]]:text-[10px] [&_[data-slot=avatar-fallback]]:font-semibold"
                            />
                          )}
                          {uploader?.name ?? '…'}
                        </span>
                      </TableCell>
                      <TableCell className="px-space-md py-3.5 whitespace-nowrap text-muted-foreground">
                        <RelativeTime iso={doc.uploaded_at} />
                      </TableCell>
                      <TableCell className="px-space-md py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AgreementBadges doc={doc} />
                        </div>
                      </TableCell>
                      <TableCell className="px-space-md py-3.5">
                        <div className="flex justify-end">
                          <DocumentButtons doc={doc} actions={actions} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        {query.data && query.data.total > PAGE_SIZE && (
          <div className="flex justify-end px-4 py-3 sm:px-space-lg">
            <Pagination page={params.page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(page) => update({ page })} />
          </div>
        )}
      </div>

      <InfluencerPicker
        open={pickType !== null}
        onOpenChange={(open) => !open && setPickType(null)}
        title={pickType ? `Upload ${DOCUMENT_TYPE_META[pickType].label.toLowerCase()} for…` : undefined}
        // Documents aren't kept for the Unassigned Pool.
        eligible={(inf) => inf.assigned_to !== null}
        onPick={(influencer) => {
          if (pickType) setTarget({ influencer, type: pickType, open: true })
          setPickType(null)
        }}
      />
      {target && (
        <DocumentUploadDialog
          influencer={target.influencer}
          type={target.type}
          open={target.open}
          onOpenChange={(open) => setTarget((t) => (t ? { ...t, open } : t))}
        />
      )}
      {dialogs}
    </div>
  )
}
