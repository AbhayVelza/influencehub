import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { DOCUMENT_TYPE_META } from '@/lib/documents'
import { documentsApi, getErrorMessage } from '@/services'
import type { InfluencerDocument } from '@/types'

/** PDFs and images, shown from the document's download URL. */
export function DocumentPreviewDialog({ doc, onClose, onDownload }: { doc: InfluencerDocument | null; onClose: () => void; onDownload: (doc: InfluencerDocument) => void }) {
  const link = useQuery({
    queryKey: ['documents', 'download', doc?.id],
    queryFn: () => documentsApi.download(doc!.id),
    enabled: !!doc,
    staleTime: 0,
    gcTime: 0,
  })
  const isImage = doc?.content_type.startsWith('image/')

  return (
    <Dialog open={!!doc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{doc?.title}</DialogTitle>
          <DialogDescription>{doc ? `${DOCUMENT_TYPE_META[doc.type].label} · ${doc.file_name}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="flex h-[65vh] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
          {link.isPending ? (
            <Skeleton className="size-full" />
          ) : link.isError ? (
            <p role="alert" className="px-6 text-center text-sm text-destructive">
              Couldn’t load the preview. {getErrorMessage(link.error)}
            </p>
          ) : isImage ? (
            <img src={link.data.url} alt={doc?.title} className="max-h-full max-w-full object-contain" />
          ) : (
            <iframe src={link.data.url} title={`Preview of ${doc?.title}`} className="size-full" />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => doc && onDownload(doc)}>
            <Download />
            Download
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

