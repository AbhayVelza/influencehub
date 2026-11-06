import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateInfluencer } from '@/features/influencers/detail-queries'
import { queryKeys } from '@/lib/query'
import { packagesApi } from '@/services'
import type { Package, PackageCreate, PackageListParams, PackageStatus, PackageUpdate, Stage } from '@/types'

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

export type StageChangingStatus = Extract<PackageStatus, 'delivered' | 'returned'>

/**
 * The stage the server moves an influencer to when their package changes to this status (mirrors `followPackage` in
 * the packages handler): delivered moves Onboarded / Package Sent to Delivered, returned moves Package Sent back to
 * Onboarded. Null when the stage stays as it is.
 */
export function stageAfterPackage(stage: Stage, status: PackageStatus): Stage | null {
  if (status === 'delivered' && (stage === 'onboarded' || stage === 'package_sent')) return 'delivered'
  if (status === 'returned' && stage === 'package_sent') return 'onboarded'
  return null
}

/** Changing a package to delivered/returned can move the influencer, so it's confirmed first. */
export function needsStatusConfirm(from: PackageStatus | undefined, to: PackageStatus): to is StageChangingStatus {
  return (to === 'delivered' || to === 'returned') && to !== from
}
