import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { LogCallDialog, type LogCallTarget } from '@/features/calls/log-call-dialog'
import { PackageDrawer, type PackageTarget } from '@/features/packages/package-drawer'
import { STAGE_META } from '@/lib/constants'
import { queryKeys } from '@/lib/query'
import { ApiError, getErrorMessage, influencersApi } from '@/services'
import type { Stage } from '@/types'
import { invalidateInfluencer } from './detail-queries'
import { StageReasonDialog } from './stage-reason-dialog'

export interface MoveTarget {
  id: string
  name: string
  stage: Stage
}

export interface MoveOptions {
  /** Admin move outside the standard transitions: always asks for a reason. */
  override?: boolean
  /**
   * Whether the target stage's requirement (interested call / tracked package) is already met.
   * false opens the required modal straight away; undefined tries the move and opens it only if the API
   * answers `requirement_missing`.
   */
  requirementMet?: boolean
  /** Applied while a direct move is in flight (e.g. the pipeline moves the card), undone on failure. */
  optimistic?: { apply: () => void; rollback: () => void }
}

type MoverReasonState = { target: MoveTarget; to: Stage; mode: 'confirm' | 'override' } | null

/**
 * Stage moves with the same rules everywhere (detail page, pipeline): required modals, confirmations,
 * admin override reasons. Render `dialogs` once in the component that uses it.
 */
export function useStageMover(): {
  requestMove: (target: MoveTarget, to: Stage, options?: MoveOptions) => Promise<void>
  pending: boolean
  dialogs: ReactNode
} {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [reasonState, setReasonState] = useState<MoverReasonState>(null)
  const [call, setCall] = useState<{ target: LogCallTarget; open: boolean } | null>(null)
  const [pkg, setPkg] = useState<{ target: PackageTarget; open: boolean } | null>(null)

  const move = async (target: MoveTarget, to: Stage, reason?: string, optimistic?: MoveOptions['optimistic']) => {
    optimistic?.apply()
    setPending(true)
    try {
      const updated = await influencersApi.changeStage(target.id, { to, reason })
      queryClient.setQueryData(queryKeys.influencer(target.id), updated)
      void invalidateInfluencer(queryClient, target.id)
      toast.success(`${target.name} moved to ${STAGE_META[to].label}`)
      return 'moved' as const
    } catch (err) {
      optimistic?.rollback()
      if (err instanceof ApiError && err.code === 'requirement_missing') return 'requirement' as const
      toast.error(`Couldn’t move to ${STAGE_META[to].label}`, { description: getErrorMessage(err) })
      return 'failed' as const
    } finally {
      setPending(false)
    }
  }

  const openRequirement = async (target: MoveTarget, to: Stage) => {
    if (to === 'contacted') return setCall({ target, open: true })
    if (to === 'package_sent') {
      try {
        // The drawer prefills the influencer's address, so load the full record.
        const influencer = await queryClient.fetchQuery({
          queryKey: queryKeys.influencer(target.id),
          queryFn: ({ signal }) => influencersApi.get(target.id, signal),
        })
        setPkg({ target: influencer, open: true })
      } catch (err) {
        toast.error('Couldn’t open the package form', { description: getErrorMessage(err) })
      }
    }
  }

  const requestMove = async (target: MoveTarget, to: Stage, options: MoveOptions = {}) => {
    if (options.override) return setReasonState({ target, to, mode: 'override' })
    if (to === 'on_hold' || to === 'rejected') return setReasonState({ target, to, mode: 'confirm' })
    if ((to === 'contacted' || to === 'package_sent') && options.requirementMet === false) return openRequirement(target, to)
    if ((await move(target, to, undefined, options.optimistic)) === 'requirement') await openRequirement(target, to)
  }

  const dialogs = (
    <>
      <StageReasonDialog
        state={reasonState}
        pending={pending}
        onCancel={() => setReasonState(null)}
        onSubmit={async (reason) => {
          if (!reasonState) return
          if ((await move(reasonState.target, reasonState.to, reason)) !== 'failed') setReasonState(null)
        }}
      />
      {call && (
        <LogCallDialog
          influencer={call.target}
          intent="contacted"
          open={call.open}
          onOpenChange={(open) => setCall((c) => (c ? { ...c, open } : c))}
        />
      )}
      {pkg && (
        <PackageDrawer
          influencer={pkg.target}
          intent="package_sent"
          open={pkg.open}
          onOpenChange={(open) => setPkg((p) => (p ? { ...p, open } : p))}
        />
      )}
    </>
  )

  return { requestMove, pending, dialogs }
}
