import { http } from '@/services/http'
import type { CallLog, CallLogWithInfluencer, FollowUpBucket, Paginated } from '@/types'

export const callsApi = {
  followUps: (params: { bucket: FollowUpBucket; page?: number; page_size?: number }, signal?: AbortSignal) =>
    http.get<Paginated<CallLogWithInfluencer>>('/calls/follow-ups', params, signal),

  markDone: (id: string) => http.post<CallLog>(`/calls/${id}/done`),
}
