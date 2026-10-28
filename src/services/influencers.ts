import { http } from '@/services/http'
import type {
  Activity,
  BulkRequest,
  BulkResult,
  CallLog,
  CallLogCreate,
  CheckHandleResponse,
  FilterOptions,
  FollowerSnapshot,
  Influencer,
  InfluencerCreate,
  InfluencerListParams,
  InfluencerUpdate,
  JobRef,
  MediaItem,
  Paginated,
  StageChangeRequest,
} from '@/types'

const base = '/influencers'

export const influencersApi = {
  list: (params: InfluencerListParams = {}, signal?: AbortSignal) =>
    http.get<Paginated<Influencer>>(base, { ...params }, signal),

  filterOptions: (params: { country?: string[]; state?: string[] } = {}, signal?: AbortSignal) =>
    http.get<FilterOptions>(`${base}/filter-options`, params, signal),

  checkHandle: (handle: string, signal?: AbortSignal) =>
    http.get<CheckHandleResponse>(`${base}/check-handle`, { handle }, signal),

  get: (id: string, signal?: AbortSignal) => http.get<Influencer>(`${base}/${id}`, undefined, signal),

  create: (body: InfluencerCreate) => http.post<Influencer>(base, body),

  update: (id: string, body: InfluencerUpdate) => http.patch<Influencer>(`${base}/${id}`, body),

  remove: (id: string) => http.delete(`${base}/${id}`),

  changeStage: (id: string, body: StageChangeRequest) => http.post<Influencer>(`${base}/${id}/stage`, body),

  bulk: (body: BulkRequest) => http.post<BulkResult>(`${base}/bulk`, body),

  activity: (id: string, params: { page?: number; page_size?: number } = {}, signal?: AbortSignal) =>
    http.get<Paginated<Activity>>(`${base}/${id}/activity`, params, signal),

  snapshots: (id: string, signal?: AbortSignal) =>
    http.get<Paginated<FollowerSnapshot>>(`${base}/${id}/snapshots`, undefined, signal),

  media: (id: string, signal?: AbortSignal) => http.get<Paginated<MediaItem>>(`${base}/${id}/media`, undefined, signal),

  sync: (id: string) => http.post<JobRef>(`${base}/${id}/sync`),

  calls: (id: string, params: { page?: number; page_size?: number } = {}, signal?: AbortSignal) =>
    http.get<Paginated<CallLog>>(`${base}/${id}/calls`, params, signal),

  logCall: (id: string, body: CallLogCreate) => http.post<CallLog>(`${base}/${id}/calls`, body),
}
