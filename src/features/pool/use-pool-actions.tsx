import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ReasonList } from '@/components/common/reason-list'
import { invalidateInfluencer } from '@/features/influencers/detail-queries'
import { useBulkAction } from '@/features/influencers/queries'
import { ApiError, getErrorMessage, influencersApi } from '@/services'
import type { BulkResult } from '@/types'
import { claimErrorToast, useClaimInfluencer } from './queries'

const plural = (n: number) => `${n} influencer${n === 1 ? '' : 's'}`

/** Claim (one or many) and assign from the pool, with the toasts and refreshes they need. */
export function usePoolActions() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const claimOne = useClaimInfluencer()
  const bulk = useBulkAction()
  const assignOne = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => influencersApi.update(id, { assigned_to: userId }),
    onSettled: (_data, _error, { id }) => invalidateInfluencer(queryClient, id),
  })

  /** Claims, then opens the full profile. Resolves to 'ok' or the error code (e.g. `already_claimed`). */
  const claim = async (item: { id: string; name: string }): Promise<string> => {
    try {
      await claimOne.mutateAsync(item.id)
      toast.success(`${item.name} is yours`, { description: 'Their contact details and calls are now unlocked.' })
      navigate(`/influencers/${item.id}`)
      return 'ok'
    } catch (err) {
      claimErrorToast(err)
      return err instanceof ApiError ? err.code : 'error'
    }
  }

  /** Bulk claim. Resolves to the ids that weren't claimed (they stay selected). */
  const claimMany = async (rows: { id: string; name: string }[]): Promise<string[]> => {
    let res: BulkResult
    try {
      res = await bulk.mutateAsync({ ids: rows.map((r) => r.id), action: 'claim' })
    } catch (err) {
      toast.error('Couldn’t claim', { description: getErrorMessage(err) })
      return rows.map((r) => r.id)
    }
    const names = new Map(rows.map((r) => [r.id, r.name]))
    const reasons = res.failed.map((f) => `${names.get(f.id) ?? f.id}: ${f.message}`)
    const claimed = res.succeeded.length
    if (!reasons.length) toast.success(`${plural(claimed)} claimed`)
    else if (!claimed) toast.error('Nothing claimed', { description: <ReasonList reasons={reasons} />, duration: 10_000 })
    else toast.warning(`${claimed} claimed, ${reasons.length} not`, { description: <ReasonList reasons={reasons} />, duration: 10_000 })
    return res.failed.map((f) => f.id)
  }

  const assign = (item: { id: string; name: string }, userId: string, ownerName: string) =>
    assignOne.mutate(
      { id: item.id, userId },
      {
        onSuccess: () => toast.success(`${item.name} assigned to ${ownerName}`),
        onError: (err) => toast.error('Couldn’t assign', { description: getErrorMessage(err) }),
      },
    )

  /** Bulk assign (managers and admins). Resolves to the ids that weren't assigned. */
  const assignMany = async (rows: { id: string; name: string }[], userId: string, ownerName: string): Promise<string[]> => {
    try {
      const res = await bulk.mutateAsync({ ids: rows.map((r) => r.id), action: 'assign', value: userId })
      if (res.failed.length) toast.warning(`${res.succeeded.length} assigned to ${ownerName}, ${res.failed.length} not`)
      else toast.success(`${plural(res.succeeded.length)} assigned to ${ownerName}`)
      return res.failed.map((f) => f.id)
    } catch (err) {
      toast.error('Couldn’t assign', { description: getErrorMessage(err) })
      return rows.map((r) => r.id)
    }
  }

  return {
    claim,
    claimMany,
    assign,
    assignMany,
    busy: claimOne.isPending || bulk.isPending || assignOne.isPending,
  }
}
