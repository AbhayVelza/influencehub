import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { invalidateInfluencer } from '@/features/influencers/detail-queries'
import { queryKeys } from '@/lib/query'
import { documentsApi } from '@/services'
import type { DocumentCreate, DocumentListParams, InfluencerDocument } from '@/types'

export function useInfluencerDocuments(influencerId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.influencerDocuments(influencerId),
    queryFn: ({ signal }) => documentsApi.forInfluencer(influencerId, signal),
    enabled,
  })
}

export function useDocuments(params: DocumentListParams) {
  return useQuery({
    queryKey: queryKeys.documentList(params),
    queryFn: ({ signal }) => documentsApi.list(params, signal),
    placeholderData: (previous) => previous,
  })
}

/** Documents change the influencer too: the checklist, the Docs column, the dashboard KPI. */
function invalidateAfterDocument(queryClient: QueryClient, influencerId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
  void invalidateInfluencer(queryClient, influencerId)
}

export interface UploadDocumentInput {
  influencerId: string
  file: File
  contentType: string
  /** Everything but the key, which comes from the presign step. */
  metadata: DistributiveOmit<DocumentCreate, 'key'>
  onProgress?: (percent: number) => void
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

/** Presign → PUT the file (with progress) → save the metadata. */
export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ influencerId, file, contentType, metadata, onProgress }: UploadDocumentInput): Promise<InfluencerDocument> => {
      const { upload_url, key } = await documentsApi.presign({
        influencer_id: influencerId,
        type: metadata.type,
        file_name: file.name,
        content_type: contentType,
        size: file.size,
      })
      await documentsApi.upload(upload_url, file, contentType, onProgress)
      return documentsApi.create(influencerId, { ...metadata, key } as DocumentCreate)
    },
    onSuccess: (doc) => invalidateAfterDocument(queryClient, doc.influencer_id),
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (doc: InfluencerDocument) => documentsApi.remove(doc.id),
    onSuccess: (_, doc) => invalidateAfterDocument(queryClient, doc.influencer_id),
  })
}
