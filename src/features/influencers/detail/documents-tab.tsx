import { FileText, FileUp, History } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { RelativeTime } from '@/components/common/relative-time'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AgreementBadges, DocumentButtons } from '@/features/documents/document-parts'
import { DocumentUploadDialog } from '@/features/documents/document-upload-dialog'
import { useInfluencerDocuments } from '@/features/documents/queries'
import { useDocumentActions, type DocumentActions } from '@/features/documents/use-document-actions'
import { useCan } from '@/hooks/use-me'
import { useTeamMap } from '@/hooks/use-team'
import { documentDetail, formatFileSize } from '@/lib/documents'
import type { AgreementDocument, DocumentType, Influencer, InfluencerDocument } from '@/types'

function Row({ doc, actions, uploader }: { doc: InfluencerDocument; actions: DocumentActions; uploader: string }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3 text-sm">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{doc.title}</span>
          <AgreementBadges doc={doc} />
        </div>
        <p className="text-muted-foreground">{documentDetail(doc)}</p>
        {doc.notes && <p className="text-muted-foreground">“{doc.notes}”</p>}
        <p className="truncate text-xs text-muted-foreground">
          {doc.file_name} · {formatFileSize(doc.size)} · {uploader} · <RelativeTime iso={doc.uploaded_at} />
        </p>
      </div>
      <DocumentButtons doc={doc} actions={actions} />
    </li>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Insights summaries (many) and the agreement (the current one, with its version history). */
export function DocumentsTab({ influencer }: { influencer: Influencer }) {
  const inPool = influencer.assigned_to === null
  const documents = useInfluencerDocuments(influencer.id, !inPool)
  const canUpload = useCan('document:upload')
  const team = useTeamMap()
  const { actions, dialogs } = useDocumentActions()
  const [upload, setUpload] = useState<{ type: DocumentType; open: boolean }>({ type: 'insights_summary', open: false })
  const uploader = (doc: InfluencerDocument) => team.get(doc.uploaded_by)?.name ?? 'Someone'

  if (inPool) {
    return (
      <EmptyState
        icon={FileText}
        title="Documents aren’t kept for the Unassigned Pool"
        description="Assign an owner to this influencer to upload and see their documents."
      />
    )
  }
  if (documents.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }
  if (documents.isError) {
    return <ErrorState title="Couldn’t load documents" error={documents.error} onRetry={() => documents.refetch()} />
  }

  const all = documents.data.items
  const insights = all.filter((d) => d.type === 'insights_summary')
  const agreements = all.filter((d): d is AgreementDocument => d.type === 'agreement')
  const current = agreements.find((a) => a.is_current)
  const history = agreements.filter((a) => !a.is_current)
  const open = (type: DocumentType) => setUpload({ type, open: true })

  return (
    <div className="space-y-6">
      <Section
        title="Insights summaries"
        action={
          canUpload && (
            <Button variant="outline" size="sm" onClick={() => open('insights_summary')}>
              <FileUp />
              Upload insights summary
            </Button>
          )
        }
      >
        {insights.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No insights summaries yet.</p>
        ) : (
          <ul className="space-y-2" aria-label="Insights summaries">
            {insights.map((doc) => (
              <Row key={doc.id} doc={doc} actions={actions} uploader={uploader(doc)} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Agreement"
        action={
          canUpload && (
            <Button variant="outline" size="sm" onClick={() => open('agreement')}>
              <FileUp />
              {current ? 'Upload new version' : 'Upload agreement'}
            </Button>
          )
        }
      >
        {current ? (
          <ul aria-label="Current agreement">
            <Row doc={current} actions={actions} uploader={uploader(current)} />
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No agreement on file.</p>
        )}
        {history.length > 0 && (
          <div className="space-y-2 pt-2">
            <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="size-3.5" />
              Version history
            </h4>
            <ul className="space-y-2" aria-label="Agreement version history">
              {history.map((doc) => (
                <Row key={doc.id} doc={doc} actions={actions} uploader={uploader(doc)} />
              ))}
            </ul>
          </div>
        )}
      </Section>

      <DocumentUploadDialog
        influencer={influencer}
        type={upload.type}
        open={upload.open}
        onOpenChange={(next) => setUpload((s) => ({ ...s, open: next }))}
      />
      {dialogs}
    </div>
  )
}
