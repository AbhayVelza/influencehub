import { http } from '@/services/http'
import type { Package, PackageCreate, PackageListParams, PackageUpdate, PackageWithInfluencer, Paginated } from '@/types'

export const packagesApi = {
  list: (params: PackageListParams = {}, signal?: AbortSignal) =>
    http.get<Paginated<PackageWithInfluencer>>('/packages', { ...params }, signal),

  create: (body: PackageCreate) => http.post<Package>('/packages', body),

  update: (id: string, body: PackageUpdate) => http.patch<Package>(`/packages/${id}`, body),
}
