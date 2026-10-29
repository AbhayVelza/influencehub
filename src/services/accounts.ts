import { http } from '@/services/http'
import type {
  AccountSnapshot,
  AccountUpdate,
  ConnectLinkRequest,
  ConnectLinkResponse,
  DuplicateCheckRequest,
  DuplicateCheckResponse,
  DuplicatePair,
  JobRef,
  LookupRequest,
  MediaItem,
  Paginated,
  SocialAccount,
} from '@/types'

export const accountsApi = {
  /** Manual accounts only (422 `not_manual` otherwise). */
  update: (id: string, body: AccountUpdate) => http.patch<SocialAccount>(`/accounts/${id}`, body),

  /** Lookup accounts, and connect accounts once connected (422 `not_syncable` otherwise). */
  sync: (id: string) => http.post<JobRef>(`/accounts/${id}/sync`),

  /** Connect-method accounts: a link the creator opens to authorise us. */
  connectLink: (id: string, body: ConnectLinkRequest) => http.post<ConnectLinkResponse>(`/accounts/${id}/connect-link`, body),

  snapshots: (id: string, signal?: AbortSignal) => http.get<Paginated<AccountSnapshot>>(`/accounts/${id}/snapshots`, undefined, signal),

  media: (id: string, signal?: AbortSignal) => http.get<Paginated<MediaItem>>(`/accounts/${id}/media`, undefined, signal),
}

export const lookupApi = {
  /** Fails fast with 409 `already_exists` / `in_pool` / `assigned_to_other` when the account is already in the CRM. */
  start: (body: LookupRequest) => http.post<JobRef>('/lookup', body),
}

export const duplicatesApi = {
  /** Possible matches for a creator about to be added (or an account about to be added). */
  check: (body: DuplicateCheckRequest) => http.post<DuplicateCheckResponse>('/duplicates/check', body),

  /** Open pairs for review (manager/admin). */
  list: (params: { page?: number; page_size?: number } = {}, signal?: AbortSignal) =>
    http.get<Paginated<DuplicatePair>>('/duplicates', params, signal),

  dismiss: (id: string) => http.post<void>(`/duplicates/${id}/dismiss`),
}
