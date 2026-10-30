import { ChevronDown, FilePlus2, FileText, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DateRangeFilter } from '@/components/common/date-range-filter'
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
import type { DocumentListParams, DocumentType, Influencer } from '@/types'

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
  const COLUMNS = 7

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={
          <>
            Documents{' '}
            {query.data && <span className="font-normal text-muted-foreground tabular-nums">({formatNumber(query.data.total)})</span>}
          </>
        }
        description="Insights summaries and agreements for the influencers you can see."
        actions={
          canUpload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <FilePlus2 />
                  Upload
                  <ChevronDown className="opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {DOCUMENT_TYPES.map((type) => (
                  <DropdownMenuItem key={type} onSelect={() => setPickType(type)}>
                    {DOCUMENT_TYPE_META[type].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ListSearch
          value={params.q}
          onChange={(q) => update({ q })}
          placeholder="Search creator name or handle…"
          label="Search creators"
          className="max-w-72"
        />
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
        {filtered && (
          <Button variant="link" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
            Clear all
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table className={cn(query.isPlaceholderData && 'opacity-60')}>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Creator</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Period / signed</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Uploaded by</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-28">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COLUMNS }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : query.isError ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS}>
                    <ErrorState title="Couldn’t load documents" error={query.error} onRetry={() => query.refetch()} />
                  </TableCell>
                </TableRow>
              ) : query.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS}>
                    {filtered ? (
                      <EmptyState icon={SearchX} title="No documents match these filters" />
                    ) : (
                      <EmptyState icon={FileText} title="No documents yet" description="Upload an insights summary or an agreement." />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                query.data.items.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar name={doc.influencer.name} src={doc.influencer.profile_pic_url} />
                        <div className="min-w-0">
                          <Link to={`/influencers/${doc.influencer_id}?tab=documents`} className="block truncate font-medium hover:underline">
                            {doc.influencer.name}
                          </Link>
                          <AccountLabel account={doc.influencer.primary_account} block className="text-xs text-muted-foreground" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DocumentTypeBadge type={doc.type} />
                        <AgreementBadges doc={doc} />
                      </div>
                      <span className="mt-0.5 block max-w-56 truncate text-xs text-muted-foreground" title={doc.title}>
                        {doc.title}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{documentDetail(doc)}</TableCell>
                    <TableCell className="max-w-48">
                      <span className="block truncate" title={doc.file_name}>
                        {doc.file_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatFileSize(doc.size)}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{teamMap.get(doc.uploaded_by)?.name ?? '…'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <RelativeTime iso={doc.uploaded_at} />
                    </TableCell>
                    <TableCell>
                      <DocumentButtons doc={doc} actions={actions} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {query.data && query.data.total > PAGE_SIZE && (
        <div className="flex justify-end">
          <Pagination page={params.page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(page) => update({ page })} />
        </div>
      )}

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
