import { Download, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canPreview, DOCUMENT_TYPE_META, isExpired } from '@/lib/documents'
import { cn } from '@/lib/utils'
import type { InfluencerDocument } from '@/types'
import type { DocumentActions } from './use-document-actions'

const BADGE = 'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function DocumentTypeBadge({ type }: { type: InfluencerDocument['type'] }) {
  return (
    <span
      className={cn(
        BADGE,
        type === 'agreement' ? 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
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
      {doc.is_current && <span className={cn(BADGE, 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300')}>Current</span>}
      {isExpired(doc) && <span className={cn(BADGE, 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300')}>Expired</span>}
    </>
  )
}

/** Preview (PDF and images), download and, for managers and admins, delete. */
export function DocumentButtons({ doc, actions }: { doc: InfluencerDocument; actions: DocumentActions }) {
  return (
    <div className="flex shrink-0 items-center">
      {canPreview(doc.content_type) && (
        <Button variant="ghost" size="icon-sm" aria-label={`Preview ${doc.title}`} onClick={() => actions.preview(doc)}>
          <Eye />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label={`Download ${doc.title}`} onClick={() => void actions.download(doc)}>
        <Download />
      </Button>
      {actions.canDelete && (
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${doc.title}`} onClick={() => actions.remove(doc)}>
          <Trash2 />
        </Button>
      )}
    </div>
  )
}
