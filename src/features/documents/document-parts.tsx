import { Download, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canPreview, DOCUMENT_TYPE_META, isExpired } from '@/lib/documents'
import { cn } from '@/lib/utils'
import type { InfluencerDocument } from '@/types'
import type { DocumentActions } from './use-document-actions'

const BADGE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-small font-medium whitespace-nowrap'
/** Stitch status pill: neutral chip with a coloured dot. */
const STATUS = cn(BADGE, 'gap-1.5 bg-surface-container text-on-surface')

export function DocumentTypeBadge({ type }: { type: InfluencerDocument['type'] }) {
  return (
    <span
      className={cn(
        BADGE,
        type === 'agreement' ? 'bg-secondary-fixed/50 text-on-secondary-fixed' : 'bg-tertiary-fixed/40 text-on-tertiary-fixed-variant',
      )}
    >
      {DOCUMENT_TYPE_META[type].label}
    </span>
  )
}

/** Current / Expired for agreements; nothing for insights summaries. */
export function AgreementBadges({ doc }: { doc: InfluencerDocument }) {
  if (doc.type !== 'agreement') return null
  return (
    <>
      {doc.is_current && (
        <span className={STATUS}>
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
          Current
        </span>
      )}
      {isExpired(doc) && (
        <span className={STATUS}>
          <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
          Expired
        </span>
      )}
    </>
  )
}

/** Preview (PDF and images), download and, for managers and admins, delete. */
export function DocumentButtons({ doc, actions }: { doc: InfluencerDocument; actions: DocumentActions }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {canPreview(doc.content_type) && (
        <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:bg-surface-container hover:text-primary" aria-label={`Preview ${doc.title}`} onClick={() => actions.preview(doc)}>
          <Eye className="size-[18px]" strokeWidth={1.75} />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:bg-surface-container hover:text-primary" aria-label={`Download ${doc.title}`} onClick={() => void actions.download(doc)}>
        <Download className="size-[18px]" strokeWidth={1.75} />
      </Button>
      {actions.canDelete && (
        <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:bg-error-container/60 hover:text-error" aria-label={`Delete ${doc.title}`} onClick={() => actions.remove(doc)}>
          <Trash2 className="size-[18px]" strokeWidth={1.75} />
        </Button>
      )}
    </div>
  )
}
