import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { LogCallDialog, type LogCallTarget } from '@/features/calls/log-call-dialog'
import { DocumentUploadDialog, type UploadTarget } from '@/features/documents/document-upload-dialog'
import { PackageDrawer, type PackageTarget } from '@/features/packages/package-drawer'
import { STAGE_META } from '@/lib/constants'
import { missingOnboardingDocuments } from '@/lib/documents'
import { queryKeys } from '@/lib/query'
import { ApiError, getErrorMessage, influencersApi } from '@/services'
import type { DocumentType, Stage } from '@/types'
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
   * Whether the target stage's requirement (interested call / tracked package / agreement + insights) is already met.
   * false opens the required modal straight away; undefined tries the move and opens it only if the API
   * answers `requirement_missing`.
   */
  requirementMet?: boolean
  /** Applied while a direct move is in flight (e.g. the pipeline moves the card), undone on failure. */
  optimistic?: { apply: () => void; rollback: () => void }
}

type MoverReasonState = { target: MoveTarget; to: Stage; mode: 'confirm' | 'override' } | null

/** Onboarding documents still to upload (the first one is showing); the move to Onboarded follows the last. */
type OnboardingState = { target: MoveTarget; uploadTarget: UploadTarget; queue: DocumentType[]; total: number; open: boolean; flowId: number }

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
  const onboardingFlowIdRef = useRef(0)
  const [pending, setPending] = useState(false)
  const [reasonState, setReasonState] = useState<MoverReasonState>(null)
  const [call, setCall] = useState<{ target: LogCallTarget; open: boolean } | null>(null)
  const [pkg, setPkg] = useState<{ target: PackageTarget; open: boolean } | null>(null)
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)

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
    if (to === 'onboarded') {
      const flowId = ++onboardingFlowIdRef.current
      try {
        // A fresh record: what's missing decides the upload steps; its accounts feed the insights platform choice.
        const influencer = await queryClient.fetchQuery({
          queryKey: queryKeys.influencer(target.id),
          queryFn: ({ signal }) => influencersApi.get(target.id, signal),
          staleTime: 0,
        })
        if (onboardingFlowIdRef.current !== flowId) return
        const queue = missingOnboardingDocuments(influencer.documents)
        if (!queue.length) {
          // The record says both are on file but the server still refuses: say so instead of failing silently.
          if ((await move(target, 'onboarded')) === 'requirement') {
            if (onboardingFlowIdRef.current !== flowId) return
            toast.error('Couldn’t move to Onboarded', {
              description: 'The agreement and an insights summary are both needed. Check the Documents tab.',
            })
          }
          return
        }
        setOnboarding({ target, uploadTarget: influencer, queue, total: queue.length, open: true, flowId })
      } catch (err) {
        if (onboardingFlowIdRef.current !== flowId) return
        toast.error('Couldn’t open the document upload', { description: getErrorMessage(err) })
      }
      return
    }
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
    if ((to === 'contacted' || to === 'onboarded' || to === 'package_sent') && options.requirementMet === false) {
      return openRequirement(target, to)
    }
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
      {onboarding && (
        <DocumentUploadDialog
          influencer={onboarding.uploadTarget}
          type={onboarding.queue[0]}
          note={
            onboarding.total > 1
              ? `Step ${onboarding.total - onboarding.queue.length + 1} of ${onboarding.total}: Onboarded needs the agreement and an insights summary`
              : 'needed to move to Onboarded'
          }
          open={onboarding.open}
          // A user close (cancel, Esc, outside click) drops the flow. A successful upload doesn't close the dialog:
          // onUploaded below opens the next step or clears the flow and finishes the move.
          onOpenChange={(open) => {
            if (!open) {
              onboardingFlowIdRef.current += 1
              setOnboarding(null)
            }
          }}
          closeOnUpload={false}
          onUploaded={async () => {
            if (onboardingFlowIdRef.current !== onboarding.flowId) return
            const rest = onboarding.queue.slice(1)
            // Everything's on file now: finish the move. Otherwise ask for the next document.
            if (rest.length) return setOnboarding({ ...onboarding, queue: rest, open: true })
            const flowId = onboarding.flowId
            setOnboarding(null)
            // Still refused (e.g. a document was deleted meanwhile): rebuild the steps from fresh data.
            const result = await move(onboarding.target, 'onboarded')
            if (onboardingFlowIdRef.current !== flowId) return
            if (result === 'requirement') await openRequirement(onboarding.target, 'onboarded')
          }}
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
