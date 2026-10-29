import { http } from '@/services/http'
import type {
  AccountCreate,
  Activity,
  BulkRequest,
  BulkResult,
  CallLog,
  CallLogCreate,
  CheckHandleResponse,
  FilterOptions,
  Influencer,
  InfluencerCreate,
  InfluencerListParams,
  InfluencerUpdate,
  MergeRequest,
  Paginated,
  Platform,
  ReleaseRequest,
  SocialAccount,
  StageChangeRequest,
} from '@/types'

const base = '/influencers'

export const influencersApi = {
  list: (params: InfluencerListParams = {}, signal?: AbortSignal) =>
    http.get<Paginated<Influencer>>(base, { ...params }, signal),

  filterOptions: (params: { country?: string[]; state?: string[] } = {}, signal?: AbortSignal) =>
    http.get<FilterOptions>(`${base}/filter-options`, params, signal),

  checkHandle: (platform: Platform, handle: string, signal?: AbortSignal) =>
    http.get<CheckHandleResponse>(`${base}/check-handle`, { platform, handle }, signal),

  get: (id: string, signal?: AbortSignal) => http.get<Influencer>(`${base}/${id}`, undefined, signal),

  create: (body: InfluencerCreate) => http.post<Influencer>(base, body),

  update: (id: string, body: InfluencerUpdate) => http.patch<Influencer>(`${base}/${id}`, body),

  remove: (id: string) => http.delete(`${base}/${id}`),

  changeStage: (id: string, body: StageChangeRequest) => http.post<Influencer>(`${base}/${id}/stage`, body),

  bulk: (body: BulkRequest) => http.post<BulkResult>(`${base}/bulk`, body),

  /** Owner = me. 409 `already_claimed` if a teammate got there first, 409 `claim_limit_reached` over the limit. */
  claim: (id: string) => http.post<Influencer>(`${base}/${id}/claim`),

  /** Back to the Unassigned Pool; the reason is required and goes in the activity log. */
  release: (id: string, body: ReleaseRequest) => http.post<void>(`${base}/${id}/release`, body),

  activity: (id: string, params: { page?: number; page_size?: number } = {}, signal?: AbortSignal) =>
    http.get<Paginated<Activity>>(`${base}/${id}/activity`, params, signal),

  /** 409 `handle_taken` / `in_pool` / `assigned_to_other` when the handle is already in the CRM. */
  addAccount: (id: string, body: AccountCreate) => http.post<SocialAccount>(`${base}/${id}/accounts`, body),

  /** Folds merge_id into keep_id (manager/admin). Returns the surviving influencer. */
  merge: (body: MergeRequest) => http.post<Influencer>(`${base}/merge`, body),

  calls: (id: string, params: { page?: number; page_size?: number } = {}, signal?: AbortSignal) =>
    http.get<Paginated<CallLog>>(`${base}/${id}/calls`, params, signal),

  logCall: (id: string, body: CallLogCreate) => http.post<CallLog>(`${base}/${id}/calls`, body),
}
