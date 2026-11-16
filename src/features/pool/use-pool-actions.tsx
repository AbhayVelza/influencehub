import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ReasonList } from '@/components/common/reason-list'
import { invalidateInfluencer } from '@/features/influencers/detail-queries'
import { useBulkAction } from '@/features/influencers/queries'
import { queryKeys } from '@/lib/query'
import { ApiError, getErrorMessage, influencersApi } from '@/services'
import type { BulkResult } from '@/types'
import { claimErrorToast, useClaimInfluencer } from './queries'

const plural = (n: number) => `${n} influencer${n === 1 ? '' : 's'}`

/** Shares rows out in turn (the i-th row goes to the (i mod n)-th person), so shares differ by at most one. */
export function splitRoundRobin<T>(rows: T[], n: number): T[][] {
  const shares: T[][] = Array.from({ length: n }, () => [])
  rows.forEach((row, i) => shares[i % n].push(row))
  return shares
}

/** "Sneha Patil", "Sneha Patil and Arjun Rao", "3 people". */
export const assigneesLabel = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.length} people`

type Row = { id: string; name: string }
type Assignee = { id: string; name: string }

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
  // One `pool_assign` request per person; a failed request fails only that person's share.
  const assignShares = useMutation({
    mutationFn: (shares: { userId: string; ids: string[] }[]) =>
      Promise.allSettled(shares.map((s) => influencersApi.bulk({ ids: s.ids, action: 'pool_assign', value: s.userId }))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.influencers }),
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

  /**
   * Bulk assign from the pool (managers and admins), shared out round-robin when there are several people.
   * Rows a teammate claimed meanwhile are left alone. Resolves to the ids worth retrying (they stay selected);
   * rows that have left the pool are only named in the toast.
   */
  const assignMany = async (rows: Row[], assignees: Assignee[]): Promise<string[]> => {
    const split = splitRoundRobin(rows, assignees.length)
    const shares = assignees.map((user, i) => ({ user, rows: split[i] })).filter((s) => s.rows.length)
    const settled = await assignShares.mutateAsync(shares.map((s) => ({ userId: s.user.id, ids: s.rows.map((r) => r.id) })))

    const names = new Map(rows.map((r) => [r.id, r.name]))
    const failed: string[] = []
    const retry: string[] = []
    const reasons: string[] = []
    let assigned = 0
    settled.forEach((res, i) => {
      const share = shares[i]
      if (res.status === 'rejected') {
        failed.push(...share.rows.map((r) => r.id))
        retry.push(...share.rows.map((r) => r.id))
        reasons.push(`${plural(share.rows.length)} for ${share.user.name}: ${getErrorMessage(res.reason)}`)
        return
      }
      assigned += res.value.succeeded.length
      for (const f of res.value.failed) {
        failed.push(f.id)
        if (f.code !== 'not_in_pool' && f.code !== 'not_found') retry.push(f.id)
        reasons.push(`${names.get(f.id) ?? f.id}: ${f.message}`)
      }
    })

    const to = assigneesLabel(shares.map((s) => s.user.name))
    if (!failed.length) {
      toast.success(`${plural(assigned)} assigned to ${to}`, {
        description: shares.length > 1 ? shares.map((s) => `${s.user.name}: ${s.rows.length}`).join(' · ') : undefined,
      })
    } else if (!assigned) {
      toast.error('Couldn’t assign', { description: <ReasonList reasons={reasons} />, duration: 10_000 })
    } else {
      toast.warning(`${assigned} assigned, ${failed.length} not`, { description: <ReasonList reasons={reasons} />, duration: 10_000 })
    }
    return retry
  }

  return {
    claim,
    claimMany,
    assign,
    assignMany,
    busy: claimOne.isPending || bulk.isPending || assignOne.isPending || assignShares.isPending,
  }
}
