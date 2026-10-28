import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateInfluencer } from '@/features/influencers/detail-queries'
import { queryKeys } from '@/lib/query'
import { packagesApi } from '@/services'
import type { Package, PackageCreate, PackageListParams, PackageUpdate } from '@/types'

export function usePackages(params: PackageListParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.packageList(params),
    queryFn: ({ signal }) => packagesApi.list(params, signal),
    enabled,
  })
}

function useInvalidateAfterPackage() {
  const queryClient = useQueryClient()
  return (pkg: Package) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.packages })
    void invalidateInfluencer(queryClient, pkg.influencer_id)
  }
}

export function useCreatePackage() {
  const onSaved = useInvalidateAfterPackage()
  return useMutation({
    mutationFn: (body: PackageCreate) => packagesApi.create(body),
    onSuccess: onSaved,
  })
}

export function useUpdatePackage() {
  const onSaved = useInvalidateAfterPackage()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PackageUpdate }) => packagesApi.update(id, body),
    onSuccess: onSaved,
  })
}
