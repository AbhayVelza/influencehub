import { Check, X } from 'lucide-react'
import type { DocumentSummary } from '@/types'

/** "Insights ✓" / "Agreement ✗": what's on file, with the state spoken for screen readers. */
function DocFlag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {label}
      {ok ? <Check aria-hidden className="size-3.5 text-green-600 dark:text-green-400" /> : <X aria-hidden className="size-3.5 text-muted-foreground" />}
      <span className="sr-only">{ok ? 'on file' : 'missing'}</span>
    </span>
  )
}

export function DocFlags({ documents }: { documents: DocumentSummary }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-xs whitespace-nowrap">
      <DocFlag label="Insights" ok={documents.insights_count > 0} />
      <DocFlag label="Agreement" ok={documents.has_agreement} />
    </span>
  )
}
