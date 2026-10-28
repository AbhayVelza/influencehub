import { http } from '@/services/http'
import type {
  Category,
  CategoryCreate,
  CategoryUpdate,
  DashboardSummary,
  InfluencerFilters,
  InstagramSettings,
  InstagramSettingsUpdate,
  Paginated,
  PipelineResponse,
  SavedView,
  SavedViewCreate,
  TeamMemberCreate,
  TeamMemberUpdate,
  User,
} from '@/types'

export const meApi = {
  get: (signal?: AbortSignal) => http.get<User>('/me', undefined, signal),
}

export const pipelineApi = {
  get: (filters: InfluencerFilters = {}, signal?: AbortSignal) =>
    http.get<PipelineResponse>('/pipeline', { ...filters }, signal),
}

export const dashboardApi = {
  summary: (signal?: AbortSignal) => http.get<DashboardSummary>('/dashboard/summary', undefined, signal),
}

export const teamApi = {
  list: (signal?: AbortSignal) => http.get<Paginated<User>>('/team', undefined, signal),
  create: (body: TeamMemberCreate) => http.post<User>('/team', body),
  update: (id: string, body: TeamMemberUpdate) => http.patch<User>(`/team/${id}`, body),
}

export const categoriesApi = {
  list: (signal?: AbortSignal) => http.get<Paginated<Category>>('/categories', undefined, signal),
  create: (body: CategoryCreate) => http.post<Category>('/categories', body),
  update: (id: string, body: CategoryUpdate) => http.patch<Category>(`/categories/${id}`, body),
  /** 409 `in_use` while any influencer has this category. */
  remove: (id: string) => http.delete(`/categories/${id}`),
}

export const settingsApi = {
  instagram: (signal?: AbortSignal) => http.get<InstagramSettings>('/settings/instagram', undefined, signal),
  updateInstagram: (body: InstagramSettingsUpdate) => http.patch<InstagramSettings>('/settings/instagram', body),
}

export const savedViewsApi = {
  list: (signal?: AbortSignal) => http.get<Paginated<SavedView>>('/saved-views', undefined, signal),
  create: (body: SavedViewCreate) => http.post<SavedView>('/saved-views', body),
  remove: (id: string) => http.delete(`/saved-views/${id}`),
}
