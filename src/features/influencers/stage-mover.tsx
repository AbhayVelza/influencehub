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
   * Whether the target stage's requirement (interested call / tracked package / agreement + insights; for an override
   * into Onboarded, just the agreement) is already met.
   * false opens the required modal straight away; undefined tries the move and opens it only if the API
   * answers `requirement_missing`.
   */
  requirementMet?: boolean
  /** Applied while a direct move is in flight (e.g. the pipeline moves the card), undone on failure. */
  optimistic?: { apply: () => void; rollback: () => void }
}

type MoverReasonState = { target: MoveTarget; to: Stage; mode: 'confirm' | 'override' } | null

/** Onboarding documents still to upload (the first one is showing); the move to Onboarded follows the last. */
/** `override`: an admin override into Onboarded, which needs only the agreement and then asks for the reason. */
type OnboardingState = {
  target: MoveTarget
  uploadTarget: UploadTarget
  queue: DocumentType[]
  total: number
  open: boolean
  flowId: number
  mode: 'standard' | 'override'
}

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
        setOnboarding({ target, uploadTarget: influencer, queue, total: queue.length, open: true, flowId, mode: 'standard' })
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
        toast.error('Couldn’t open the Welcome Kit form', { description: getErrorMessage(err) })
      }
    }
  }

  /**
   * Admin override into Onboarded: the signed agreement is the one requirement an override can't skip. Upload it
   * first when it's missing (fresh record), then ask for the override reason.
   */
  const openOverrideOnboarded = async (target: MoveTarget) => {
    const flowId = ++onboardingFlowIdRef.current
    try {
      const influencer = await queryClient.fetchQuery({
        queryKey: queryKeys.influencer(target.id),
        queryFn: ({ signal }) => influencersApi.get(target.id, signal),
        staleTime: 0,
      })
      if (onboardingFlowIdRef.current !== flowId) return
      // Someone moved them meanwhile: follow the current stage instead of the one this screen loaded with.
      if (influencer.stage !== target.stage) {
        const now = { ...target, stage: influencer.stage }
        if (influencer.stage === 'onboarded') return void toast.info(`${target.name} is already Onboarded`)
        // From Contacted it's a standard move: the normal flow asks for the agreement and an insights summary.
        if (influencer.stage === 'contacted') return openRequirement(now, 'onboarded')
        return void toast.error(`${target.name} is now in ${STAGE_META[influencer.stage].label}`, {
          description: 'Their stage changed while you were working. Pick the move again from the stage menu.',
        })
      }
      if (influencer.documents?.has_agreement) return setReasonState({ target, to: 'onboarded', mode: 'override' })
      setOnboarding({ target, uploadTarget: influencer, queue: ['agreement'], total: 1, open: true, flowId, mode: 'override' })
    } catch (err) {
      if (onboardingFlowIdRef.current !== flowId) return
      toast.error('Couldn’t open the agreement upload', { description: getErrorMessage(err) })
    }
  }

  const requestMove = async (target: MoveTarget, to: Stage, options: MoveOptions = {}) => {
    if (options.override) {
      if (to === 'onboarded' && options.requirementMet !== true) return openOverrideOnboarded(target)
      return setReasonState({ target, to, mode: 'override' })
    }
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
          const { target, to, mode } = reasonState
          const result = await move(target, to, reason)
          if (result === 'failed') return
          setReasonState(null)
          if (result !== 'requirement') return
          // Refused for a missing requirement (e.g. the agreement was deleted meanwhile): say so, never close silently.
          if (mode === 'override' && to === 'onboarded') {
            toast.error('Couldn’t move to Onboarded', { description: 'Upload the signed agreement first. Even an override needs it.' })
            await openOverrideOnboarded(target)
            return
          }
          toast.error(`Couldn’t move to ${STAGE_META[to].label}`, { description: 'A requirement for this stage is missing.' })
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
            onboarding.mode === 'override'
              ? 'needed to move to Onboarded, even with an override'
              : onboarding.total > 1
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
            // Override: the agreement is on file now, so ask for the override reason (the move happens on submit).
            if (onboarding.mode === 'override') return setReasonState({ target: onboarding.target, to: 'onboarded', mode: 'override' })
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
