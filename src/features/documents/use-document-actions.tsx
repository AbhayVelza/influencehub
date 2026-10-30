import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCan } from '@/hooks/use-me'
import { downloadFile } from '@/lib/jobs'
import { documentsApi, getErrorMessage } from '@/services'
import type { InfluencerDocument } from '@/types'
import { DocumentPreviewDialog } from './document-preview-dialog'
import { useDeleteDocument } from './queries'

export interface DocumentActions {
  preview: (doc: InfluencerDocument) => void
  download: (doc: InfluencerDocument) => Promise<void>
  remove: (doc: InfluencerDocument) => void
  /** Managers and admins only. */
  canDelete: boolean
}

/**
 * Preview, download and delete for documents, the same everywhere (influencer page, Documents page).
 * Render `dialogs` once in the component that uses it.
 */
export function useDocumentActions(): { actions: DocumentActions; dialogs: ReactNode } {
  const canDelete = useCan('document:delete')
  const [previewing, setPreviewing] = useState<InfluencerDocument | null>(null)
  const [deleting, setDeleting] = useState<InfluencerDocument | null>(null)
  const deleteDocument = useDeleteDocument()

  const download = async (doc: InfluencerDocument) => {
    try {
      const { url } = await documentsApi.download(doc.id)
      downloadFile(url, doc.file_name)
    } catch (err) {
      toast.error('Couldn’t download the document', { description: getErrorMessage(err) })
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteDocument.mutateAsync(deleting)
      toast.success('Document deleted', { description: deleting.title })
      setDeleting(null)
    } catch (err) {
      toast.error('Couldn’t delete the document', { description: getErrorMessage(err) })
    }
  }

  const dialogs = (
    <>
      <DocumentPreviewDialog doc={previewing} onClose={() => setPreviewing(null)} onDownload={(doc) => void download(doc)} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && !deleteDocument.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.title} will no longer be shown.
              {deleting?.type === 'agreement' && deleting.is_current && ' The previous version, if there is one, becomes the current agreement.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDocument.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteDocument.isPending}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              Delete document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { actions: { preview: setPreviewing, download, remove: setDeleting, canDelete }, dialogs }
}
